const BASE = '/api';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    req<{ token: string; user: { id: number; username: string; role: string } }>('POST', '/auth/login', { username, password }),

  me: () => req<{ id: number; username: string; role: string }>('GET', '/auth/me'),

  getFeatures: (layer?: string) =>
    req<GeoJSON.FeatureCollection>('GET', `/features${layer ? `?layer=${layer}` : ''}`),

  createFeature: (data: Record<string, unknown>) =>
    req<GeoJSON.Feature>('POST', '/features', data),

  updateFeature: (uid: string, data: Record<string, unknown>) =>
    req<GeoJSON.Feature>('PUT', `/features/${uid}`, data),

  deleteFeature: (uid: string) =>
    req<{ ok: boolean }>('DELETE', `/features/${uid}`),

  clearLayer: (layer: string) =>
    req<{ deleted: number }>('DELETE', `/features/layer/${layer}`),

  dashboard: () =>
    req<{ totals: unknown[]; alerts: unknown[]; activity: unknown[] }>('GET', '/dashboard'),

  importCSV: (layer: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/import/csv?layer=${layer}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: form,
    }).then(r => r.json());
  },

  users: {
    list: () => req<{ id: number; username: string; role: string; created_at: string }[]>('GET', '/auth/users'),
    create: (data: { username: string; password: string; role: string }) => req('POST', '/auth/users', data),
    delete: (id: number) => req('DELETE', `/auth/users/${id}`),
  },
};
