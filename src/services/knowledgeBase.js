import { buildFeedbackPayload, topicFromCorrection } from './feedback';
import { callKbApi, isKbApiConfigured } from './kbApi';

const CACHE_KEY = 'logiwa_learned_knowledge';
const PROMPT_CAP = 40;

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

export function getAllKnowledge() {
  return approvedForPrompt.slice(0, PROMPT_CAP);
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
  const { status = 'approved', source = 'teach', feedbackId = null } = options;

  if (!isKbApiConfigured()) {
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

  const data = await callKbApi('saveKnowledge', { topic, content, status, source, feedbackId });
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
        { status: 'pending', source: 'correction' }
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

export function exportKnowledgeJson() {
  return JSON.stringify(getKnowledgeDeskEntries(), null, 2);
}

deskEntries = readLocalCache().map((e) => ({
  ...e,
  status: e.status || 'approved',
  source: e.source || 'teach',
}));
setApprovedFromDesk();
