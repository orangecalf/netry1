const router = require('express').Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const userId = req.user.id;

  const overdueFollowUps = db.prepare(`
    SELECT c.*, GROUP_CONCAT(cat.name) as category_names
    FROM contacts c
    LEFT JOIN contact_categories cc ON cc.contact_id = c.id
    LEFT JOIN categories cat ON cat.id = cc.category_id
    WHERE c.user_id = ? AND c.next_follow_up IS NOT NULL AND c.next_follow_up <= datetime('now')
    GROUP BY c.id
    ORDER BY c.next_follow_up ASC
    LIMIT 20
  `).all(userId);

  const upcomingFollowUps = db.prepare(`
    SELECT c.*, GROUP_CONCAT(cat.name) as category_names
    FROM contacts c
    LEFT JOIN contact_categories cc ON cc.contact_id = c.id
    LEFT JOIN categories cat ON cat.id = cc.category_id
    WHERE c.user_id = ? AND c.next_follow_up > datetime('now')
      AND c.next_follow_up <= datetime('now', '+7 days')
    GROUP BY c.id
    ORDER BY c.next_follow_up ASC
    LIMIT 20
  `).all(userId);

  const overdueTasks = db.prepare(`
    SELECT t.*, c.first_name, c.last_name FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.user_id = ? AND t.completed = 0
      AND t.due_date IS NOT NULL AND t.due_date <= datetime('now')
    ORDER BY t.due_date ASC
    LIMIT 20
  `).all(userId);

  const upcomingTasks = db.prepare(`
    SELECT t.*, c.first_name, c.last_name FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.user_id = ? AND t.completed = 0
      AND t.due_date > datetime('now')
      AND t.due_date <= datetime('now', '+7 days')
    ORDER BY t.due_date ASC
    LIMIT 20
  `).all(userId);

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM contacts WHERE user_id = ?) as total_contacts,
      (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND completed = 0) as open_tasks,
      (SELECT COUNT(*) FROM contacts WHERE user_id = ? AND next_follow_up <= datetime('now') AND next_follow_up IS NOT NULL) as overdue_follow_ups,
      (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND completed = 0 AND due_date <= datetime('now')) as overdue_tasks
  `).get(userId, userId, userId, userId);

  res.json({ overdueFollowUps, upcomingFollowUps, overdueTasks, upcomingTasks, stats });
});

module.exports = router;
