import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('kbApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  it('logs in and sends bearer token on later calls', async () => {
    vi.stubEnv('VITE_KB_API_URL', 'https://aintegration-kb-api.cihanhartamaci.workers.dev');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'tok',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { loginWithKbApi, callKbApi, getSessionToken } = await import('./kbApi');
    await loginWithKbApi('u', 'p');
    expect(getSessionToken()).toBe('tok');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [] }) });
    await callKbApi('listKnowledge');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });
});

describe('knowledgeBase local fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_KB_API_URL', '');
  });

  it('stores pending then approved locally', async () => {
    const kb = await import('./knowledgeBase');
    const pending = await kb.saveKnowledge('Topic', 'Content', {
      status: 'pending',
      source: 'correction',
    });
    expect(pending.status).toBe('pending');
    expect(kb.getAllKnowledge()).toHaveLength(0);
    await kb.approveKnowledge(pending.id);
    expect(kb.getAllKnowledge()[0].topic).toBe('Topic');
  });
});
