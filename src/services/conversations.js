export const CONVERSATIONS_KEY = 'aintegration_conversations';
export const LEGACY_HISTORY_KEY = 'logiwa_chat_history';
export const MAX_CONVERSATIONS = 30;
export const TITLE_MAX_LENGTH = 48;
export const DEFAULT_TITLE = 'New chat';

let idCounter = 0;

export function createConversationId(now = Date.now()) {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `c-${now.toString(36)}-${idCounter.toString(36)}-${random}`;
}

export function deriveTitle(messages) {
  const firstUser = (messages || []).find(
    (msg) => msg?.role === 'user' && String(msg.content || '').trim()
  );
  if (!firstUser) return DEFAULT_TITLE;
  const text = String(firstUser.content).replace(/\s+/g, ' ').trim();
  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}

export function createConversation({ now = Date.now(), messages = [], id } = {}) {
  return {
    id: id || createConversationId(now),
    title: deriveTitle(messages),
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

export function isEmptyConversation(conversation) {
  return !conversation?.messages?.length;
}

export function sortConversations(conversations) {
  return [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Keeps the newest `max` conversations; the active one is never dropped. */
export function capConversations(conversations, max = MAX_CONVERSATIONS, keepId = null) {
  const sorted = sortConversations(conversations);
  if (sorted.length <= max) return sorted;
  const kept = sorted.slice(0, max);
  if (keepId && !kept.some((c) => c.id === keepId)) {
    const active = sorted.find((c) => c.id === keepId);
    if (active) kept[kept.length - 1] = active;
  }
  return sortConversations(kept);
}

export function upsertConversation(conversations, conversation) {
  const rest = conversations.filter((c) => c.id !== conversation.id);
  return sortConversations([conversation, ...rest]);
}

/**
 * Applies `updater(messages) => messages` to one conversation. `updatedAt` only moves
 * (and the list re-sorts) when a message is added or removed, so feedback clicks and
 * typewriter completion don't reshuffle the sidebar.
 */
export function updateConversationMessages(conversations, id, updater, now = Date.now()) {
  const target = conversations.find((c) => c.id === id);
  if (!target) return conversations;
  const nextMessages = updater(target.messages);
  if (nextMessages === target.messages) return conversations;
  const grew = nextMessages.length !== target.messages.length;
  const updated = {
    ...target,
    messages: nextMessages,
    title: deriveTitle(nextMessages),
    updatedAt: grew ? now : target.updatedAt,
  };
  const next = conversations.map((c) => (c.id === id ? updated : c));
  return grew ? sortConversations(next) : next;
}

/** Maps every message in every conversation; returns the same array when nothing changed. */
export function mapAllMessages(conversations, mapMessage) {
  let anyChanged = false;
  const next = conversations.map((conversation) => {
    let changed = false;
    const messages = conversation.messages.map((msg) => {
      const mapped = mapMessage(msg);
      if (mapped !== msg) changed = true;
      return mapped;
    });
    if (!changed) return conversation;
    anyChanged = true;
    return { ...conversation, messages };
  });
  return anyChanged ? next : conversations;
}

export function stripAnimate(messages) {
  let changed = false;
  const next = (messages || []).map((msg) => {
    if (!msg || !('animate' in msg)) return msg;
    changed = true;
    const rest = { ...msg };
    delete rest.animate;
    return rest;
  });
  return changed ? next : messages;
}

function dropEmptyExcept(conversations, keepId) {
  return conversations.filter((c) => c.id === keepId || !isEmptyConversation(c));
}

/** Reuses the active chat (or any other empty chat) instead of piling up empty ones. */
export function startNewConversation(state, now = Date.now()) {
  const active = state.conversations.find((c) => c.id === state.activeId);
  if (active && isEmptyConversation(active)) return state;
  const existingEmpty = state.conversations.find(isEmptyConversation);
  if (existingEmpty) return { ...state, activeId: existingEmpty.id };
  const fresh = createConversation({ now });
  return {
    conversations: capConversations([fresh, ...state.conversations], MAX_CONVERSATIONS, fresh.id),
    activeId: fresh.id,
  };
}

/** Switching away from an empty chat discards it so empty rows don't accumulate. */
export function switchConversation(state, id) {
  if (id === state.activeId || !state.conversations.some((c) => c.id === id)) return state;
  const conversations = dropEmptyExcept(state.conversations, id).map((c) => {
    if (c.id !== state.activeId) return c;
    const messages = stripAnimate(c.messages);
    return messages === c.messages ? c : { ...c, messages };
  });
  return { conversations, activeId: id };
}

export function deleteConversation(state, id, now = Date.now()) {
  const remaining = sortConversations(state.conversations.filter((c) => c.id !== id));
  if (remaining.length === state.conversations.length) return state;
  if (id !== state.activeId) return { conversations: remaining, activeId: state.activeId };
  if (remaining.length) return { conversations: remaining, activeId: remaining[0].id };
  const fresh = createConversation({ now });
  return { conversations: [fresh], activeId: fresh.id };
}

function normalizeConversation(raw, now) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const messages = Array.isArray(raw.messages) ? stripAnimate(raw.messages) : [];
  const createdAt = Number(raw.createdAt) || now;
  return {
    id: String(raw.id),
    title: deriveTitle(messages),
    createdAt,
    updatedAt: Number(raw.updatedAt) || createdAt,
    messages,
  };
}

/** Converts the old single-chat `{ timestamp, data }` payload into one conversation. */
export function migrateLegacyHistory(raw, now = Date.now()) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
    const messages = stripAnimate(data.filter((msg) => msg && msg.role && msg.content != null));
    if (!messages.length) return null;
    const timestamp = Number(parsed?.timestamp) || now;
    return createConversation({ now: timestamp, messages });
  } catch {
    return null;
  }
}

function readStoredState(storage, now) {
  const raw = storage.getItem(CONVERSATIONS_KEY);
  if (!raw) return { conversations: [], activeId: null };
  try {
    const parsed = JSON.parse(raw);
    const conversations = (Array.isArray(parsed?.conversations) ? parsed.conversations : [])
      .map((c) => normalizeConversation(c, now))
      .filter(Boolean);
    return { conversations, activeId: parsed?.activeId || null };
  } catch {
    return { conversations: [], activeId: null };
  }
}

export function loadConversationState(storage, now = Date.now()) {
  let { conversations, activeId } = readStoredState(storage, now);

  const legacyRaw = storage.getItem(LEGACY_HISTORY_KEY);
  let migrated = false;
  if (legacyRaw != null) {
    const legacy = migrateLegacyHistory(legacyRaw, now);
    if (legacy) {
      conversations = [legacy, ...conversations];
      activeId = legacy.id;
    }
    migrated = true;
  }

  conversations = dropEmptyExcept(sortConversations(conversations), activeId);
  if (!conversations.some((c) => c.id === activeId)) {
    activeId = conversations[0]?.id || null;
  }
  if (!activeId) {
    const fresh = createConversation({ now });
    conversations = [fresh, ...conversations];
    activeId = fresh.id;
  }
  const state = { conversations: capConversations(conversations, MAX_CONVERSATIONS, activeId), activeId };

  if (migrated && saveConversationState(storage, state)) {
    storage.removeItem(LEGACY_HISTORY_KEY);
  }
  return state;
}

export function serializeConversationState(state) {
  return JSON.stringify({
    version: 1,
    activeId: state.activeId,
    conversations: state.conversations.map((c) => ({ ...c, messages: stripAnimate(c.messages) })),
  });
}

/**
 * Persists conversations; on any storage error (quota) it drops the oldest non-active
 * conversation and retries. Returns true when something was saved.
 */
export function saveConversationState(storage, state) {
  let conversations = capConversations(state.conversations, MAX_CONVERSATIONS, state.activeId);
  for (;;) {
    try {
      storage.setItem(
        CONVERSATIONS_KEY,
        serializeConversationState({ conversations, activeId: state.activeId })
      );
      return true;
    } catch (err) {
      const oldestIndex = conversations.findLastIndex((c) => c.id !== state.activeId);
      if (oldestIndex === -1) {
        console.warn('Could not save chats to localStorage', err);
        return false;
      }
      conversations = conversations.filter((_, i) => i !== oldestIndex);
    }
  }
}

export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Math.max(0, now - (Number(timestamp) || now));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
