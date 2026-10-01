const SESSION_KEY = 'aintegration_session';
export const AUTH_STORAGE_KEY = 'aintegration_signed_in';

function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage != null;
  } catch {
    return false;
  }
}

export function isKbApiConfigured() {
  return Boolean(String(import.meta.env.VITE_KB_API_URL || '').trim());
}

export function getKbApiUrl() {
  return String(import.meta.env.VITE_KB_API_URL || '').trim().replace(/\/$/, '');
}

function readSessionRecord() {
  try {
    if (!storageAvailable()) return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionToken() {
  return readSessionRecord()?.token || null;
}

export function getSessionRole() {
  const record = readSessionRecord();
  if (!record) return null;
  return record.role === 'admin' ? 'admin' : record.role === 'support' ? 'support' : null;
}

export function getSessionUsername() {
  return readSessionRecord()?.username || null;
}

/** Admin (integrationsteam) may approve/reject/edit knowledge. */
export function canModerateKnowledge() {
  if (!isKbApiConfigured()) return true; // local-only fallback
  return getSessionRole() === 'admin';
}

/** True when the user may use the app UI (Worker session or local flag). */
export function isSessionAuthenticated() {
  if (isKbApiConfigured()) {
    return Boolean(getSessionToken());
  }
  return hasLocalAuthFlag();
}

export function saveSession({ token, expiresAt, role = null, username = null }) {
  if (!storageAvailable()) return;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token,
      expiresAt: expiresAt || null,
      role: role || null,
      username: username || null,
    })
  );
  localStorage.setItem(AUTH_STORAGE_KEY, '1');
}

export function clearSession() {
  try {
    if (!storageAvailable()) return;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasLocalAuthFlag() {
  try {
    return storageAvailable() && localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isAuthError(error) {
  const message = String(error?.message || error || '');
  return (
    /missing session token/i.test(message) ||
    /unauthorized/i.test(message) ||
    /session expired/i.test(message) ||
    /not signed in/i.test(message)
  );
}

export async function callKbApi(action, payload = {}, options = {}) {
  const { requireAuth = true } = options;
  const url = getKbApiUrl();
  if (!url) throw new Error('VITE_KB_API_URL is not configured');

  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth) {
    const token = getSessionToken();
    if (!token) {
      clearSession();
      throw new Error('Session expired. Please sign in again.');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(data?.error || `KB API failed (${response.status})`);
  }
  return data;
}

export async function loginWithKbApi(username, password) {
  const data = await callKbApi('login', { username, password }, { requireAuth: false });
  if (!data?.token) throw new Error('Login succeeded but no session token returned');
  saveSession({
    token: data.token,
    expiresAt: data.expiresAt,
    role: data.role || null,
    username: data.username || username,
  });
  return data;
}
