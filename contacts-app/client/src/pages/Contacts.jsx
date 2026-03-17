import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { SearchIcon, PlusIcon } from '../components/Icons';
import ContactForm from '../components/ContactForm';
import ContactDetail from '../components/ContactDetail';

function initials(c) {
  return ((c.first_name || '')[0] || '').toUpperCase() + ((c.last_name || '')[0] || '').toUpperCase();
}

function isOverdue(iso) {
  return iso && new Date(iso) <= new Date();
}

export default function Contacts({ initialContactId, showToast }) {
  const [contacts, setContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [viewContactId, setViewContactId] = useState(initialContactId || null);

  const load = useCallback(() => {
    const params = {};
    if (search) params.search = search;
    if (filterCat) params.category = filterCat;
    if (filterOverdue) params.overdue = 'true';
    api.getContacts(params).then(setContacts).finally(() => setLoading(false));
  }, [search, filterCat, filterOverdue]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getCategories().then(setCategories); }, []);
  useEffect(() => { if (initialContactId) setViewContactId(initialContactId); }, [initialContactId]);

  function handleSave(contact) {
    setContacts(cs => {
      const idx = cs.findIndex(c => c.id === contact.id);
      if (idx >= 0) {
        const updated = [...cs];
        updated[idx] = contact;
        return updated;
      }
      return [contact, ...cs];
    });
    setShowForm(false);
    setEditContact(null);
    showToast('Contact saved!');
  }

  async function handleDelete(contact) {
    if (!confirm(`Delete ${contact.first_name}?`)) return;
    try {
      await api.deleteContact(contact.id);
      setContacts(cs => cs.filter(c => c.id !== contact.id));
      setViewContactId(null);
      showToast('Contact deleted');
    } catch (err) {
      showToast(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Contacts</span>
      </div>

      {/* Search bar */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
        <div className="search-bar">
          <SearchIcon />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts..."
          />
        </div>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <button
            className="category-chip"
            onClick={() => { setFilterCat(''); setFilterOverdue(false); }}
            style={{
              background: !filterCat && !filterOverdue ? 'var(--primary)' : 'transparent',
              color: !filterCat && !filterOverdue ? '#fff' : 'var(--muted)',
              borderColor: !filterCat && !filterOverdue ? 'var(--primary)' : 'var(--border)',
              whiteSpace: 'nowrap',
            }}
          >All</button>
          <button
            className="category-chip"
            onClick={() => { setFilterOverdue(!filterOverdue); setFilterCat(''); }}
            style={{
              background: filterOverdue ? 'var(--danger)' : 'transparent',
              color: filterOverdue ? '#fff' : 'var(--danger)',
              borderColor: 'var(--danger)',
              whiteSpace: 'nowrap',
            }}
          >Overdue</button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className="category-chip"
              onClick={() => { setFilterCat(cat.id === filterCat ? '' : cat.id); setFilterOverdue(false); }}
              style={{
                background: filterCat === cat.id ? cat.color : 'transparent',
                color: filterCat === cat.id ? '#fff' : cat.color,
                borderColor: cat.color,
                whiteSpace: 'nowrap',
              }}
            >{cat.name}</button>
          ))}
        </div>
      )}

      {/* Contact list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
      ) : contacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👤</div>
          <div className="empty-state-title">No contacts found</div>
          <div className="empty-state-sub">{search ? 'Try a different search' : 'Tap + to add your first contact'}</div>
        </div>
      ) : (
        <div className="card" style={{ margin: '0 16px' }}>
          {contacts.map(c => (
            <div key={c.id} className="contact-item" onClick={() => setViewContactId(c.id)}>
              <div className="avatar">{initials(c)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="contact-name">{c.first_name} {c.last_name || ''}</div>
                <div className="contact-sub">
                  {c.company || c.phone || c.work_email || c.personal_email || ''}
                </div>
                {c.categories?.length > 0 && (
                  <div className="tag-row">
                    {c.categories.map(cat => (
                      <span key={cat.id} className="badge" style={{ background: cat.color + '22', color: cat.color }}>
                        {cat.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {isOverdue(c.next_follow_up) && <div className="overdue-dot" />}
            </div>
          ))}
        </div>
      )}

      <button className="fab" onClick={() => { setEditContact(null); setShowForm(true); }}>
        <PlusIcon size={24} />
      </button>

      {(showForm || editContact) && (
        <ContactForm
          contact={editContact}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditContact(null); }}
        />
      )}

      {viewContactId && (
        <ContactDetail
          contactId={viewContactId}
          onClose={() => setViewContactId(null)}
          onEdit={c => { setViewContactId(null); setEditContact(c); }}
          onDelete={c => { setViewContactId(null); handleDelete(c); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
