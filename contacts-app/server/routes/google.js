const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { getAuthUrl, exchangeCode, syncUser } = require('../services/googleSync');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Check if Google Contacts is configured on this server
router.get('/configured', (req, res) => {
  res.json({ configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
});

// GET /api/google/status — return sync status for authenticated user
router.get('/status', async (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    const row = (await db.execute({ sql: 'SELECT last_synced_at FROM google_sync WHERE user_id = ?', args: [userId] })).rows[0];
    res.json({ connected: !!row, lastSyncedAt: row?.last_synced_at || null });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// GET /api/google/auth?state=<JWT> — start OAuth flow (browser redirect, no Bearer header)
router.get('/auth', (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).send('Missing state');
  try {
    jwt.verify(state, JWT_SECRET);
  } catch {
    return res.status(401).send('Invalid token');
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google OAuth not configured on this server');
  }
  res.redirect(getAuthUrl(state));
});

// GET /api/google/callback — OAuth callback from Google
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect(`${CLIENT_ORIGIN}/?google=error`);

  let userId;
  try {
    const payload = jwt.verify(state, JWT_SECRET);
    userId = payload.userId;
  } catch {
    return res.redirect(`${CLIENT_ORIGIN}/?google=error`);
  }

  try {
    const tokens = await exchangeCode(code);

    const existing = (await db.execute({ sql: 'SELECT user_id FROM google_sync WHERE user_id = ?', args: [userId] })).rows[0];
    if (existing) {
      await db.execute({
        sql: `UPDATE google_sync SET access_token=?, refresh_token=COALESCE(?, refresh_token), token_expiry=?, sync_token=NULL WHERE user_id=?`,
        args: [tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null, userId],
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO google_sync (user_id, access_token, refresh_token, token_expiry) VALUES (?,?,?,?)',
        args: [userId, tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null],
      });
    }

    // Kick off an initial sync in the background
    syncUser(userId).catch(err => console.error('[GoogleSync] Initial sync failed:', err.message));

    res.redirect(`${CLIENT_ORIGIN}/?google=connected`);
  } catch (err) {
    console.error('[Google OAuth] Callback error:', err.message);
    res.redirect(`${CLIENT_ORIGIN}/?google=error`);
  }
});

// POST /api/google/sync — trigger manual sync
router.post('/sync', async (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    await syncUser(userId);
    const row = (await db.execute({ sql: 'SELECT last_synced_at FROM google_sync WHERE user_id = ?', args: [userId] })).rows[0];
    res.json({ ok: true, lastSyncedAt: row?.last_synced_at || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/google/disconnect — remove Google connection
router.delete('/disconnect', async (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    await db.execute({ sql: 'DELETE FROM google_sync WHERE user_id = ?', args: [userId] });
    // Clear resource names so contacts are re-pushed if user reconnects
    await db.execute({ sql: 'UPDATE contacts SET google_resource_name = NULL, google_etag = NULL WHERE user_id = ?', args: [userId] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
