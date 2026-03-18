const router = require('express').Router();
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// List categories
router.get('/', async (req, res) => {
  try {
    const rows = (await db.execute({
      sql: `SELECT c.*, COUNT(cc.contact_id) as contact_count
            FROM categories c
            LEFT JOIN contact_categories cc ON cc.category_id = c.id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.name`,
      args: [req.user.id],
    })).rows;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create category
router.post('/', async (req, res) => {
  try {
    const { name, color, followUpIntervalDays } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await db.execute({
      sql: 'INSERT INTO categories (user_id, name, color, follow_up_interval_days) VALUES (?, ?, ?, ?)',
      args: [req.user.id, name.trim(), color || '#6366f1', followUpIntervalDays || null],
    });

    const cat = (await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    res.status(201).json(cat);
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) return res.status(409).json({ error: 'Category name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// Update category
router.put('/:id', async (req, res) => {
  try {
    const { name, color, followUpIntervalDays } = req.body;
    const cat = (await db.execute({ sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    await db.execute({
      sql: 'UPDATE categories SET name = ?, color = ?, follow_up_interval_days = ? WHERE id = ?',
      args: [
        name !== undefined ? name.trim() : cat.name,
        color !== undefined ? color : cat.color,
        followUpIntervalDays !== undefined ? followUpIntervalDays : cat.follow_up_interval_days,
        cat.id,
      ],
    });

    if (followUpIntervalDays !== undefined) {
      const contacts = (await db.execute({
        sql: `SELECT c.id, c.last_contacted FROM contacts c
              JOIN contact_categories cc ON cc.contact_id = c.id
              WHERE cc.category_id = ?`,
        args: [cat.id],
      })).rows;

      for (const contact of contacts) {
        if (contact.last_contacted && followUpIntervalDays) {
          const next = new Date(contact.last_contacted);
          next.setDate(next.getDate() + followUpIntervalDays);
          await db.execute({ sql: 'UPDATE contacts SET next_follow_up = ? WHERE id = ?', args: [next.toISOString(), contact.id] });
        }
      }
    }

    const updated = (await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [cat.id] })).rows[0];
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    const cat = (await db.execute({ sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [cat.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
