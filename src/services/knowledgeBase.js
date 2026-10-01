import { buildFeedbackPayload, topicFromCorrection } from './feedback';
import { callKbApi, canModerateKnowledge, isKbApiConfigured } from './kbApi';

const CACHE_KEY = 'logiwa_learned_knowledge';
const PROMPT_CAP = 40;
export const DOCUMENT_SOURCE = 'document';
export const MAX_DOCUMENT_CHARS = 200000;

let memoryStore = [];
let deskEntries = [];
let approvedForPrompt = [];
let corpusListener = null;

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage != null;
  } catch {
    return false;
  }
}

function readLocalCache() {
  try {
    if (!storageAvailable()) return [...memoryStore];
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [...memoryStore];
  }
}

function writeLocalCache(entries) {
  memoryStore = Array.isArray(entries) ? [...entries] : [];
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memoryStore));
  } catch {
    /* ignore */
  }
}

function sortNewest(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function setApprovedFromDesk() {
  approvedForPrompt = deskEntries
    .filter((e) => e.status === 'approved')
    .sort(sortNewest)
    .map((e) => ({
      id: e.id,
      topic: e.topic,
      content: e.content,
      source: e.source || 'teach',
      url: e.url || null,
      createdAt: e.createdAt,
    }));
  writeLocalCache(deskEntries);
  if (corpusListener) corpusListener(approvedForPrompt);
}

export function onLearnedCorpusChange(listener) {
  corpusListener = listener;
  if (typeof listener === 'function') listener(approvedForPrompt);
}

export function isSharedKnowledgeEnabled() {
  return isKbApiConfigured();
}

/** Short taught rules for the system prompt; documents are reached through search only. */
export function getAllKnowledge() {
  return approvedForPrompt.filter((e) => e.source !== DOCUMENT_SOURCE).slice(0, PROMPT_CAP);
}

export function getKnowledgeDeskEntries() {
  return [...deskEntries].sort(sortNewest);
}

export async function refreshKnowledgeFromRemote() {
  const local = readLocalCache();
  if (!isKbApiConfigured()) {
    deskEntries = local.map((e) => ({
      ...e,
      status: e.status || 'approved',
      source: e.source || 'teach',
    }));
    setApprovedFromDesk();
    return deskEntries;
  }

  try {
    const data = await callKbApi('listKnowledge');
    deskEntries = data?.entries || [];
    setApprovedFromDesk();
    return deskEntries;
  } catch (error) {
    console.error('Failed to load shared knowledge', error);
    deskEntries = local.map((e) => ({
      ...e,
      status: e.status || 'approved',
      source: e.source || 'teach',
    }));
    setApprovedFromDesk();
    return deskEntries;
  }
}

export async function saveKnowledge(topic, content, options = {}) {
  const {
    status = 'approved',
    source = 'teach',
    feedbackId = null,
    url = null,
    filename = null,
  } = options;

  if (!isKbApiConfigured()) {
    const newEntry = {
      id: Date.now().toString(),
      topic,
      content,
      status,
      source,
      url,
      filename,
      feedbackId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    deskEntries = [newEntry, ...deskEntries.filter((e) => e.id !== newEntry.id)];
    setApprovedFromDesk();
    return newEntry;
  }

  const data = await callKbApi('saveKnowledge', {
    topic,
    content,
    status,
    source,
    feedbackId,
    url,
    filename,
  });
  const mapped = data.entry;
  deskEntries = [mapped, ...deskEntries.filter((e) => e.id !== mapped.id)];
  setApprovedFromDesk();
  return mapped;
}

export async function approveKnowledge(id, overrides = {}) {
  if (!isKbApiConfigured()) {
    deskEntries = deskEntries.map((e) =>
      e.id === id ? { ...e, status: 'approved', ...overrides } : e
    );
    setApprovedFromDesk();
    return deskEntries.find((e) => e.id === id);
  }
  const data = await callKbApi('approve', {
    id,
    topic: overrides.topic,
    content: overrides.content,
  });
  const mapped = data.entry;
  deskEntries = deskEntries.map((e) => (e.id === mapped.id ? mapped : e));
  if (!deskEntries.some((e) => e.id === mapped.id)) deskEntries = [mapped, ...deskEntries];
  setApprovedFromDesk();
  return mapped;
}

export async function rejectKnowledge(id) {
  if (!isKbApiConfigured()) {
    deskEntries = deskEntries.filter((e) => e.id !== id);
    setApprovedFromDesk();
    return null;
  }
  const data = await callKbApi('reject', { id });
  const mapped = data.entry;
  deskEntries = deskEntries.map((e) => (e.id === mapped.id ? mapped : e));
  setApprovedFromDesk();
  return mapped;
}

export async function updateKnowledge(id, { topic, content, status } = {}) {
  if (!isKbApiConfigured()) {
    deskEntries = deskEntries.map((e) =>
      e.id === id
        ? { ...e, topic: topic ?? e.topic, content: content ?? e.content, status: status ?? e.status }
        : e
    );
    setApprovedFromDesk();
    return deskEntries.find((e) => e.id === id);
  }
  const data = await callKbApi('update', { id, topic, content, status });
  const mapped = data.entry;
  deskEntries = deskEntries.map((e) => (e.id === mapped.id ? mapped : e));
  setApprovedFromDesk();
  return mapped;
}

export async function deleteKnowledge(id) {
  if (!isKbApiConfigured()) {
    deskEntries = deskEntries.filter((e) => e.id !== id);
    setApprovedFromDesk();
    return;
  }
  await callKbApi('delete', { id });
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

  if (!isKbApiConfigured()) {
    let pendingKnowledge = null;
    if (rating === 'down' && correctionText) {
      pendingKnowledge = await saveKnowledge(
        topicFromCorrection(correctionText, questionText),
        correctionText,
        {
          status: canModerateKnowledge() ? 'approved' : 'pending',
          source: 'correction',
        }
      );
    }
    return { feedback: { id: `local-fb-${Date.now()}`, ...payload }, pendingKnowledge };
  }

  const data = await callKbApi('submitFeedback', {
    rating: payload.rating,
    questionText: payload.question_text,
    answerText: payload.answer_text,
    correctionText: payload.correction_text,
    provider: payload.provider,
    clientId: payload.client_id,
  });

  if (data?.pendingKnowledge) {
    deskEntries = [
      data.pendingKnowledge,
      ...deskEntries.filter((e) => e.id !== data.pendingKnowledge.id),
    ];
    setApprovedFromDesk();
  }

  return { feedback: data.feedback, pendingKnowledge: data.pendingKnowledge || null };
}

/** Admin uploads go live immediately; everyone else waits for integrationsteam approval. */
export async function submitBestPracticeDocument({ title, content, url = null, filename = null }) {
  const cleanTitle = String(title || '').trim();
  const cleanContent = String(content || '').trim();
  if (!cleanTitle) throw new Error('Title is required.');
  if (!cleanContent) throw new Error('Document content is required.');
  if (cleanContent.length > MAX_DOCUMENT_CHARS) {
    throw new Error(
      `Document is too long (${cleanContent.length.toLocaleString('en-US')} characters). Max is ${MAX_DOCUMENT_CHARS.toLocaleString('en-US')}.`
    );
  }
  return saveKnowledge(cleanTitle, cleanContent, {
    status: canModerateKnowledge() ? 'approved' : 'pending',
    source: DOCUMENT_SOURCE,
    url: String(url || '').trim() || null,
    filename,
  });
}

export function exportKnowledgeJson() {
  return JSON.stringify(getKnowledgeDeskEntries(), null, 2);
}

deskEntries = readLocalCache().map((e) => ({
  ...e,
  status: e.status || 'approved',
  source: e.source || 'teach',
}));
setApprovedFromDesk();
