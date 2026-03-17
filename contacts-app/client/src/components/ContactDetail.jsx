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
  const [showFollowUpOnceForm, setShowFollowUpOnceForm] = useState(false);
  const [followUpOnceDate, setFollowUpOnceDate] = useState('');
  const [completingTask, setCompletingTask] = useState(null);
  const [completionNote, setCompletionNote] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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

  async function handleSetFollowUpOnce() {
    if (!followUpOnceDate) return;
    try {
      const updated = await api.setFollowUpOnce(contact.id, new Date(followUpOnceDate).toISOString());
      setContact(updated);
      setShowFollowUpOnceForm(false);
      setFollowUpOnceDate('');
      showToast('One-time follow-up set!');
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleClearFollowUpOnce() {
    try {
      const updated = await api.setFollowUpOnce(contact.id, null);
      setContact(updated);
      showToast('Follow-up dismissed.');
    } catch (err) {
      showToast(err.message);
    }
  }

  function handleTaskCheck(task) {
    if (!task.completed) {
      setCompletingTask(task);
      setCompletionNote('');
    } else {
      api.updateTask(task.id, { completed: false }).then(updated =>
        setTasks(ts => ts.map(t => t.id === task.id ? updated : t))
      );
    }
  }

  async function confirmComplete() {
    const updated = await api.updateTask(completingTask.id, { completed: true, completionNote: completionNote || null });
    setTasks(ts => ts.map(t => t.id === completingTask.id ? updated : t));
    setCompletingTask(null);
    setCompletionNote('');
    showToast('Task completed!');
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
            {contact.follow_up_once && (
              <div className="detail-row">
                <span className="detail-label">One-time</span>
                <span className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: isOverdue(contact.follow_up_once) ? 'var(--danger)' : 'inherit', fontWeight: isOverdue(contact.follow_up_once) ? 600 : 500 }}>
                    {isOverdue(contact.follow_up_once) ? '⚠️ ' : ''}{formatDate(contact.follow_up_once)}
                  </span>
                  <button className="btn-ghost" onClick={handleClearFollowUpOnce} style={{ padding: '1px 6px', fontSize: 11, color: 'var(--muted)' }}>Dismiss</button>
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

          {/* One-time follow-up setter */}
          {!contact.follow_up_once && !showFollowUpOnceForm && (
            <button className="btn-secondary" onClick={() => setShowFollowUpOnceForm(true)} style={{ width: '100%', marginBottom: 12 }}>
              + Set one-time follow-up
            </button>
          )}
          {showFollowUpOnceForm && (
            <div style={{ marginBottom: 12, background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
              <label>Follow-up date</label>
              <input type="date" value={followUpOnceDate} onChange={e => setFollowUpOnceDate(e.target.value)} style={{ marginTop: 4 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => { setShowFollowUpOnceForm(false); setFollowUpOnceDate(''); }} style={{ flex: 1 }}>Cancel</button>
                <button className="btn-primary" onClick={handleSetFollowUpOnce} disabled={!followUpOnceDate} style={{ flex: 1 }}>Set</button>
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
                  <div key={t.id}>
                    <div className="task-item">
                      <div className={`task-check ${t.completed ? 'done' : ''}`} onClick={() => handleTaskCheck(t)}>
                        {t.completed && <svg fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3} width={10} height={10}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className={`task-title ${t.completed ? 'done' : ''}`}>{t.title}</div>
                        {t.completion_note && <div className="task-meta" style={{ fontStyle: 'italic' }}>Note: {t.completion_note}</div>}
                        {t.due_date && <div className="task-meta">{formatDate(t.due_date)}</div>}
                      </div>
                    </div>
                    {completingTask?.id === t.id && (
                      <div style={{ padding: '8px 16px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        <textarea
                          value={completionNote}
                          onChange={e => setCompletionNote(e.target.value)}
                          placeholder="Add a completion note (optional)..."
                          rows={2}
                          autoFocus
                          style={{ fontSize: 13, marginBottom: 8 }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn-secondary" onClick={() => setCompletingTask(null)} style={{ flex: 1, padding: '7px 0' }}>Cancel</button>
                          <button className="btn-primary" onClick={confirmComplete} style={{ flex: 1, padding: '7px 0' }}>Mark Done</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact history */}
          {logs.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>HISTORY</div>
              {logs.map(log => (
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
