import { useState, useEffect } from 'react';
import { api } from '../api';
import { PlusIcon, TrashIcon, EditIcon, CloseIcon } from '../components/Icons';

const COLORS = ['#6366f1','#ec4899','#f59e0b','#22c55e','#0ea5e9','#8b5cf6','#ef4444','#14b8a6','#f97316','#64748b'];

const INTERVALS = [
  { label: 'No auto follow-up', value: '' },
  { label: 'Every week', value: '7' },
  { label: 'Every 2 weeks', value: '14' },
  { label: 'Every month', value: '30' },
  { label: 'Every 2 months', value: '60' },
  { label: 'Every 3 months', value: '90' },
  { label: 'Every 6 months', value: '180' },
  { label: 'Every year', value: '365' },
];

function CategoryForm({ category, onSave, onClose }) {
  const [form, setForm] = useState({
    name: category?.name || '',
    color: category?.color || COLORS[0],
    followUpIntervalDays: category?.follow_up_interval_days?.toString() || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setError('');
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        followUpIntervalDays: form.followUpIntervalDays ? parseInt(form.followUpIntervalDays) : null,
      };
      let saved;
      if (category) {
        saved = await api.updateCategory(category.id, payload);
      } else {
        saved = await api.createCategory(payload);
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
          <span className="modal-title">{category ? 'Edit Category' : 'New Category'}</span>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 4 }}><CloseIcon /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Category Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Work, Family, Clients..." autoFocus />
          </div>

          <div className="form-group">
            <label>Color</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => set('color', c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: form.color === c ? `3px solid ${c}` : '3px solid transparent',
                    outline: form.color === c ? '2px solid #fff' : 'none',
                    boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Auto Follow-up Interval</label>
            <select value={form.followUpIntervalDays} onChange={e => set('followUpIntervalDays', e.target.value)}>
              {INTERVALS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Contacts in this category will automatically get a follow-up reminder at this interval after you last contacted them.
            </p>
          </div>

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

export default function Categories({ showToast }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCat, setEditCat] = useState(null);

  useEffect(() => {
    api.getCategories().then(setCategories).finally(() => setLoading(false));
  }, []);

  function handleSave(cat) {
    setCategories(cs => {
      const idx = cs.findIndex(c => c.id === cat.id);
      if (idx >= 0) {
        const updated = [...cs];
        updated[idx] = cat;
        return updated;
      }
      return [...cs, cat];
    });
    setShowForm(false);
    setEditCat(null);
    showToast('Category saved!');
  }

  async function handleDelete(cat) {
    if (!confirm(`Delete category "${cat.name}"? This will not delete the contacts.`)) return;
    await api.deleteCategory(cat.id);
    setCategories(cs => cs.filter(c => c.id !== cat.id));
    showToast('Category deleted');
  }

  function intervalLabel(days) {
    if (!days) return 'No auto follow-up';
    const opt = INTERVALS.find(o => o.value === days.toString());
    return opt ? opt.label : `Every ${days} days`;
  }

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Categories</span>
        <button className="btn-primary" style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => { setEditCat(null); setShowForm(true); }}>
          <PlusIcon size={14} /> New
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No categories yet</div>
          <div className="empty-state-sub">Create categories to organize contacts and set follow-up intervals</div>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>Create Category</button>
        </div>
      ) : (
        <div className="card" style={{ margin: '0 16px' }}>
          {categories.map(cat => (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{cat.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {intervalLabel(cat.follow_up_interval_days)} · {cat.contact_count || 0} contact{cat.contact_count !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-ghost" onClick={() => { setEditCat(cat); setShowForm(true); }} style={{ padding: 6 }}>
                  <EditIcon />
                </button>
                <button className="btn-ghost" onClick={() => handleDelete(cat)} style={{ padding: 6, color: 'var(--danger)' }}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '16px', margin: '16px' }} className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>How categories work</h3>
        <ul style={{ fontSize: 13, color: 'var(--muted)', paddingLeft: 16, lineHeight: 2 }}>
          <li>Assign one or more categories to each contact</li>
          <li>Set a follow-up interval per category</li>
          <li>After logging a contact interaction, the next follow-up date is auto-calculated</li>
          <li>Overdue follow-ups appear on the dashboard and trigger email reminders at 8am</li>
        </ul>
      </div>

      {(showForm || editCat) && (
        <CategoryForm
          category={editCat}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditCat(null); }}
        />
      )}
    </div>
  );
}
