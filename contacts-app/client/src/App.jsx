import { useState, useEffect } from 'react';
import { api } from './api';
import { useToast } from './hooks/useToast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Tasks from './pages/Tasks';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import { HomeIcon, ContactsIcon, TasksIcon, CategoryIcon, SettingsIcon } from './components/Icons';

const TABS = [
  { id: 'dashboard', label: 'Home', Icon: HomeIcon },
  { id: 'contacts', label: 'Contacts', Icon: ContactsIcon },
  { id: 'tasks', label: 'Tasks', Icon: TasksIcon },
  { id: 'categories', label: 'Categories', Icon: CategoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [navState, setNavState] = useState({});
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  useEffect(() => {
    // Handle OAuth redirect back from Google
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get('google');
    if (googleResult) {
      window.history.replaceState({}, '', window.location.pathname);
      if (googleResult === 'connected') {
        setTab('settings');
        // Show toast after auth loads
        setTimeout(() => showToast('Google Contacts connected! Syncing now...'), 500);
      } else if (googleResult === 'error') {
        setTab('settings');
        setTimeout(() => showToast('Google connection failed. Please try again.'), 500);
      }
    }

    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.me().then(u => { setUser(u); setAuthed(true); }).catch(() => {
      localStorage.removeItem('token');
    }).finally(() => setLoading(false));
  }, []);

  function handleAuth(data) {
    setUser({ username: data.username, email: data.email });
    setAuthed(true);
    api.me().then(setUser).catch(() => {});
  }

  function handleNavigate(tabId, state = {}) {
    setTab(tabId);
    setNavState(state);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (!authed) {
    return <Login onAuth={handleAuth} />;
  }

  return (
    <div className="app-layout">
      {tab === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
      {tab === 'contacts' && <Contacts initialContactId={navState.contactId} showToast={showToast} />}
      {tab === 'tasks' && <Tasks showToast={showToast} />}
      {tab === 'categories' && <Categories showToast={showToast} />}
      {tab === 'settings' && <Settings user={user} onLogout={() => { setAuthed(false); setUser(null); }} showToast={showToast} />}

      <nav className="bottom-nav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setNavState({}); }}
            className={tab === id ? 'active' : ''}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
