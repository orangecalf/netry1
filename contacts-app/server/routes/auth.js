const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signToken, authenticate } = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, notificationEmail } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'username, email, and password are required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = (await db.execute({ sql: 'SELECT id FROM users WHERE username = ? OR email = ?', args: [username, email] })).rows[0];
    if (existing) return res.status(409).json({ error: 'Username or email already taken' });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.execute({
      sql: 'INSERT INTO users (username, email, password_hash, notification_email) VALUES (?, ?, ?, ?)',
      args: [username, email, hash, notificationEmail || email],
    });

    const token = signToken(Number(result.lastInsertRowid), username);
    res.status(201).json({ token, username, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password are required' });

    const user = (await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] })).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(Number(user.id), user.username);
    res.json({ token, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = (await db.execute({
      sql: 'SELECT id, username, email, notification_email, created_at FROM users WHERE id = ?',
      args: [req.user.id],
    })).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update notification email
router.patch('/me', authenticate, async (req, res) => {
  try {
    const { notificationEmail } = req.body;
    await db.execute({ sql: 'UPDATE users SET notification_email = ? WHERE id = ?', args: [notificationEmail, req.user.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
