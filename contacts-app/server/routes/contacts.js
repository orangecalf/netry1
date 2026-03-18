const router = require('express').Router();
const multer = require('multer');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { parseVCards, contactsToVCard } = require('../services/vcard');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

async function getContactWithCategories(id) {
  const contact = (await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ?', args: [id] })).rows[0];
  if (!contact) return null;
  contact.categories = (await db.execute({
    sql: `SELECT cat.* FROM categories cat
          JOIN contact_categories cc ON cc.category_id = cat.id
          WHERE cc.contact_id = ?`,
    args: [id],
  })).rows;
  return contact;
}

async function setNextFollowUp(contactId) {
  const contact = (await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ?', args: [contactId] })).rows[0];
  if (!contact) return;

  const cats = (await db.execute({
    sql: `SELECT cat.follow_up_interval_days FROM categories cat
          JOIN contact_categories cc ON cc.category_id = cat.id
          WHERE cc.contact_id = ? AND cat.follow_up_interval_days IS NOT NULL
          ORDER BY cat.follow_up_interval_days ASC LIMIT 1`,
    args: [contactId],
  })).rows[0];

  if (!cats) {
    await db.execute({ sql: 'UPDATE contacts SET next_follow_up = NULL WHERE id = ?', args: [contactId] });
    return;
  }

  const base = contact.last_contacted ? new Date(contact.last_contacted) : new Date(contact.created_at);
  const next = new Date(base);
  next.setDate(next.getDate() + cats.follow_up_interval_days);
  await db.execute({ sql: 'UPDATE contacts SET next_follow_up = ? WHERE id = ?', args: [next.toISOString(), contactId] });
}

// List contacts
router.get('/', async (req, res) => {
  try {
    const { search, category, overdue } = req.query;

    let sql = `SELECT DISTINCT c.* FROM contacts c
               LEFT JOIN contact_categories cc ON cc.contact_id = c.id
               LEFT JOIN categories cat ON cat.id = cc.category_id
               WHERE c.user_id = ?`;
    const args = [req.user.id];

    if (search) {
      sql += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.work_email LIKE ? OR c.personal_email LIKE ? OR c.phone LIKE ? OR c.company LIKE ?)`;
      const s = `%${search}%`;
      args.push(s, s, s, s, s, s);
    }
    if (category) { sql += ' AND cat.id = ?'; args.push(category); }
    if (overdue === 'true') sql += ` AND c.next_follow_up IS NOT NULL AND c.next_follow_up <= datetime('now')`;
    sql += ' ORDER BY c.first_name, c.last_name';

    const contacts = (await db.execute({ sql, args })).rows;

    for (const c of contacts) {
      c.categories = (await db.execute({
        sql: `SELECT cat.* FROM categories cat JOIN contact_categories cc ON cc.category_id = cat.id WHERE cc.contact_id = ?`,
        args: [c.id],
      })).rows;
    }

    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single contact
router.get('/:id', async (req, res) => {
  try {
    const contact = await getContactWithCategories(req.params.id);
    if (!contact || Number(contact.user_id) !== req.user.id)
      return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create contact
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, phone, workEmail, personalEmail, company, notes, categoryIds } = req.body;
    if (!firstName) return res.status(400).json({ error: 'firstName is required' });

    const result = await db.execute({
      sql: 'INSERT INTO contacts (user_id, first_name, last_name, phone, work_email, personal_email, company, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [req.user.id, firstName.trim(), lastName || null, phone || null, workEmail || null, personalEmail || null, company || null, notes || null],
    });

    const id = Number(result.lastInsertRowid);

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      for (const catId of categoryIds) {
        const cat = (await db.execute({ sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?', args: [catId, req.user.id] })).rows[0];
        if (cat) await db.execute({ sql: 'INSERT OR IGNORE INTO contact_categories (contact_id, category_id) VALUES (?, ?)', args: [id, catId] });
      }
      await setNextFollowUp(id);
    }

    res.status(201).json(await getContactWithCategories(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update contact
router.put('/:id', async (req, res) => {
  try {
    const contact = (await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { firstName, lastName, phone, workEmail, personalEmail, company, notes, categoryIds } = req.body;

    await db.execute({
      sql: `UPDATE contacts SET first_name = ?, last_name = ?, phone = ?, work_email = ?, personal_email = ?,
            company = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [
        firstName !== undefined ? firstName.trim() : contact.first_name,
        lastName !== undefined ? lastName : contact.last_name,
        phone !== undefined ? phone : contact.phone,
        workEmail !== undefined ? workEmail : contact.work_email,
        personalEmail !== undefined ? personalEmail : contact.personal_email,
        company !== undefined ? company : contact.company,
        notes !== undefined ? notes : contact.notes,
        contact.id,
      ],
    });

    if (Array.isArray(categoryIds)) {
      await db.execute({ sql: 'DELETE FROM contact_categories WHERE contact_id = ?', args: [contact.id] });
      for (const catId of categoryIds) {
        const cat = (await db.execute({ sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?', args: [catId, req.user.id] })).rows[0];
        if (cat) await db.execute({ sql: 'INSERT OR IGNORE INTO contact_categories (contact_id, category_id) VALUES (?, ?)', args: [contact.id, catId] });
      }
      await setNextFollowUp(contact.id);
    }

    res.json(await getContactWithCategories(contact.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const contact = (await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    await db.execute({ sql: 'DELETE FROM contacts WHERE id = ?', args: [contact.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log a contact interaction
router.post('/:id/log-contact', async (req, res) => {
  try {
    const contact = (await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { notes } = req.body;
    const now = new Date().toISOString();

    await db.execute({ sql: 'INSERT INTO follow_up_logs (contact_id, user_id, contacted_at, notes) VALUES (?, ?, ?, ?)', args: [contact.id, req.user.id, now, notes || null] });
    await db.execute({ sql: 'UPDATE contacts SET last_contacted = ?, follow_up_once = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [now, contact.id] });
    await setNextFollowUp(contact.id);

    res.json(await getContactWithCategories(contact.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set or clear a one-time follow-up date
router.put('/:id/follow-up-once', async (req, res) => {
  try {
    const contact = (await db.execute({ sql: 'SELECT * FROM contacts WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { date } = req.body;
    await db.execute({ sql: 'UPDATE contacts SET follow_up_once = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', args: [date || null, contact.id] });
    res.json(await getContactWithCategories(contact.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import vCard
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const content = req.file.buffer.toString('utf-8');
  const parsed = parseVCards(content);

  let imported = 0;
  for (const card of parsed) {
    try {
      await db.execute({
        sql: 'INSERT INTO contacts (user_id, first_name, last_name, phone, work_email, personal_email, company) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [req.user.id, card.firstName, card.lastName, card.phone, card.workEmail, card.personalEmail, card.company],
      });
      imported++;
    } catch {
      // Skip duplicates/errors
    }
  }

  res.json({ imported, total: parsed.length });
});

// Export vCard
router.get('/export', async (req, res) => {
  try {
    const contacts = (await db.execute({ sql: 'SELECT * FROM contacts WHERE user_id = ?', args: [req.user.id] })).rows;
    const vcard = contactsToVCard(contacts);
    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts.vcf"');
    res.send(vcard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get follow-up history for a contact
router.get('/:id/logs', async (req, res) => {
  try {
    const contact = (await db.execute({ sql: 'SELECT id FROM contacts WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    const logs = (await db.execute({ sql: 'SELECT * FROM follow_up_logs WHERE contact_id = ? ORDER BY contacted_at DESC', args: [contact.id] })).rows;
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
