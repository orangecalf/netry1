const router = require('express').Router();
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

async function getTaskWithContact(id) {
  return (await db.execute({
    sql: `SELECT t.*, c.first_name, c.last_name FROM tasks t
          LEFT JOIN contacts c ON c.id = t.contact_id
          WHERE t.id = ?`,
    args: [id],
  })).rows[0];
}

// List tasks
router.get('/', async (req, res) => {
  try {
    const { contactId, completed, overdue } = req.query;

    let sql = `SELECT t.*, c.first_name, c.last_name FROM tasks t
               LEFT JOIN contacts c ON c.id = t.contact_id
               WHERE t.user_id = ?`;
    const args = [req.user.id];

    if (contactId) { sql += ' AND t.contact_id = ?'; args.push(contactId); }
    if (completed !== undefined) { sql += ' AND t.completed = ?'; args.push(completed === 'true' ? 1 : 0); }
    if (overdue === 'true') sql += ` AND t.completed = 0 AND t.due_date IS NOT NULL AND t.due_date <= datetime('now')`;
    sql += ' ORDER BY t.due_date ASC, t.created_at DESC';

    res.json((await db.execute({ sql, args })).rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const { title, description, contactId, dueDate } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    if (contactId) {
      const contact = (await db.execute({ sql: 'SELECT id FROM contacts WHERE id = ? AND user_id = ?', args: [contactId, req.user.id] })).rows[0];
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
    }

    const result = await db.execute({
      sql: 'INSERT INTO tasks (user_id, contact_id, title, description, due_date) VALUES (?, ?, ?, ?, ?)',
      args: [req.user.id, contactId || null, title.trim(), description || null, dueDate || null],
    });

    res.status(201).json(await getTaskWithContact(Number(result.lastInsertRowid)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task
router.put('/:id', async (req, res) => {
  try {
    const task = (await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { title, description, contactId, dueDate, completed, completionNote } = req.body;

    if (contactId !== undefined && contactId !== null) {
      const contact = (await db.execute({ sql: 'SELECT id FROM contacts WHERE id = ? AND user_id = ?', args: [contactId, req.user.id] })).rows[0];
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
    }

    await db.execute({
      sql: `UPDATE tasks SET title = ?, description = ?, contact_id = ?, due_date = ?,
            completed = ?, completion_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [
        title !== undefined ? title.trim() : task.title,
        description !== undefined ? description : task.description,
        contactId !== undefined ? contactId : task.contact_id,
        dueDate !== undefined ? dueDate : task.due_date,
        completed !== undefined ? (completed ? 1 : 0) : task.completed,
        completionNote !== undefined ? completionNote : task.completion_note,
        task.id,
      ],
    });

    res.json(await getTaskWithContact(task.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const task = (await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ? AND user_id = ?', args: [req.params.id, req.user.id] })).rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });
    await db.execute({ sql: 'DELETE FROM tasks WHERE id = ?', args: [task.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
