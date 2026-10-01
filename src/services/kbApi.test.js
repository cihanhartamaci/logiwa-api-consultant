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
        role: 'admin',
        username: 'integrationsteam',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { loginWithKbApi, callKbApi, getSessionToken, getSessionRole, canModerateKnowledge } =
      await import('./kbApi');
    await loginWithKbApi('integrationsteam', 'p');
    expect(getSessionToken()).toBe('tok');
    expect(getSessionRole()).toBe('admin');
    expect(canModerateKnowledge()).toBe(true);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [] }) });
    await callKbApi('listKnowledge');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });

  it('support role cannot moderate knowledge', async () => {
    vi.stubEnv('VITE_KB_API_URL', 'https://aintegration-kb-api.cihanhartamaci.workers.dev');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'support-tok',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          role: 'support',
          username: 'supportteam',
        }),
      })
    );
    const { loginWithKbApi, getSessionRole, canModerateKnowledge } = await import('./kbApi');
    await loginWithKbApi('supportteam', 'p');
    expect(getSessionRole()).toBe('support');
    expect(canModerateKnowledge()).toBe(false);
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

  it('keeps best-practice documents out of the system prompt but in the search corpus', async () => {
    const kb = await import('./knowledgeBase');
    let corpus = [];
    kb.onLearnedCorpusChange((entries) => {
      corpus = entries;
    });
    const doc = await kb.submitBestPracticeDocument({
      title: 'Shopify sync best practices',
      content: 'Always map clientIdentifier before creating shipment orders.',
      url: 'https://example.com/guide',
      filename: 'shopify.md',
    });
    expect(doc.status).toBe('approved');
    expect(doc.source).toBe(kb.DOCUMENT_SOURCE);
    expect(kb.getAllKnowledge().some((e) => e.id === doc.id)).toBe(false);
    expect(corpus.find((e) => e.id === doc.id)?.url).toBe('https://example.com/guide');
  });

  it('rejects empty or oversized documents', async () => {
    const kb = await import('./knowledgeBase');
    await expect(kb.submitBestPracticeDocument({ title: '', content: 'x' })).rejects.toThrow(/Title/);
    await expect(
      kb.submitBestPracticeDocument({ title: 'Big', content: 'a'.repeat(kb.MAX_DOCUMENT_CHARS + 1) })
    ).rejects.toThrow(/too long/);
  });
});

describe('best-practice documents for support', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubEnv('VITE_KB_API_URL', 'https://aintegration-kb-api.cihanhartamaci.workers.dev');
  });

  it('submits support documents as pending', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'support-tok',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          role: 'support',
          username: 'supportteam',
        }),
      })
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({ entry: { id: 'd1', ...body } }),
        };
      });
    vi.stubGlobal('fetch', fetchMock);
    const { loginWithKbApi } = await import('./kbApi');
    const kb = await import('./knowledgeBase');
    await loginWithKbApi('supportteam', 'p');
    const entry = await kb.submitBestPracticeDocument({ title: 'Doc', content: 'Body' });
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.action).toBe('saveKnowledge');
    expect(sent.status).toBe('pending');
    expect(sent.source).toBe('document');
    expect(entry.status).toBe('pending');
  });
});
