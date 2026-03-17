const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authenticate } = require('../middleware/auth');

// Register
router.post('/register', (req, res) => {
  const { username, email, password, notificationEmail } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already taken' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, notification_email) VALUES (?, ?, ?, ?)'
  ).run(username, email, hash, notificationEmail || email);

  const token = signToken(result.lastInsertRowid, username);
  res.status(201).json({ token, username, email });
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user.id, user.username);
  res.json({ token, username: user.username, email: user.email });
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, email, notification_email, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Update notification email
router.patch('/me', authenticate, (req, res) => {
  const { notificationEmail } = req.body;
  db.prepare('UPDATE users SET notification_email = ? WHERE id = ?').run(notificationEmail, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
