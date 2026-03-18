require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.CLIENT_ORIGIN || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/google', require('./routes/google'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

async function start() {
  await initDb();

  const { startReminderScheduler } = require('./services/reminders');
  startReminderScheduler();

  const { startGoogleSyncScheduler } = require('./services/googleSync');
  startGoogleSyncScheduler();

  app.listen(PORT, () => {
    console.log(`Contact Manager API running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
