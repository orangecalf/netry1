const { google } = require('googleapis');
const cron = require('node-cron');
const { db } = require('../db');

const SCOPES = ['https://www.googleapis.com/auth/contacts'];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback'
  );
}

function getAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

async function exchangeCode(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

// Map Google People API contact → local contact fields
function mapFromGoogle(gc) {
  const name = gc.names?.[0] || {};
  const phone = gc.phoneNumbers?.[0]?.value || null;
  const emails = gc.emailAddresses || [];
  const workEmail = emails.find(e => e.type === 'work')?.value || null;
  const personalEmail = emails.find(e => ['home', 'personal', 'other'].includes(e.type))?.value
    || (emails[0] && !workEmail ? emails[0].value : null)
    || null;
  const company = gc.organizations?.[0]?.name || null;
  const notes = gc.biographies?.[0]?.value || null;

  return {
    firstName: name.givenName || name.displayName || (workEmail || personalEmail || 'Unknown'),
    lastName: name.familyName || null,
    phone,
    workEmail,
    personalEmail,
    company,
    notes,
  };
}

// Map local contact → Google People API request body
function mapToGoogle(contact) {
  const body = { names: [{ givenName: contact.first_name, familyName: contact.last_name || '' }] };
  if (contact.phone) body.phoneNumbers = [{ value: contact.phone }];
  const emails = [];
  if (contact.work_email) emails.push({ value: contact.work_email, type: 'work' });
  if (contact.personal_email) emails.push({ value: contact.personal_email, type: 'home' });
  if (emails.length) body.emailAddresses = emails;
  if (contact.company) body.organizations = [{ name: contact.company }];
  if (contact.notes) body.biographies = [{ value: contact.notes, contentType: 'TEXT_PLAIN' }];
  return body;
}

async function getAuthClientForUser(userId) {
  const row = (await db.execute({ sql: 'SELECT * FROM google_sync WHERE user_id = ?', args: [userId] })).rows[0];
  if (!row || !row.refresh_token) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry,
  });

  // Persist refreshed tokens
  client.on('tokens', async (tokens) => {
    await db.execute({
      sql: `UPDATE google_sync SET access_token = ?, token_expiry = ? WHERE user_id = ?`,
      args: [tokens.access_token, tokens.expiry_date, userId],
    });
  });

  return client;
}

async function syncUser(userId) {
  const authClient = await getAuthClientForUser(userId);
  if (!authClient) return;

  const syncRow = (await db.execute({ sql: 'SELECT * FROM google_sync WHERE user_id = ?', args: [userId] })).rows[0];
  const people = google.people({ version: 'v1', auth: authClient });

  // ── Pull from Google ──────────────────────────────────────────────
  let googleContacts = [];
  let nextSyncToken = null;

  const listParams = {
    resourceName: 'people/me',
    pageSize: 1000,
    personFields: 'names,emailAddresses,phoneNumbers,organizations,biographies,metadata',
    requestSyncToken: true,
  };

  try {
    if (syncRow.sync_token) {
      listParams.syncToken = syncRow.sync_token;
    }
    const response = await people.people.connections.list(listParams);
    googleContacts = response.data.connections || [];
    nextSyncToken = response.data.nextSyncToken;
  } catch (err) {
    if (err.code === 410) {
      // Sync token expired — fall back to full sync
      delete listParams.syncToken;
      const response = await people.people.connections.list(listParams);
      googleContacts = response.data.connections || [];
      nextSyncToken = response.data.nextSyncToken;
    } else {
      throw err;
    }
  }

  // ── Process Google → local ────────────────────────────────────────
  for (const gc of googleContacts) {
    const resourceName = gc.resourceName;

    if (gc.metadata?.deleted) {
      await db.execute({ sql: 'DELETE FROM contacts WHERE google_resource_name = ? AND user_id = ?', args: [resourceName, userId] });
      continue;
    }

    const mapped = mapFromGoogle(gc);
    const existing = (await db.execute({
      sql: 'SELECT * FROM contacts WHERE google_resource_name = ? AND user_id = ?',
      args: [resourceName, userId],
    })).rows[0];

    if (existing) {
      // Google wins on conflict for scheduled sync
      await db.execute({
        sql: `UPDATE contacts SET first_name=?, last_name=?, phone=?, work_email=?, personal_email=?,
              company=?, notes=?, google_etag=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        args: [mapped.firstName, mapped.lastName, mapped.phone, mapped.workEmail,
               mapped.personalEmail, mapped.company, mapped.notes, gc.etag, existing.id],
      });
    } else {
      // Try to find an existing local contact to link (match by email)
      let localMatch = null;
      if (mapped.workEmail || mapped.personalEmail) {
        localMatch = (await db.execute({
          sql: `SELECT * FROM contacts WHERE user_id = ? AND google_resource_name IS NULL
                AND (work_email = ? OR personal_email = ?)`,
          args: [userId, mapped.workEmail || '', mapped.personalEmail || ''],
        })).rows[0];
      }

      if (localMatch) {
        await db.execute({
          sql: 'UPDATE contacts SET google_resource_name = ?, google_etag = ? WHERE id = ?',
          args: [resourceName, gc.etag, localMatch.id],
        });
      } else {
        await db.execute({
          sql: `INSERT INTO contacts (user_id, first_name, last_name, phone, work_email, personal_email,
                company, notes, google_resource_name, google_etag) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          args: [userId, mapped.firstName, mapped.lastName, mapped.phone, mapped.workEmail,
                 mapped.personalEmail, mapped.company, mapped.notes, resourceName, gc.etag],
        });
      }
    }
  }

  // ── Push local → Google ────────────────────────────────────────────
  // New local contacts (no Google resource yet)
  const unsynced = (await db.execute({
    sql: 'SELECT * FROM contacts WHERE user_id = ? AND google_resource_name IS NULL',
    args: [userId],
  })).rows;

  for (const contact of unsynced) {
    try {
      const result = await people.people.createContact({ requestBody: mapToGoogle(contact) });
      await db.execute({
        sql: 'UPDATE contacts SET google_resource_name = ?, google_etag = ? WHERE id = ?',
        args: [result.data.resourceName, result.data.etag, contact.id],
      });
    } catch (err) {
      console.error(`[GoogleSync] Failed to create contact ${contact.id} in Google:`, err.message);
    }
  }

  // Local contacts updated since last sync
  if (syncRow.last_synced_at) {
    const changed = (await db.execute({
      sql: `SELECT * FROM contacts WHERE user_id = ? AND google_resource_name IS NOT NULL
            AND updated_at > ?`,
      args: [userId, syncRow.last_synced_at],
    })).rows;

    for (const contact of changed) {
      try {
        const result = await people.people.updateContact({
          resourceName: contact.google_resource_name,
          updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,biographies',
          requestBody: { etag: contact.google_etag, ...mapToGoogle(contact) },
        });
        await db.execute({
          sql: 'UPDATE contacts SET google_etag = ? WHERE id = ?',
          args: [result.data.etag, contact.id],
        });
      } catch (err) {
        console.error(`[GoogleSync] Failed to update contact ${contact.id} in Google:`, err.message);
      }
    }
  }

  // ── Save sync state ────────────────────────────────────────────────
  await db.execute({
    sql: 'UPDATE google_sync SET sync_token = ?, last_synced_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    args: [nextSyncToken, userId],
  });

  console.log(`[GoogleSync] Synced user ${userId}: ${googleContacts.length} Google contacts processed, ${unsynced.length} local pushed`);
}

async function syncAllUsers() {
  const rows = (await db.execute({ sql: 'SELECT user_id FROM google_sync WHERE refresh_token IS NOT NULL', args: [] })).rows;
  for (const row of rows) {
    try {
      await syncUser(Number(row.user_id));
    } catch (err) {
      console.error(`[GoogleSync] Error syncing user ${row.user_id}:`, err.message);
    }
  }
}

function startGoogleSyncScheduler() {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    console.log('[GoogleSync] Running hourly sync...');
    syncAllUsers().catch(err => console.error('[GoogleSync] Scheduler error:', err.message));
  });
  console.log('[GoogleSync] Hourly sync scheduler started');
}

module.exports = { getAuthUrl, exchangeCode, syncUser, syncAllUsers, startGoogleSyncScheduler };
