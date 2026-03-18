const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 204) return null;

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  register: (username, email, password, notificationEmail) =>
    request('POST', '/auth/register', { username, email, password, notificationEmail }),
  me: () => request('GET', '/auth/me'),
  updateNotificationEmail: (notificationEmail) => request('PATCH', '/auth/me', { notificationEmail }),

  // Dashboard
  dashboard: () => request('GET', '/dashboard'),

  // Contacts
  getContacts: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return request('GET', `/contacts${q.toString() ? '?' + q : ''}`);
  },
  getContact: (id) => request('GET', `/contacts/${id}`),
  createContact: (data) => request('POST', '/contacts', data),
  updateContact: (id, data) => request('PUT', `/contacts/${id}`, data),
  deleteContact: (id) => request('DELETE', `/contacts/${id}`),
  logContact: (id, notes) => request('POST', `/contacts/${id}/log-contact`, { notes }),
  setFollowUpOnce: (id, date) => request('PUT', `/contacts/${id}/follow-up-once`, { date }),
  getContactLogs: (id) => request('GET', `/contacts/${id}/logs`),
  importContacts: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/contacts/import', fd, true);
  },
  exportContacts: () => `${BASE}/contacts/export`,

  // Categories
  getCategories: () => request('GET', '/categories'),
  createCategory: (data) => request('POST', '/categories', data),
  updateCategory: (id, data) => request('PUT', `/categories/${id}`, data),
  deleteCategory: (id) => request('DELETE', `/categories/${id}`),

  // Google Contacts sync
  googleConfigured: () => request('GET', '/google/configured'),
  googleStatus: () => request('GET', '/google/status'),
  googleSync: () => request('POST', '/google/sync'),
  googleDisconnect: () => request('DELETE', '/google/disconnect'),
  googleAuthUrl: () => `${BASE}/google/auth?state=${encodeURIComponent(localStorage.getItem('token') || '')}`,

  // Tasks
  getTasks: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return request('GET', `/tasks${q.toString() ? '?' + q : ''}`);
  },
  createTask: (data) => request('POST', '/tasks', data),
  updateTask: (id, data) => request('PUT', `/tasks/${id}`, data),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),
};
