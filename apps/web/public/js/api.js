const API = {
  getToken() { return localStorage.getItem('token'); },
  getUser()  { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; },
  saveSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },
  requireAuth() {
    if (!this.getToken()) { location.href = '/login'; return false; }
    return true;
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = '/login';
  },
  async request(path, options = {}) {
    const token = this.getToken();
    const res = await fetch('/api' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) { this.logout(); return; }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'HTTP ' + res.status);
    }
    return res.json();
  },
  get(path)        { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST',   body: JSON.stringify(body) }); },
  put(path, body)  { return this.request(path, { method: 'PUT',    body: JSON.stringify(body) }); },
  delete(path)     { return this.request(path, { method: 'DELETE' }); },
};
