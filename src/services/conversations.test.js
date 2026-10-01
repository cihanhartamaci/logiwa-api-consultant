import { describe, expect, it } from 'vitest';
import {
  CONVERSATIONS_KEY,
  DEFAULT_TITLE,
  LEGACY_HISTORY_KEY,
  MAX_CONVERSATIONS,
  capConversations,
  createConversation,
  deleteConversation,
  deriveTitle,
  formatRelativeTime,
  loadConversationState,
  mapAllMessages,
  migrateLegacyHistory,
  saveConversationState,
  serializeConversationState,
  sortConversations,
  startNewConversation,
  switchConversation,
  updateConversationMessages,
} from './conversations';

function memoryStorage(initial = {}, { quotaBytes = Infinity } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (String(value).length > quotaBytes) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key),
  };
}

const user = (content) => ({ role: 'user', content });
const model = (content, extra = {}) => ({ role: 'model', content, ...extra });

describe('deriveTitle', () => {
  it('uses "New chat" until there is a user message', () => {
    expect(deriveTitle([])).toBe(DEFAULT_TITLE);
    expect(deriveTitle([model('hi')])).toBe(DEFAULT_TITLE);
    expect(deriveTitle([user('   ')])).toBe(DEFAULT_TITLE);
  });

  it('uses the first user message, collapsing whitespace', () => {
    expect(deriveTitle([user('  How do\n webhooks work? '), user('second')])).toBe('How do webhooks work?');
  });

  it('trims long titles to about 48 chars with an ellipsis', () => {
    const title = deriveTitle([user('a'.repeat(30) + ' ' + 'b'.repeat(40))]);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('ordering and updates', () => {
  it('sorts most recently updated first', () => {
    const a = { ...createConversation({ now: 1 }), id: 'a' };
    const b = { ...createConversation({ now: 3 }), id: 'b' };
    const c = { ...createConversation({ now: 2 }), id: 'c' };
    expect(sortConversations([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('bumps updatedAt, re-sorts, and retitles when a message is added', () => {
    const a = createConversation({ now: 1, id: 'a', messages: [user('old')] });
    const b = createConversation({ now: 2, id: 'b', messages: [user('newer')] });
    const next = updateConversationMessages([b, a], 'a', (m) => [...m, model('reply')], 10);
    expect(next.map((c) => c.id)).toEqual(['a', 'b']);
    expect(next[0].updatedAt).toBe(10);
    expect(next[0].title).toBe('old');
  });

  it('does not reorder on in-place edits like feedback', () => {
    const a = createConversation({ now: 1, id: 'a', messages: [user('q'), model('r')] });
    const b = createConversation({ now: 2, id: 'b', messages: [user('q2')] });
    const next = updateConversationMessages(
      [b, a],
      'a',
      (m) => m.map((msg, i) => (i === 1 ? { ...msg, feedbackRating: 'up' } : msg)),
      10
    );
    expect(next.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next[1].updatedAt).toBe(1);
    expect(next[1].messages[1].feedbackRating).toBe('up');
  });

  it('ignores updates for a deleted conversation', () => {
    const list = [createConversation({ id: 'a' })];
    expect(updateConversationMessages(list, 'gone', (m) => [...m, user('x')])).toBe(list);
  });

  it('maps messages across all conversations and keeps identity when unchanged', () => {
    const list = [
      createConversation({ id: 'a', messages: [model('r', { proposedKnowledge: { id: 'k1' } })] }),
      createConversation({ id: 'b', messages: [model('r2')] }),
    ];
    expect(mapAllMessages(list, (m) => m)).toBe(list);
    const next = mapAllMessages(list, (m) =>
      m.proposedKnowledge?.id === 'k1' ? { ...m, proposedKnowledge: null } : m
    );
    expect(next[0].messages[0].proposedKnowledge).toBeNull();
    expect(next[1]).toBe(list[1]);
  });
});

describe('new chat, switching, and delete', () => {
  it('reuses the active chat when it is already empty', () => {
    const empty = createConversation({ id: 'e' });
    const state = { conversations: [empty], activeId: 'e' };
    expect(startNewConversation(state)).toBe(state);
  });

  it('creates a fresh empty chat when the active one has messages', () => {
    const a = createConversation({ id: 'a', messages: [user('q')] });
    const next = startNewConversation({ conversations: [a], activeId: 'a' }, 50);
    expect(next.conversations).toHaveLength(2);
    expect(next.activeId).not.toBe('a');
    expect(next.conversations.find((c) => c.id === next.activeId).messages).toEqual([]);
  });

  it('drops the empty chat when switching away from it', () => {
    const a = createConversation({ id: 'a', now: 1, messages: [user('q')] });
    const empty = createConversation({ id: 'e', now: 2 });
    const next = switchConversation({ conversations: [empty, a], activeId: 'e' }, 'a');
    expect(next.activeId).toBe('a');
    expect(next.conversations.map((c) => c.id)).toEqual(['a']);
  });

  it('clears pending typewriter animation in the chat being left', () => {
    const a = createConversation({ id: 'a', now: 2, messages: [user('q'), model('r', { animate: true })] });
    const b = createConversation({ id: 'b', now: 1, messages: [user('q2')] });
    const next = switchConversation({ conversations: [a, b], activeId: 'a' }, 'b');
    expect('animate' in next.conversations[0].messages[1]).toBe(false);
  });

  it('falls back to the next most recent chat when deleting the active one', () => {
    const a = createConversation({ id: 'a', now: 3, messages: [user('a')] });
    const b = createConversation({ id: 'b', now: 2, messages: [user('b')] });
    const c = createConversation({ id: 'c', now: 1, messages: [user('c')] });
    const next = deleteConversation({ conversations: [a, b, c], activeId: 'a' }, 'a');
    expect(next.activeId).toBe('b');
    expect(next.conversations.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('keeps the active chat when deleting a different one', () => {
    const a = createConversation({ id: 'a', now: 3, messages: [user('a')] });
    const b = createConversation({ id: 'b', now: 2, messages: [user('b')] });
    const next = deleteConversation({ conversations: [a, b], activeId: 'a' }, 'b');
    expect(next).toEqual({ conversations: [a], activeId: 'a' });
  });

  it('starts a fresh empty chat when the last one is deleted', () => {
    const a = createConversation({ id: 'a', messages: [user('a')] });
    const next = deleteConversation({ conversations: [a], activeId: 'a' }, 'a');
    expect(next.conversations).toHaveLength(1);
    expect(next.conversations[0].messages).toEqual([]);
    expect(next.activeId).toBe(next.conversations[0].id);
  });
});

describe('cap', () => {
  it('keeps the newest conversations and always keeps the active one', () => {
    const list = Array.from({ length: MAX_CONVERSATIONS + 5 }, (_, i) =>
      createConversation({ id: `c${i}`, now: i + 1, messages: [user(`q${i}`)] })
    );
    const capped = capConversations(list, MAX_CONVERSATIONS, 'c0');
    expect(capped).toHaveLength(MAX_CONVERSATIONS);
    expect(capped[0].id).toBe(`c${MAX_CONVERSATIONS + 4}`);
    expect(capped.some((c) => c.id === 'c0')).toBe(true);
    expect(capped.some((c) => c.id === 'c1')).toBe(false);
  });

  it('drops the oldest conversations when localStorage hits its quota', () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      createConversation({ id: `c${i}`, now: i + 1, messages: [user('x'.repeat(200))] })
    );
    const state = { conversations: sortConversations(list), activeId: 'c0' };
    const twoChats = serializeConversationState({
      conversations: state.conversations.slice(0, 2),
      activeId: 'c0',
    }).length;
    const storage = memoryStorage({}, { quotaBytes: twoChats + 10 });
    expect(saveConversationState(storage, state)).toBe(true);
    const saved = JSON.parse(storage.getItem(CONVERSATIONS_KEY));
    expect(saved.conversations.length).toBeLessThan(5);
    expect(saved.conversations.some((c) => c.id === 'c0')).toBe(true);
    expect(saved.conversations[0].id).toBe('c4');
  });

  it('never throws when nothing fits', () => {
    const storage = memoryStorage({}, { quotaBytes: 5 });
    const state = { conversations: [createConversation({ id: 'a', messages: [user('q')] })], activeId: 'a' };
    expect(saveConversationState(storage, state)).toBe(false);
  });
});

describe('persistence and migration', () => {
  it('does not persist animate: true', () => {
    const storage = memoryStorage();
    const conv = createConversation({ id: 'a', messages: [user('q'), model('r', { animate: true, provider: 'gemini' })] });
    saveConversationState(storage, { conversations: [conv], activeId: 'a' });
    const saved = JSON.parse(storage.getItem(CONVERSATIONS_KEY));
    expect(saved.conversations[0].messages[1]).toEqual({ role: 'model', content: 'r', provider: 'gemini' });
  });

  it('migrates the old single-chat history into one conversation and removes the old key', () => {
    const legacy = JSON.stringify({
      timestamp: 1000,
      data: [user('How do I authorize?'), model('Use the token endpoint', { animate: true, feedbackRating: 'up' })],
    });
    const storage = memoryStorage({ [LEGACY_HISTORY_KEY]: legacy });
    const state = loadConversationState(storage, 5000);

    expect(state.conversations).toHaveLength(1);
    const [conv] = state.conversations;
    expect(state.activeId).toBe(conv.id);
    expect(conv.title).toBe('How do I authorize?');
    expect(conv.updatedAt).toBe(1000);
    expect(conv.messages[1]).toEqual({ role: 'model', content: 'Use the token endpoint', feedbackRating: 'up' });
    expect(storage.getItem(LEGACY_HISTORY_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(CONVERSATIONS_KEY)).conversations).toHaveLength(1);
  });

  it('ignores empty or broken legacy payloads', () => {
    expect(migrateLegacyHistory(null)).toBeNull();
    expect(migrateLegacyHistory('not json')).toBeNull();
    expect(migrateLegacyHistory(JSON.stringify({ timestamp: 1, data: [] }))).toBeNull();
  });

  it('starts with a single empty chat when nothing is stored', () => {
    const state = loadConversationState(memoryStorage(), 1);
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0].title).toBe(DEFAULT_TITLE);
    expect(state.activeId).toBe(state.conversations[0].id);
  });

  it('round-trips saved conversations and the active id', () => {
    const storage = memoryStorage();
    const a = createConversation({ id: 'a', now: 2, messages: [user('a')] });
    const b = createConversation({ id: 'b', now: 1, messages: [user('b')] });
    saveConversationState(storage, { conversations: [a, b], activeId: 'b' });
    const loaded = loadConversationState(storage, 10);
    expect(loaded.activeId).toBe('b');
    expect(loaded.conversations.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('formatRelativeTime', () => {
  it('formats short relative times', () => {
    const now = 10 * 24 * 3600 * 1000;
    expect(formatRelativeTime(now - 10_000, now)).toBe('now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m');
    expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe('3h');
    expect(formatRelativeTime(now - 2 * 24 * 3600_000, now)).toBe('2d');
  });
});
