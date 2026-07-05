import type { AlertRule, AlertRuleType, AlertRuleConfig, AlertEvent, AlertStatus, Feature, SmsTip, SmsSender, NewsSource, NewsItem } from './types';

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
    req<{ token: string; user: { id: number; username: string; role: string }; previousLoginAt: string | null }>('POST', '/auth/login', { username, password }),

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

  getRelatedFeatures: (uid: string, radiusM: number) =>
    req<Feature[]>('GET', `/features/${uid}/related?radius_m=${radiusM}`),

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

  get: <T = unknown>(path: string) => req<T>('GET', path.replace(/^\/api/, '')),

  users: {
    list: () => req<{ id: number; username: string; role: string; created_at: string }[]>('GET', '/auth/users'),
    create: (data: { username: string; password: string; role: string }) => req('POST', '/auth/users', data),
    delete: (id: number) => req('DELETE', `/auth/users/${id}`),
  },

  preferences: {
    get: () => req<Record<string, unknown>>('GET', '/auth/preferences'),
    save: (value: Record<string, unknown>) => req<{ ok: boolean }>('PUT', '/auth/preferences', { value }),
  },

  sms: {
    tips: {
      list: (status: 'pending' | 'tagged' | 'discarded' = 'pending') => req<SmsTip[]>('GET', `/sms/tips?status=${status}`),
      tag: (id: number, data: { municipality?: string; area?: string; lat?: number; lng?: number }) =>
        req<{ ok: boolean; feature_uid: string }>('POST', `/sms/tips/${id}/tag`, data),
      discard: (id: number) => req<{ ok: boolean }>('POST', `/sms/tips/${id}/discard`),
    },
    senders: {
      list: () => req<SmsSender[]>('GET', '/sms/senders'),
      update: (phone: string, data: { status: SmsSender['status']; label?: string; municipality?: string; lat?: number; lng?: number }) =>
        req<{ ok: boolean }>('PUT', `/sms/senders/${encodeURIComponent(phone)}`, data),
    },
  },

  news: {
    sources: {
      list: () => req<NewsSource[]>('GET', '/news/sources'),
      add: (data: { name: string; url: string }) => req<NewsSource>('POST', '/news/sources', data),
      update: (id: number, data: { name?: string; url?: string; enabled?: boolean }) =>
        req<NewsSource>('PUT', `/news/sources/${id}`, data),
      discover: (id: number) => req<NewsSource>('POST', `/news/sources/${id}/discover`),
      remove: (id: number) => req<{ ok: boolean }>('DELETE', `/news/sources/${id}`),
      poll: () => req<{ ok: boolean }>('POST', '/news/poll'),
    },
    items: {
      list: (status: 'pending' | 'tagged' | 'discarded' = 'pending') => req<NewsItem[]>('GET', `/news/items?status=${status}`),
      tag: (id: number, data: { municipality?: string; area?: string; lat?: number; lng?: number }) =>
        req<{ ok: boolean; feature_uid: string }>('POST', `/news/items/${id}/tag`, data),
      discard: (id: number) => req<{ ok: boolean }>('POST', `/news/items/${id}/discard`),
      restore: (id: number) => req<{ ok: boolean }>('POST', `/news/items/${id}/restore`),
    },
  },

  alerts: {
    listRules: () => req<AlertRule[]>('GET', '/alerts/rules'),
    createRule: (data: { name: string; type: AlertRuleType; config: AlertRuleConfig; enabled?: boolean }) =>
      req<AlertRule>('POST', '/alerts/rules', data),
    updateRule: (id: number, data: { name: string; type: AlertRuleType; config: AlertRuleConfig; enabled?: boolean }) =>
      req<AlertRule>('PUT', `/alerts/rules/${id}`, data),
    deleteRule: (id: number) => req<{ ok: boolean }>('DELETE', `/alerts/rules/${id}`),

    listEvents: (status: AlertStatus | 'all' = 'open', since?: string) =>
      req<AlertEvent[]>('GET', `/alerts/events?status=${status}${since ? `&since=${encodeURIComponent(since)}` : ''}`),
    acknowledge: (id: number) => req<AlertEvent>('POST', `/alerts/events/${id}/acknowledge`),

    evaluateNow: () => req<{ ok: boolean }>('POST', '/alerts/evaluate'),
  },
};
