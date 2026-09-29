import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

describe('kbApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('builds login payload and stores session token', async () => {
    vi.stubEnv('VITE_KB_API_URL', 'https://example.supabase.co/functions/v1/kb-api');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'test-token',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loginWithKbApi, getSessionToken, callKbApi } = await import('./kbApi');
    await loginWithKbApi('integrationsteam', 'secret');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/kb-api',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'login',
          username: 'integrationsteam',
          password: 'secret',
        }),
      })
    );
    expect(getSessionToken()).toBe('test-token');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ entries: [] }),
    });
    await callKbApi('listKnowledge');
    const secondCall = fetchMock.mock.calls[1][1];
    expect(secondCall.headers.Authorization).toBe('Bearer test-token');
  });

  it('reports configured only when VITE_KB_API_URL is set', async () => {
    vi.stubEnv('VITE_KB_API_URL', '');
    const empty = await import('./kbApi');
    expect(empty.isKbApiConfigured()).toBe(false);

    vi.resetModules();
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubEnv('VITE_KB_API_URL', 'https://example.supabase.co/functions/v1/kb-api');
    const configured = await import('./kbApi');
    expect(configured.isKbApiConfigured()).toBe(true);
  });
});
