const router = require('express').Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function getTaskWithContact(id) {
  return db.prepare(`
    SELECT t.*, c.first_name, c.last_name FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.id = ?
  `).get(id);
}

// List tasks
router.get('/', (req, res) => {
  const { contactId, completed, overdue } = req.query;

  let query = `
    SELECT t.*, c.first_name, c.last_name FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.user_id = ?
  `;
  const params = [req.user.id];

  if (contactId) {
    query += ' AND t.contact_id = ?';
    params.push(contactId);
  }

  if (completed !== undefined) {
    query += ' AND t.completed = ?';
    params.push(completed === 'true' ? 1 : 0);
  }

  if (overdue === 'true') {
    query += ` AND t.completed = 0 AND t.due_date IS NOT NULL AND t.due_date <= datetime('now')`;
  }

  query += ' ORDER BY t.due_date ASC, t.created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// Create task
router.post('/', (req, res) => {
  const { title, description, contactId, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  // Verify contact belongs to user if provided
  if (contactId) {
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(contactId, req.user.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
  }

  const result = db.prepare(`
    INSERT INTO tasks (user_id, contact_id, title, description, due_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, contactId || null, title.trim(), description || null, dueDate || null);

  res.status(201).json(getTaskWithContact(result.lastInsertRowid));
});

// Update task
router.put('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, contactId, dueDate, completed } = req.body;

  if (contactId !== undefined && contactId !== null) {
    const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?').get(contactId, req.user.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
  }

  db.prepare(`
    UPDATE tasks SET
      title = ?, description = ?, contact_id = ?, due_date = ?,
      completed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title !== undefined ? title.trim() : task.title,
    description !== undefined ? description : task.description,
    contactId !== undefined ? contactId : task.contact_id,
    dueDate !== undefined ? dueDate : task.due_date,
    completed !== undefined ? (completed ? 1 : 0) : task.completed,
    task.id
  );

  res.json(getTaskWithContact(task.id));
});

// Delete task
router.delete('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  res.json({ ok: true });
});

module.exports = router;
