import { useState, useEffect } from 'react';
import { api } from '../api';
import { CloseIcon } from './Icons';

const COLORS = ['#6366f1','#ec4899','#f59e0b','#22c55e','#0ea5e9','#8b5cf6','#ef4444','#14b8a6'];

export default function ContactForm({ contact, onSave, onClose }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', workEmail: '', personalEmail: '',
    company: '', notes: '', categoryIds: [],
    ...(contact ? {
      firstName: contact.first_name || '',
      lastName: contact.last_name || '',
      phone: contact.phone || '',
      workEmail: contact.work_email || '',
      personalEmail: contact.personal_email || '',
      company: contact.company || '',
      notes: contact.notes || '',
      categoryIds: (contact.categories || []).map(c => c.id),
    } : {})
  });
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleCategory(id) {
    setForm(f => ({
      ...f,
      categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter(x => x !== id) : [...f.categoryIds, id]
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim()) { setError('First name is required'); return; }
    setError('');
    setLoading(true);
    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
        workEmail: form.workEmail.trim() || null,
        personalEmail: form.personalEmail.trim() || null,
        company: form.company.trim() || null,
        notes: form.notes.trim() || null,
        categoryIds: form.categoryIds,
      };
      let saved;
      if (contact) {
        saved = await api.updateContact(contact.id, payload);
      } else {
        saved = await api.createContact(payload);
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
          <span className="modal-title">{contact ? 'Edit Contact' : 'New Contact'}</span>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}><CloseIcon /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>First Name *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" />
            </div>
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" />
          </div>

          <div className="form-group">
            <label>Work Email</label>
            <input type="email" value={form.workEmail} onChange={e => set('workEmail', e.target.value)} placeholder="jane@company.com" />
          </div>

          <div className="form-group">
            <label>Personal Email</label>
            <input type="email" value={form.personalEmail} onChange={e => set('personalEmail', e.target.value)} placeholder="jane@gmail.com" />
          </div>

          <div className="form-group">
            <label>Company</label>
            <input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Acme Corp" />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes..." rows={2} />
          </div>

          {categories.length > 0 && (
            <div className="form-group">
              <label>Categories</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className="category-chip"
                    style={{
                      background: form.categoryIds.includes(cat.id) ? cat.color : 'transparent',
                      color: form.categoryIds.includes(cat.id) ? '#fff' : cat.color,
                      borderColor: cat.color,
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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
