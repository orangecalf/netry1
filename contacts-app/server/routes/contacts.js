const router = require('express').Router();
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { parseVCards, contactsToVCard } = require('../services/vcard');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

function getContactWithCategories(id) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!contact) return null;
  contact.categories = db.prepare(`
    SELECT cat.* FROM categories cat
    JOIN contact_categories cc ON cc.category_id = cat.id
    WHERE cc.contact_id = ?
  `).all(id);
  return contact;
}

// List contacts (with search + category filter)
router.get('/', (req, res) => {
  const { search, category, overdue } = req.query;

  let query = `
    SELECT DISTINCT c.* FROM contacts c
    LEFT JOIN contact_categories cc ON cc.contact_id = c.id
    LEFT JOIN categories cat ON cat.id = cc.category_id
    WHERE c.user_id = ?
  `;
  const params = [req.user.id];

  if (search) {
    query += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.work_email LIKE ? OR c.personal_email LIKE ? OR c.phone LIKE ? OR c.company LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }

  if (category) {
    query += ` AND cat.id = ?`;
    params.push(category);
  }

  if (overdue === 'true') {
    query += ` AND c.next_follow_up IS NOT NULL AND c.next_follow_up <= datetime('now')`;
  }

  query += ` ORDER BY c.first_name, c.last_name`;

  const contacts = db.prepare(query).all(...params);

  // Attach categories to each contact
  const catStmt = db.prepare(`
    SELECT cat.* FROM categories cat
    JOIN contact_categories cc ON cc.category_id = cat.id
    WHERE cc.contact_id = ?
  `);

  for (const c of contacts) {
    c.categories = catStmt.all(c.id);
  }

  res.json(contacts);
});

// Get single contact
router.get('/:id', (req, res) => {
  const contact = getContactWithCategories(req.params.id);
  if (!contact || contact.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  res.json(contact);
});

// Create contact
router.post('/', (req, res) => {
  const { firstName, lastName, phone, workEmail, personalEmail, company, notes, categoryIds } = req.body;

  if (!firstName) return res.status(400).json({ error: 'firstName is required' });

  const result = db.prepare(`
    INSERT INTO contacts (user_id, first_name, last_name, phone, work_email, personal_email, company, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, firstName.trim(), lastName || null, phone || null, workEmail || null, personalEmail || null, company || null, notes || null);

  const id = result.lastInsertRowid;

  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    const insertCat = db.prepare('INSERT OR IGNORE INTO contact_categories (contact_id, category_id) VALUES (?, ?)');
    for (const catId of categoryIds) {
      const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(catId, req.user.id);
      if (cat) insertCat.run(id, catId);
    }
    // Set next follow-up based on lowest interval among assigned categories
    setNextFollowUp(id);
  }

  res.status(201).json(getContactWithCategories(id));
});

// Update contact
router.put('/:id', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const { firstName, lastName, phone, workEmail, personalEmail, company, notes, categoryIds } = req.body;

  db.prepare(`
    UPDATE contacts SET
      first_name = ?, last_name = ?, phone = ?, work_email = ?, personal_email = ?,
      company = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    firstName !== undefined ? firstName.trim() : contact.first_name,
    lastName !== undefined ? lastName : contact.last_name,
    phone !== undefined ? phone : contact.phone,
    workEmail !== undefined ? workEmail : contact.work_email,
    personalEmail !== undefined ? personalEmail : contact.personal_email,
    company !== undefined ? company : contact.company,
    notes !== undefined ? notes : contact.notes,
    contact.id
  );

  if (Array.isArray(categoryIds)) {
    db.prepare('DELETE FROM contact_categories WHERE contact_id = ?').run(contact.id);
    const insertCat = db.prepare('INSERT OR IGNORE INTO contact_categories (contact_id, category_id) VALUES (?, ?)');
    for (const catId of categoryIds) {
      const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(catId, req.user.id);
      if (cat) insertCat.run(contact.id, catId);
    }
    setNextFollowUp(contact.id);
  }

  res.json(getContactWithCategories(contact.id));
});

// Delete contact
router.delete('/:id', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  db.prepare('DELETE FROM contacts WHERE id = ?').run(contact.id);
  res.json({ ok: true });
});

// Log a contact interaction (mark as contacted now)
router.post('/:id/log-contact', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const { notes } = req.body;
  const now = new Date().toISOString();

  db.prepare('INSERT INTO follow_up_logs (contact_id, user_id, contacted_at, notes) VALUES (?, ?, ?, ?)')
    .run(contact.id, req.user.id, now, notes || null);

  db.prepare('UPDATE contacts SET last_contacted = ?, follow_up_once = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(now, contact.id);

  // Recalculate next follow-up
  setNextFollowUp(contact.id);

  res.json(getContactWithCategories(contact.id));
});

// Set or clear a one-time follow-up date
router.put('/:id/follow-up-once', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const { date } = req.body;
  db.prepare('UPDATE contacts SET follow_up_once = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(date || null, contact.id);

  res.json(getContactWithCategories(contact.id));
});

// Import vCard
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const content = req.file.buffer.toString('utf-8');
  const parsed = parseVCards(content);

  const insertContact = db.prepare(`
    INSERT INTO contacts (user_id, first_name, last_name, phone, work_email, personal_email, company)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  const importMany = db.transaction((cards) => {
    for (const card of cards) {
      try {
        insertContact.run(req.user.id, card.firstName, card.lastName, card.phone, card.workEmail, card.personalEmail, card.company);
        imported++;
      } catch {
        // Skip duplicates/errors
      }
    }
  });

  importMany(parsed);
  res.json({ imported, total: parsed.length });
});

// Export vCard
router.get('/export', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts WHERE user_id = ?').all(req.user.id);
  const vcard = contactsToVCard(contacts);

  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.vcf"');
  res.send(vcard);
});

// Get follow-up history for a contact
router.get('/:id/logs', (req, res) => {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const logs = db.prepare('SELECT * FROM follow_up_logs WHERE contact_id = ? ORDER BY contacted_at DESC').all(contact.id);
  res.json(logs);
});

function setNextFollowUp(contactId) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return;

  const cats = db.prepare(`
    SELECT cat.follow_up_interval_days FROM categories cat
    JOIN contact_categories cc ON cc.category_id = cat.id
    WHERE cc.contact_id = ? AND cat.follow_up_interval_days IS NOT NULL
    ORDER BY cat.follow_up_interval_days ASC
    LIMIT 1
  `).get(contactId);

  if (!cats) {
    db.prepare('UPDATE contacts SET next_follow_up = NULL WHERE id = ?').run(contactId);
    return;
  }

  const base = contact.last_contacted ? new Date(contact.last_contacted) : new Date(contact.created_at);
  const next = new Date(base);
  next.setDate(next.getDate() + cats.follow_up_interval_days);
  db.prepare('UPDATE contacts SET next_follow_up = ? WHERE id = ?').run(next.toISOString(), contactId);
}

module.exports = router;
