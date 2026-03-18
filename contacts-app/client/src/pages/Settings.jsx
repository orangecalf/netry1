import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { UploadIcon, DownloadIcon } from '../components/Icons';

export default function Settings({ user, onLogout, showToast }) {
  const [notifEmail, setNotifEmail] = useState(user?.notification_email || user?.email || '');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleStatus, setGoogleStatus] = useState(null); // { connected, lastSyncedAt }
  const [googleSyncing, setGoogleSyncing] = useState(false);

  useEffect(() => {
    if (user) setNotifEmail(user.notification_email || user.email || '');
  }, [user]);

  useEffect(() => {
    api.googleConfigured().then(r => setGoogleConfigured(r.configured)).catch(() => {});
    api.googleStatus().then(setGoogleStatus).catch(() => {});
  }, []);

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
    const url = api.exportContacts();
    const a = document.createElement('a');
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

  function handleGoogleConnect() {
    window.location.href = api.googleAuthUrl();
  }

  async function handleGoogleSync() {
    setGoogleSyncing(true);
    try {
      const result = await api.googleSync();
      setGoogleStatus(s => ({ ...s, lastSyncedAt: result.lastSyncedAt }));
      showToast('Google Contacts synced!');
    } catch (err) {
      showToast('Sync failed: ' + err.message);
    } finally {
      setGoogleSyncing(false);
    }
  }

  async function handleGoogleDisconnect() {
    try {
      await api.googleDisconnect();
      setGoogleStatus({ connected: false, lastSyncedAt: null });
      showToast('Google Contacts disconnected');
    } catch (err) {
      showToast(err.message);
    }
  }

  function formatSyncTime(iso) {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div>
      <div className="page-header">
        <span className="page-title">Settings</span>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Account */}
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

        {/* Google Contacts Sync */}
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Google Contacts Sync</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Bidirectional sync with Google Contacts. Runs automatically every hour.
          </p>

          {!googleConfigured ? (
            <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 13, color: 'var(--muted)' }}>
              Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in your <code>.env</code> to enable Google sync.
            </div>
          ) : googleStatus?.connected ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Connected · Last synced: {formatSyncTime(googleStatus.lastSyncedAt)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={handleGoogleSync}
                  disabled={googleSyncing}
                  style={{ flex: 1 }}
                >
                  {googleSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleGoogleDisconnect}
                  style={{ flex: 1 }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-primary" onClick={handleGoogleConnect} style={{ width: '100%' }}>
              Connect Google Contacts
            </button>
          )}
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
