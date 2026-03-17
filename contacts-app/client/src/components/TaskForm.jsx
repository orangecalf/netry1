import { useState, useEffect } from 'react';
import { api } from '../api';
import { CloseIcon } from './Icons';

export default function TaskForm({ task, contactId, contactName, onSave, onClose }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    dueDate: task?.due_date ? task.due_date.slice(0, 16) : '',
    contactId: task?.contact_id || contactId || '',
  });
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactId) {
      api.getContacts().then(setContacts).catch(console.error);
    }
  }, [contactId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setError('');
    setLoading(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        dueDate: form.dueDate || null,
        contactId: form.contactId || null,
      };
      let saved;
      if (task) {
        saved = await api.updateTask(task.id, payload);
      } else {
        saved = await api.createTask(payload);
      }
      onSave(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{task ? 'Edit Task' : 'New Task'}</span>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}><CloseIcon /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Task Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Follow up on proposal" autoFocus />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Additional details..." rows={2} />
          </div>

          <div className="form-group">
            <label>Due Date & Time</label>
            <input type="datetime-local" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </div>

          {!contactId && (
            <div className="form-group">
              <label>Link to Contact (optional)</label>
              <select value={form.contactId} onChange={e => set('contactId', e.target.value)}>
                <option value="">— No contact —</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name || ''}</option>
                ))}
              </select>
            </div>
          )}

          {contactId && contactName && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Linked to: <strong style={{ color: 'var(--text)' }}>{contactName}</strong>
            </div>
          )}

          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
