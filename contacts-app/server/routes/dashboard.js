const router = require('express').Router();
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const [overdueFollowUps, upcomingFollowUps, overdueOnce, upcomingOnce, overdueTasks, upcomingTasks, statsRow] = await Promise.all([
      db.execute({
        sql: `SELECT c.*, GROUP_CONCAT(cat.name) as category_names
              FROM contacts c
              LEFT JOIN contact_categories cc ON cc.contact_id = c.id
              LEFT JOIN categories cat ON cat.id = cc.category_id
              WHERE c.user_id = ? AND c.next_follow_up IS NOT NULL AND c.next_follow_up <= datetime('now')
              GROUP BY c.id ORDER BY c.next_follow_up ASC LIMIT 20`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT c.*, GROUP_CONCAT(cat.name) as category_names
              FROM contacts c
              LEFT JOIN contact_categories cc ON cc.contact_id = c.id
              LEFT JOIN categories cat ON cat.id = cc.category_id
              WHERE c.user_id = ? AND c.next_follow_up > datetime('now')
                AND c.next_follow_up <= datetime('now', '+7 days')
              GROUP BY c.id ORDER BY c.next_follow_up ASC LIMIT 20`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT c.*, GROUP_CONCAT(cat.name) as category_names
              FROM contacts c
              LEFT JOIN contact_categories cc ON cc.contact_id = c.id
              LEFT JOIN categories cat ON cat.id = cc.category_id
              WHERE c.user_id = ? AND c.follow_up_once IS NOT NULL AND c.follow_up_once <= datetime('now')
              GROUP BY c.id ORDER BY c.follow_up_once ASC LIMIT 20`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT c.*, GROUP_CONCAT(cat.name) as category_names
              FROM contacts c
              LEFT JOIN contact_categories cc ON cc.contact_id = c.id
              LEFT JOIN categories cat ON cat.id = cc.category_id
              WHERE c.user_id = ? AND c.follow_up_once > datetime('now')
                AND c.follow_up_once <= datetime('now', '+7 days')
              GROUP BY c.id ORDER BY c.follow_up_once ASC LIMIT 20`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT t.*, c.first_name, c.last_name FROM tasks t
              LEFT JOIN contacts c ON c.id = t.contact_id
              WHERE t.user_id = ? AND t.completed = 0
                AND t.due_date IS NOT NULL AND t.due_date <= datetime('now')
              ORDER BY t.due_date ASC LIMIT 20`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT t.*, c.first_name, c.last_name FROM tasks t
              LEFT JOIN contacts c ON c.id = t.contact_id
              WHERE t.user_id = ? AND t.completed = 0
                AND t.due_date > datetime('now')
                AND t.due_date <= datetime('now', '+7 days')
              ORDER BY t.due_date ASC LIMIT 20`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT
                (SELECT COUNT(*) FROM contacts WHERE user_id = ?) as total_contacts,
                (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND completed = 0) as open_tasks,
                (SELECT COUNT(*) FROM contacts WHERE user_id = ? AND (
                  (next_follow_up IS NOT NULL AND next_follow_up <= datetime('now')) OR
                  (follow_up_once IS NOT NULL AND follow_up_once <= datetime('now'))
                )) as overdue_follow_ups,
                (SELECT COUNT(*) FROM tasks WHERE user_id = ? AND completed = 0 AND due_date <= datetime('now')) as overdue_tasks`,
        args: [userId, userId, userId, userId],
      }),
    ]);

    res.json({
      overdueFollowUps: overdueFollowUps.rows,
      upcomingFollowUps: upcomingFollowUps.rows,
      overdueOnce: overdueOnce.rows,
      upcomingOnce: upcomingOnce.rows,
      overdueTasks: overdueTasks.rows,
      upcomingTasks: upcomingTasks.rows,
      stats: statsRow.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
