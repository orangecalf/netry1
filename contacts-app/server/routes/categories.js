const router = require('express').Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// List categories
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(cc.contact_id) as contact_count
    FROM categories c
    LEFT JOIN contact_categories cc ON cc.category_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.name
  `).all(req.user.id);
  res.json(rows);
});

// Create category
router.post('/', (req, res) => {
  const { name, color, followUpIntervalDays } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const result = db.prepare(
      'INSERT INTO categories (user_id, name, color, follow_up_interval_days) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, name.trim(), color || '#6366f1', followUpIntervalDays || null);

    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    throw err;
  }
});

// Update category
router.put('/:id', (req, res) => {
  const { name, color, followUpIntervalDays } = req.body;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  db.prepare(
    'UPDATE categories SET name = ?, color = ?, follow_up_interval_days = ? WHERE id = ?'
  ).run(
    name !== undefined ? name.trim() : cat.name,
    color !== undefined ? color : cat.color,
    followUpIntervalDays !== undefined ? followUpIntervalDays : cat.follow_up_interval_days,
    cat.id
  );

  // If interval changed, recalculate next_follow_up for all contacts in this category
  if (followUpIntervalDays !== undefined) {
    const contacts = db.prepare(`
      SELECT c.id, c.last_contacted FROM contacts c
      JOIN contact_categories cc ON cc.contact_id = c.id
      WHERE cc.category_id = ?
    `).all(cat.id);

    const updateStmt = db.prepare('UPDATE contacts SET next_follow_up = ? WHERE id = ?');
    for (const contact of contacts) {
      if (contact.last_contacted && followUpIntervalDays) {
        const next = new Date(contact.last_contacted);
        next.setDate(next.getDate() + followUpIntervalDays);
        updateStmt.run(next.toISOString(), contact.id);
      }
    }
  }

  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id));
});

// Delete category
router.delete('/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  res.json({ ok: true });
});

module.exports = router;
