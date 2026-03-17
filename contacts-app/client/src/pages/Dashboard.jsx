import { useEffect, useState } from 'react';
import { api } from '../api';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(c) {
  return ((c.first_name || '')[0] || '') + ((c.last_name || '')[0] || '');
}

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>;
  }

  if (!data) return null;

  const { stats, overdueFollowUps, upcomingFollowUps, overdueTasks, upcomingTasks } = data;

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Dashboard</span>
      </div>

      <div className="stats-row">
        <div className="card stat-card">
          <div className="stat-value">{stats.total_contacts}</div>
          <div className="stat-label">Contacts</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{stats.open_tasks}</div>
          <div className="stat-label">Open Tasks</div>
        </div>
        <div className={`card stat-card ${stats.overdue_follow_ups > 0 ? 'stat-danger' : ''}`}>
          <div className="stat-value">{stats.overdue_follow_ups}</div>
          <div className="stat-label">Overdue Follow-ups</div>
        </div>
        <div className={`card stat-card ${stats.overdue_tasks > 0 ? 'stat-danger' : ''}`}>
          <div className="stat-value">{stats.overdue_tasks}</div>
          <div className="stat-label">Overdue Tasks</div>
        </div>
      </div>

      {overdueFollowUps.length > 0 && (
        <>
          <div className="section-label" style={{ color: 'var(--danger)' }}>Overdue Follow-ups</div>
          <div className="card" style={{ margin: '0 16px' }}>
            {overdueFollowUps.map(c => (
              <div key={c.id} className="contact-item" onClick={() => onNavigate('contacts', { contactId: c.id })}>
                <div className="avatar">{initials(c).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{c.first_name} {c.last_name || ''}</div>
                  <div className="contact-sub" style={{ color: 'var(--danger)' }}>{formatDate(c.next_follow_up)}</div>
                </div>
                <div className="overdue-dot" />
              </div>
            ))}
          </div>
        </>
      )}

      {upcomingFollowUps.length > 0 && (
        <>
          <div className="section-label">Upcoming Follow-ups (7 days)</div>
          <div className="card" style={{ margin: '0 16px' }}>
            {upcomingFollowUps.map(c => (
              <div key={c.id} className="contact-item" onClick={() => onNavigate('contacts', { contactId: c.id })}>
                <div className="avatar">{initials(c).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{c.first_name} {c.last_name || ''}</div>
                  <div className="contact-sub">{formatDate(c.next_follow_up)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {overdueTasks.length > 0 && (
        <>
          <div className="section-label" style={{ color: 'var(--danger)' }}>Overdue Tasks</div>
          <div className="card" style={{ margin: '0 16px' }}>
            {overdueTasks.map(t => (
              <div key={t.id} className="task-item" onClick={() => onNavigate('tasks')}>
                <div className="task-check" />
                <div style={{ flex: 1 }}>
                  <div className="task-title">{t.title}</div>
                  <div className="task-meta task-overdue">
                    {t.first_name ? `${t.first_name} ${t.last_name || ''} · ` : ''}{formatDate(t.due_date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {upcomingTasks.length > 0 && (
        <>
          <div className="section-label">Upcoming Tasks (7 days)</div>
          <div className="card" style={{ margin: '0 16px' }}>
            {upcomingTasks.map(t => (
              <div key={t.id} className="task-item" onClick={() => onNavigate('tasks')}>
                <div className="task-check" />
                <div style={{ flex: 1 }}>
                  <div className="task-title">{t.title}</div>
                  <div className="task-meta">
                    {t.first_name ? `${t.first_name} ${t.last_name || ''} · ` : ''}{formatDate(t.due_date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!overdueFollowUps.length && !upcomingFollowUps.length && !overdueTasks.length && !upcomingTasks.length && (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">All caught up!</div>
          <div className="empty-state-sub">No pending follow-ups or tasks due soon.</div>
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}
