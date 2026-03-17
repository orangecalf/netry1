import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { UploadIcon, DownloadIcon } from '../components/Icons';

export default function Settings({ user, onLogout, showToast }) {
  const [notifEmail, setNotifEmail] = useState(user?.notification_email || user?.email || '');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (user) setNotifEmail(user.notification_email || user.email || '');
  }, [user]);

  async function saveNotifEmail(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateNotificationEmail(notifEmail);
      showToast('Notification email updated!');
    } catch (err) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await api.importContacts(file);
      showToast(`Imported ${result.imported} of ${result.total} contacts`);
    } catch (err) {
      showToast(err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  function handleExport() {
    const token = localStorage.getItem('token');
    // Trigger file download via a link
    const url = api.exportContacts();
    const a = document.createElement('a');
    // We need to fetch with auth header to download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = 'contacts.vcf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
        showToast('Contacts exported!');
      })
      .catch(() => showToast('Export failed'));
  }

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Settings</span>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Profile */}
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Account</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
              {(user?.username || '')[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{user?.username}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{user?.email}</div>
            </div>
          </div>
        </div>

        {/* Notification email */}
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Reminder Notifications</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Follow-up and task reminders are emailed daily at 8am. Configure SMTP in <code>.env</code> to enable.
          </p>
          <form onSubmit={saveNotifEmail}>
            <div className="form-group">
              <label>Notification Email</label>
              <input type="email" value={notifEmail} onChange={e => setNotifEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <button className="btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
              {saving ? 'Saving...' : 'Save Email'}
            </button>
          </form>
        </div>

        {/* vCard sync */}
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Contact Sync (vCard)</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Import contacts from your phone by exporting a <code>.vcf</code> file and uploading it here.
            Export your contacts to import them into your phone's contacts app.
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <UploadIcon />
              {importing ? 'Importing...' : 'Import .vcf'}
            </button>
            <button
              className="btn-secondary"
              onClick={handleExport}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <DownloadIcon />
              Export .vcf
            </button>
          </div>

          <input ref={fileRef} type="file" accept=".vcf,.vcard" onChange={handleImport} style={{ display: 'none' }} />

          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>How to export from your phone:</strong>
            <div><strong>iPhone:</strong> Contacts app → select all → Share → Export vCard</div>
            <div style={{ marginTop: 4 }}><strong>Android:</strong> Contacts app → ⋮ menu → Import/Export → Export to .vcf</div>
            <div style={{ marginTop: 4 }}><strong>Google Contacts:</strong> contacts.google.com → Export → vCard</div>
          </div>
        </div>

        {/* Logout */}
        <button
          className="btn-danger"
          onClick={() => { localStorage.removeItem('token'); onLogout(); }}
          style={{ width: '100%', padding: '11px 0', marginBottom: 16 }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
