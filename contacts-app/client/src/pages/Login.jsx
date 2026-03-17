import { useState } from 'react';
import { api } from '../api';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', notificationEmail: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let data;
      if (mode === 'login') {
        data = await api.login(form.username, form.password);
      } else {
        data = await api.register(form.username, form.email, form.password, form.notificationEmail || form.email);
      }
      localStorage.setItem('token', data.token);
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📇</div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Contact Manager</h1>
          <p style={{ color: 'var(--muted)', marginTop: 4 }}>Stay in touch with what matters</p>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg)', borderRadius: 8, padding: 4 }}>
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1, borderRadius: 6, padding: '7px 0',
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? 'var(--text)' : 'var(--muted)',
                  fontWeight: mode === m ? 600 : 400,
                  boxShadow: mode === m ? 'var(--shadow)' : 'none',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input value={form.username} onChange={e => set('username', e.target.value)} placeholder="yourname" required autoCapitalize="off" />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" required />
              </div>
            )}

            <div className="form-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" required minLength={8} />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label>Reminder Email (optional)</label>
                <input type="email" value={form.notificationEmail} onChange={e => set('notificationEmail', e.target.value)} placeholder="Leave blank to use email above" />
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Follow-up and task reminders will be sent here</p>
              </div>
            )}

            {error && <p className="error-msg" style={{ marginBottom: 12 }}>{error}</p>}

            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '11px 0', marginTop: 4 }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
