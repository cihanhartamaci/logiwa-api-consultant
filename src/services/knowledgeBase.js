import { getSupabaseClient, getTeamWriteSecret, isSupabaseConfigured } from './supabaseClient';
import { buildFeedbackPayload, topicFromCorrection } from './feedback';

const CACHE_KEY = 'logiwa_learned_knowledge';
const PROMPT_CAP = 40;

/** In-memory fallback when localStorage is unavailable (tests / SSR). */
let memoryStore = [];

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage != null;
  } catch {
    return false;
  }
}

/** @type {Array<Record<string, unknown>>} */
let deskEntries = [];
/** @type {Array<{id: string, topic: string, content: string, createdAt?: string}>} */
let approvedForPrompt = [];
/** @type {((entries: Array<{id: string, topic: string, content: string}>) => void) | null} */
let corpusListener = null;

function readLocalCache() {
  try {
    if (!storageAvailable()) return [...memoryStore];
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse knowledge base', e);
    return [...memoryStore];
  }
}

function writeLocalCache(entries) {
  memoryStore = Array.isArray(entries) ? [...entries] : [];
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memoryStore));
  } catch (e) {
    console.error('Failed to persist knowledge base', e);
  }
}

function mapRemoteRow(row) {
  return {
    id: row.id,
    topic: row.topic,
    content: row.content,
    status: row.status,
    source: row.source,
    feedbackId: row.feedback_id || null,
    upvotes: row.upvotes || 0,
    downvotes: row.downvotes || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortNewest(a, b) {
  const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return tb - ta;
}

function setApprovedFromDesk() {
  approvedForPrompt = deskEntries
    .filter((e) => e.status === 'approved')
    .sort(sortNewest)
    .map((e) => ({
      id: e.id,
      topic: e.topic,
      content: e.content,
      createdAt: e.createdAt,
    }));
  writeLocalCache(deskEntries);
  if (corpusListener) {
    corpusListener(approvedForPrompt);
  }
}

export function onLearnedCorpusChange(listener) {
  corpusListener = listener;
  if (typeof listener === 'function') {
    listener(approvedForPrompt);
  }
}

export function isSharedKnowledgeEnabled() {
  return isSupabaseConfigured();
}

/** Approved knowledge for system-prompt injection (capped). */
export function getAllKnowledge() {
  return approvedForPrompt.slice(0, PROMPT_CAP);
}

/** Full desk list (all statuses). */
export function getKnowledgeDeskEntries() {
  return [...deskEntries].sort(sortNewest);
}

export function getApprovedKnowledgeForRetrieval() {
  return approvedForPrompt;
}

async function callManageKnowledge(payload) {
  const supabase = getSupabaseClient();
  const secret = getTeamWriteSecret();
  if (!supabase) throw new Error('Supabase is not configured');
  if (!secret) throw new Error('VITE_TEAM_WRITE_SECRET is not set');

  const { data, error } = await supabase.rpc('manage_knowledge', {
    p_secret: secret,
    p_action: payload.action,
    p_id: payload.id || null,
    p_topic: payload.topic ?? null,
    p_content: payload.content ?? null,
    p_status: payload.status ?? null,
    p_source: payload.source ?? 'teach',
    p_feedback_id: payload.feedbackId ?? null,
  });
  if (error) throw error;
  return mapRemoteRow(data);
}

/**
 * Load shared + local knowledge. Safe to call without Supabase (uses cache).
 */
export async function refreshKnowledgeFromRemote() {
  const local = readLocalCache();
  if (!isSupabaseConfigured()) {
    deskEntries = local.map((e) => ({
      ...e,
      status: e.status || 'approved',
      source: e.source || 'teach',
    }));
    setApprovedFromDesk();
    return deskEntries;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('knowledge_entries')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to load shared knowledge', error);
    deskEntries = local.map((e) => ({
      ...e,
      status: e.status || 'approved',
      source: e.source || 'teach',
    }));
    setApprovedFromDesk();
    return deskEntries;
  }

  deskEntries = (data || []).map(mapRemoteRow);
  setApprovedFromDesk();
  return deskEntries;
}

/**
 * Save knowledge. Shared mode: inserts pending (or approved via RPC when status=approved).
 * Local mode: appends to localStorage as approved.
 */
export async function saveKnowledge(topic, content, options = {}) {
  const {
    status = 'approved',
    source = 'teach',
    feedbackId = null,
  } = options;

  if (!isSupabaseConfigured()) {
    const newEntry = {
      id: Date.now().toString(),
      topic,
      content,
      status,
      source,
      feedbackId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    deskEntries = [newEntry, ...deskEntries.filter((e) => e.id !== newEntry.id)];
    setApprovedFromDesk();
    return newEntry;
  }

  if (status === 'pending') {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('knowledge_entries')
      .insert({
        topic,
        content,
        status: 'pending',
        source,
        feedback_id: feedbackId,
      })
      .select()
      .single();
    if (error) throw error;
    const mapped = mapRemoteRow(data);
    deskEntries = [mapped, ...deskEntries.filter((e) => e.id !== mapped.id)];
    setApprovedFromDesk();
    return mapped;
  }

  const mapped = await callManageKnowledge({
    action: 'insert',
    topic,
    content,
    status: 'approved',
    source,
    feedbackId,
  });
  deskEntries = [mapped, ...deskEntries.filter((e) => e.id !== mapped.id)];
  setApprovedFromDesk();
  return mapped;
}

export async function approveKnowledge(id, overrides = {}) {
  if (!isSupabaseConfigured()) {
    deskEntries = deskEntries.map((e) =>
      e.id === id ? { ...e, status: 'approved', ...overrides } : e
    );
    setApprovedFromDesk();
    return deskEntries.find((e) => e.id === id);
  }

  const mapped = await callManageKnowledge({
    action: 'approve',
    id,
    topic: overrides.topic,
    content: overrides.content,
  });
  deskEntries = deskEntries.map((e) => (e.id === mapped.id ? mapped : e));
  if (!deskEntries.some((e) => e.id === mapped.id)) {
    deskEntries = [mapped, ...deskEntries];
  }
  setApprovedFromDesk();
  return mapped;
}

export async function rejectKnowledge(id) {
  if (!isSupabaseConfigured()) {
    deskEntries = deskEntries.filter((e) => e.id !== id);
    setApprovedFromDesk();
    return null;
  }

  const mapped = await callManageKnowledge({ action: 'reject', id });
  deskEntries = deskEntries.map((e) => (e.id === mapped.id ? mapped : e));
  setApprovedFromDesk();
  return mapped;
}

export async function updateKnowledge(id, { topic, content, status } = {}) {
  if (!isSupabaseConfigured()) {
    deskEntries = deskEntries.map((e) =>
      e.id === id
        ? {
            ...e,
            topic: topic ?? e.topic,
            content: content ?? e.content,
            status: status ?? e.status,
          }
        : e
    );
    setApprovedFromDesk();
    return deskEntries.find((e) => e.id === id);
  }

  const mapped = await callManageKnowledge({
    action: 'update',
    id,
    topic,
    content,
    status,
  });
  deskEntries = deskEntries.map((e) => (e.id === mapped.id ? mapped : e));
  setApprovedFromDesk();
  return mapped;
}

export async function deleteKnowledge(id) {
  if (!isSupabaseConfigured()) {
    deskEntries = deskEntries.filter((e) => e.id !== id);
    setApprovedFromDesk();
    return;
  }

  await callManageKnowledge({ action: 'delete', id });
  deskEntries = deskEntries.filter((e) => e.id !== id);
  setApprovedFromDesk();
}

export async function submitAnswerFeedback({
  rating,
  questionText,
  answerText,
  correctionText = null,
  provider = null,
}) {
  const payload = buildFeedbackPayload({
    rating,
    questionText,
    answerText,
    correctionText,
    provider,
  });

  if (!isSupabaseConfigured()) {
    const localId = `local-fb-${Date.now()}`;
    let pendingKnowledge = null;
    if (rating === 'down' && correctionText) {
      pendingKnowledge = await saveKnowledge(
        topicFromCorrection(correctionText, questionText),
        correctionText,
        { status: 'pending', source: 'correction' }
      );
    }
    return { feedback: { id: localId, ...payload }, pendingKnowledge };
  }

  const supabase = getSupabaseClient();
  const { data: feedback, error } = await supabase
    .from('answer_feedback')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  let pendingKnowledge = null;
  if (rating === 'down' && correctionText) {
    pendingKnowledge = await saveKnowledge(
      topicFromCorrection(correctionText, questionText),
      String(correctionText),
      {
        status: 'pending',
        source: 'correction',
        feedbackId: feedback.id,
      }
    );
  }

  return { feedback, pendingKnowledge };
}

export function exportKnowledgeJson() {
  return JSON.stringify(getKnowledgeDeskEntries(), null, 2);
}

// Hydrate from local cache on module load so prompt works before refresh finishes.
deskEntries = readLocalCache().map((e) => ({
  ...e,
  status: e.status || 'approved',
  source: e.source || 'teach',
}));
setApprovedFromDesk();
