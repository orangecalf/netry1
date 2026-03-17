const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('../db');

// Configure transporter via environment variables
// For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com, SMTP_PASS=app-password
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendReminderEmail(to, subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[Reminders] Email not configured. Would send to ${to}: ${subject}`);
    return;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    console.log(`[Reminders] Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[Reminders] Failed to send email:`, err.message);
  }
}

function formatDate(isoStr) {
  if (!isoStr) return 'N/A';
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function processFollowUpReminders() {
  // Get all contacts due for follow-up that haven't been reminded today
  const overdueContacts = db.prepare(`
    SELECT c.*, u.notification_email, u.username
    FROM contacts c
    JOIN users u ON u.id = c.user_id
    WHERE c.next_follow_up IS NOT NULL
      AND c.next_follow_up <= datetime('now')
      AND u.notification_email IS NOT NULL
  `).all();

  // Group by user
  const byUser = {};
  for (const row of overdueContacts) {
    if (!byUser[row.user_id]) {
      byUser[row.user_id] = { email: row.notification_email, username: row.username, contacts: [] };
    }
    byUser[row.user_id].contacts.push(row);
  }

  for (const [, data] of Object.entries(byUser)) {
    if (!data.contacts.length) continue;

    const contactRows = data.contacts.map(c => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${c.first_name} ${c.last_name || ''}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${c.phone || '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${c.work_email || c.personal_email || '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${formatDate(c.next_follow_up)}</td>
      </tr>
    `).join('');

    const html = `
      <h2 style="color:#6366f1">Contact Follow-Up Reminders</h2>
      <p>Hi ${data.username}, you have ${data.contacts.length} contact(s) due for follow-up:</p>
      <table style="width:100%;border-collapse:collapse;font-family:sans-serif">
        <thead>
          <tr style="background:#6366f1;color:#fff">
            <th style="padding:8px;text-align:left">Name</th>
            <th style="padding:8px;text-align:left">Phone</th>
            <th style="padding:8px;text-align:left">Email</th>
            <th style="padding:8px;text-align:left">Due Date</th>
          </tr>
        </thead>
        <tbody>${contactRows}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin-top:20px">Log in to your contact manager to update these contacts.</p>
    `;

    await sendReminderEmail(data.email, `Follow-up reminder: ${data.contacts.length} contact(s) overdue`, html);
  }
}

async function processTaskReminders() {
  // Find tasks due within 24 hours that haven't had a reminder sent
  const dueTasks = db.prepare(`
    SELECT t.*, u.notification_email, u.username, c.first_name, c.last_name
    FROM tasks t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.completed = 0
      AND t.reminder_sent = 0
      AND t.due_date IS NOT NULL
      AND t.due_date <= datetime('now', '+1 day')
      AND t.due_date > datetime('now', '-1 hour')
      AND u.notification_email IS NOT NULL
  `).all();

  // Group by user
  const byUser = {};
  for (const row of dueTasks) {
    if (!byUser[row.user_id]) {
      byUser[row.user_id] = { email: row.notification_email, username: row.username, tasks: [] };
    }
    byUser[row.user_id].tasks.push(row);
  }

  for (const [, data] of Object.entries(byUser)) {
    if (!data.tasks.length) continue;

    const taskRows = data.tasks.map(t => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${t.title}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${t.first_name ? `${t.first_name} ${t.last_name || ''}` : '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${formatDate(t.due_date)}</td>
      </tr>
    `).join('');

    const html = `
      <h2 style="color:#6366f1">Task Reminders</h2>
      <p>Hi ${data.username}, you have ${data.tasks.length} task(s) due soon:</p>
      <table style="width:100%;border-collapse:collapse;font-family:sans-serif">
        <thead>
          <tr style="background:#6366f1;color:#fff">
            <th style="padding:8px;text-align:left">Task</th>
            <th style="padding:8px;text-align:left">Contact</th>
            <th style="padding:8px;text-align:left">Due Date</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
    `;

    await sendReminderEmail(data.email, `Task reminder: ${data.tasks.length} task(s) due soon`, html);

    // Mark reminders as sent
    const markSent = db.prepare('UPDATE tasks SET reminder_sent = 1 WHERE id = ?');
    for (const t of data.tasks) {
      markSent.run(t.id);
    }
  }
}

function startReminderScheduler() {
  // Run every morning at 8am
  cron.schedule('0 8 * * *', async () => {
    console.log('[Reminders] Running daily reminder check...');
    await processFollowUpReminders();
    await processTaskReminders();
  });

  // Also check task reminders every hour for near-due tasks
  cron.schedule('0 * * * *', async () => {
    await processTaskReminders();
  });

  console.log('[Reminders] Scheduler started (daily at 8am + hourly task checks)');
}

module.exports = { startReminderScheduler };
