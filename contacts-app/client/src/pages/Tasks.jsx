import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { PlusIcon, TrashIcon, EditIcon } from '../components/Icons';
import TaskForm from '../components/TaskForm';

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: 'Today', overdue: false };
  if (diff === 1) return { label: 'Tomorrow', overdue: false };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

export default function Tasks({ showToast }) {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('open'); // open | completed | all
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (filter === 'open') params.completed = 'false';
    if (filter === 'completed') params.completed = 'true';
    api.getTasks(params).then(setTasks).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function toggleTask(task) {
    const updated = await api.updateTask(task.id, { completed: !task.completed });
    if (filter !== 'all') {
      setTasks(ts => ts.filter(t => t.id !== task.id));
    } else {
      setTasks(ts => ts.map(t => t.id === task.id ? updated : t));
    }
    showToast(updated.completed ? 'Task completed!' : 'Task reopened');
  }

  async function deleteTask(task) {
    if (!confirm(`Delete "${task.title}"?`)) return;
    await api.deleteTask(task.id);
    setTasks(ts => ts.filter(t => t.id !== task.id));
    showToast('Task deleted');
  }

  function handleSave(task) {
    if (editTask) {
      setTasks(ts => ts.map(t => t.id === task.id ? task : t));
      showToast('Task updated!');
    } else {
      setTasks(ts => [task, ...ts]);
      showToast('Task created!');
    }
    setShowForm(false);
    setEditTask(null);
  }

  const grouped = tasks.reduce((acc, t) => {
    const key = t.contact_id ? `${t.first_name || ''} ${t.last_name || ''}`.trim() : 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Tasks</span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px', background: 'var(--bg)', borderRadius: 8, margin: '0 16px 8px' }}>
        {[['open', 'Open'], ['completed', 'Done'], ['all', 'All']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            style={{
              flex: 1, borderRadius: 6, padding: '7px 0',
              background: filter === v ? 'var(--primary)' : 'transparent',
              color: filter === v ? '#fff' : 'var(--muted)',
              fontWeight: filter === v ? 600 : 400,
            }}
          >{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <div className="empty-state-title">No tasks</div>
          <div className="empty-state-sub">Tap + to add a task</div>
        </div>
      ) : (
        Object.entries(grouped).map(([groupName, groupTasks]) => (
          <div key={groupName}>
            <div className="section-label">{groupName}</div>
            <div className="card" style={{ margin: '0 16px' }}>
              {groupTasks.map(t => {
                const dateInfo = formatDate(t.due_date);
                return (
                  <div key={t.id} className="task-item">
                    <div
                      className={`task-check ${t.completed ? 'done' : ''}`}
                      onClick={() => toggleTask(t)}
                    >
                      {t.completed && (
                        <svg fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3} width={10} height={10}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={`task-title ${t.completed ? 'done' : ''}`}>{t.title}</div>
                      {t.description && (
                        <div className="task-meta" style={{ marginTop: 1 }}>{t.description}</div>
                      )}
                      {dateInfo && (
                        <div className={`task-meta ${dateInfo.overdue && !t.completed ? 'task-overdue' : ''}`}>
                          {dateInfo.label}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn-ghost" onClick={() => { setEditTask(t); setShowForm(true); }} style={{ padding: 6 }}>
                        <EditIcon />
                      </button>
                      <button className="btn-ghost" onClick={() => deleteTask(t)} style={{ padding: 6, color: 'var(--danger)' }}>
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={() => { setEditTask(null); setShowForm(true); }}>
        <PlusIcon size={24} />
      </button>

      {(showForm || editTask) && (
        <TaskForm
          task={editTask}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTask(null); }}
        />
      )}
    </div>
  );
}
