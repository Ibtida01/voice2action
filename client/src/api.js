// client/src/api.js
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const createIssue = (payload) =>
  fetch(`${API}/api/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());

export const trackIssue = (tid) =>
  fetch(`${API}/api/issues/track/${encodeURIComponent(tid)}`).then(r => r.json());

export const listIssues = ({ sort = 'recent', limit = 50 } = {}) =>
  fetch(`${API}/api/issues?sort=${sort}&limit=${limit}`).then(r => r.json());

export const upvoteIssue = (id) =>
  fetch(`${API}/api/issues/${id}/upvote`, { method: 'POST' }).then(r => r.json());

export const metrics = () => fetch(`${API}/api/metrics`).then(r => r.json());

export const login = (email, password) =>
  fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json());

export const adminList = (token) =>
  fetch(`${API}/api/admin/issues`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json());

export const adminUpdate = (token, id, payload) =>
  fetch(`${API}/api/admin/issues/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  }).then(r => r.json());

export const getGeoPoints = () =>
  fetch(`${API}/api/issues/geo`).then(r => r.json());

export const uploadFile = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`${API}/api/upload`, { method: 'POST', body: fd }).then(r => r.json());
};

export const analyticsSeries = (days = 30) =>
  fetch(`${API}/api/analytics/series?days=${days}`).then(r => r.json());

export const wardStats = () =>
  fetch(`${API}/api/wards/stats`).then(r => r.json());
 
export const getOrgs = () =>
  fetch(`${API}/api/orgs`).then(r => r.json());

export const getOrgMetrics = (code) =>
  fetch(`${API}/api/org/${encodeURIComponent(code)}/metrics`).then(r => r.json());
