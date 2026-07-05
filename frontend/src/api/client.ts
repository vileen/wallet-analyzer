const API_URL = import.meta.env.VITE_API_URL || 'https://solana-tracker.vileen.pl';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Token expired or invalid — reload to trigger auth check and redirect to login
    window.location.reload();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const auth = {
  login: (password: string) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => api('/api/auth/logout', { method: 'POST' }),
  check: () => api('/api/auth/check'),
};

export const wallets = {
  list: () => api('/api/wallets'),
  create: (data: { address: string; label?: string }) => api('/api/wallets', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => api(`/api/wallets/${id}`, { method: 'DELETE' }),
  update: (id: number, data: { label?: string; is_active?: boolean }) => api(`/api/wallets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export const transactions = {
  list: (params?: { wallet_id?: number; type?: string; show_spam?: boolean; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.wallet_id) qs.set('wallet_id', String(params.wallet_id));
    if (params?.type) qs.set('type', params.type);
    if (params?.show_spam) qs.set('show_spam', 'true');
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return api(`/api/transactions?${qs}`);
  },
  stats: (wallet_id?: number) => {
    const qs = wallet_id ? `?wallet_id=${wallet_id}` : '';
    return api(`/api/transactions/stats${qs}`);
  },
};
