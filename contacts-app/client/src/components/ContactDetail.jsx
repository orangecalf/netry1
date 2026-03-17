import { useState, useEffect } from 'react';
import { api } from '../api';
import { PhoneIcon, MailIcon, CloseIcon, EditIcon, TrashIcon } from './Icons';
import TaskForm from './TaskForm';

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(iso) {
  return iso && new Date(iso) <= new Date();
}

export default function ContactDetail({ contactId, onClose, onEdit, onDelete, showToast }) {
  const [contact, setContact] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [logNote, setLogNote] = useState('');
  const [showLogForm, setShowLogForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getContact(contactId),
      api.getContactLogs(contactId),
      api.getTasks({ contactId }),
    ]).then(([c, l, t]) => {
      setContact(c);
      setLogs(l);
      setTasks(t);
    }).finally(() => setLoading(false));
  }, [contactId]);

  async function handleLogContact() {
    setLogging(true);
    try {
      const updated = await api.logContact(contact.id, logNote);
      setContact(updated);
      const newLogs = await api.getContactLogs(contact.id);
      setLogs(newLogs);
      setLogNote('');
      setShowLogForm(false);
      showToast('Contact logged!');
    } catch (err) {
      showToast(err.message);
    } finally {
      setLogging(false);
    }
  }

  async function toggleTask(task) {
    const updated = await api.updateTask(task.id, { completed: !task.completed });
    setTasks(ts => ts.map(t => t.id === task.id ? updated : t));
  }

  if (loading) return (
    <div className="modal-overlay">
      <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <span style={{ color: 'var(--muted)' }}>Loading...</span>
      </div>
    </div>
  );

  if (!contact) return null;

  const overdue = isOverdue(contact.next_follow_up);

  return (
    <>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
                {((contact.first_name || '')[0] || '').toUpperCase()}{((contact.last_name || '')[0] || '').toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{contact.first_name} {contact.last_name || ''}</div>
                {contact.company && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{contact.company}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-ghost" onClick={() => onEdit(contact)} style={{ padding: 6 }}><EditIcon size={18} /></button>
              <button className="btn-ghost" onClick={() => onDelete(contact)} style={{ padding: 6, color: 'var(--danger)' }}><TrashIcon size={18} /></button>
              <button className="btn-ghost" onClick={onClose} style={{ padding: 6 }}><CloseIcon size={20} /></button>
            </div>
          </div>

          {/* Categories */}
          {contact.categories?.length > 0 && (
            <div className="tag-row" style={{ marginBottom: 12 }}>
              {contact.categories.map(cat => (
                <span key={cat.id} className="category-chip" style={{ background: cat.color, color: '#fff', borderColor: cat.color }}>
                  {cat.name}
                </span>
              ))}
            </div>
          )}

          {/* Contact details */}
          <div style={{ marginBottom: 12 }}>
            {contact.phone && (
              <div className="detail-row">
                <span className="detail-label"><PhoneIcon /> Phone</span>
                <span className="detail-value"><a href={`tel:${contact.phone}`}>{contact.phone}</a></span>
              </div>
            )}
            {contact.work_email && (
              <div className="detail-row">
                <span className="detail-label"><MailIcon /> Work</span>
                <span className="detail-value"><a href={`mailto:${contact.work_email}`}>{contact.work_email}</a></span>
              </div>
            )}
            {contact.personal_email && (
              <div className="detail-row">
                <span className="detail-label"><MailIcon /> Personal</span>
                <span className="detail-value"><a href={`mailto:${contact.personal_email}`}>{contact.personal_email}</a></span>
              </div>
            )}
            {contact.next_follow_up && (
              <div className="detail-row">
                <span className="detail-label">Follow-up</span>
                <span className="detail-value" style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 500 }}>
                  {overdue ? '⚠️ ' : ''}{formatDate(contact.next_follow_up)}
                </span>
              </div>
            )}
            {contact.last_contacted && (
              <div className="detail-row">
                <span className="detail-label">Last contact</span>
                <span className="detail-value">{formatDate(contact.last_contacted)}</span>
              </div>
            )}
            {contact.notes && (
              <div className="detail-row">
                <span className="detail-label">Notes</span>
                <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{contact.notes}</span>
              </div>
            )}
          </div>

          {/* Log contact button */}
          {!showLogForm ? (
            <button className="btn-primary" onClick={() => setShowLogForm(true)} style={{ width: '100%', marginBottom: 12 }}>
              ✓ Mark as Contacted
            </button>
          ) : (
            <div style={{ marginBottom: 12, background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <label>Notes for this interaction (optional)</label>
              <textarea value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="What did you discuss?" rows={2} style={{ marginTop: 4 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => setShowLogForm(false)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn-primary" onClick={handleLogContact} disabled={logging} style={{ flex: 1 }}>
                  {logging ? 'Saving...' : 'Log Contact'}
                </button>
              </div>
            </div>
          )}

          {/* Tasks for this contact */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>TASKS</span>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => setShowTaskForm(true)}>+ Add Task</button>
            </div>
            {tasks.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>No tasks yet.</p>
            ) : (
              <div className="card">
                {tasks.map(t => (
                  <div key={t.id} className="task-item">
                    <div className={`task-check ${t.completed ? 'done' : ''}`} onClick={() => toggleTask(t)}>
                      {t.completed && <svg fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3} width={10} height={10}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className={`task-title ${t.completed ? 'done' : ''}`}>{t.title}</div>
                      {t.due_date && <div className="task-meta">{formatDate(t.due_date)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact history */}
          {logs.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>HISTORY</div>
              {logs.slice(0, 5).map(log => (
                <div key={log.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>{formatDate(log.contacted_at)}</span>
                  {log.notes && <span> — {log.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTaskForm && (
        <TaskForm
          contactId={contact.id}
          contactName={`${contact.first_name} ${contact.last_name || ''}`.trim()}
          onSave={task => { setTasks(ts => [...ts, task]); setShowTaskForm(false); showToast('Task added!'); }}
          onClose={() => setShowTaskForm(false)}
        />
      )}
    </>
  );
}
