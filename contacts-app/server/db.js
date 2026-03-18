const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const isLocal = !process.env.TURSO_DATABASE_URL;

// For local dev, ensure data directory exists
if (isLocal) {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '../data/contacts.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDb() {
  await db.executeMultiple(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      notification_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      follow_up_interval_days INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT,
      phone TEXT,
      work_email TEXT,
      personal_email TEXT,
      company TEXT,
      notes TEXT,
      last_contacted DATETIME,
      next_follow_up DATETIME,
      follow_up_once DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_categories (
      contact_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (contact_id, category_id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      contact_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATETIME,
      completed INTEGER NOT NULL DEFAULT 0,
      reminder_sent INTEGER NOT NULL DEFAULT 0,
      completion_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS follow_up_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      contacted_at DATETIME NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS google_sync (
      user_id INTEGER PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry INTEGER,
      sync_token TEXT,
      last_synced_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrations for existing databases
  try { await db.execute('ALTER TABLE contacts ADD COLUMN follow_up_once DATETIME'); } catch {}
  try { await db.execute('ALTER TABLE tasks ADD COLUMN completion_note TEXT'); } catch {}
  try { await db.execute('ALTER TABLE contacts ADD COLUMN google_resource_name TEXT'); } catch {}
  try { await db.execute('ALTER TABLE contacts ADD COLUMN google_etag TEXT'); } catch {}
}

module.exports = { db, initDb };
