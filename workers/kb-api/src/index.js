/**
 * AIntegration shared KB API — Cloudflare Worker + KV.
 * Bindings: KB (KV namespace)
 * Secrets:
 *   SESSION_SIGNING_KEY (required)
 *   APP_USERNAME / APP_PASSWORD — admin (integrationsteam); also ADMIN_USERNAME / ADMIN_PASSWORD
 *   SUPPORT_USERNAME / SUPPORT_PASSWORD — supportteam (feedback only)
 */

const ALLOWED_ORIGINS = [
  'https://cihanhartamaci.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const KNOWLEDGE_KEY = 'knowledge_entries';
const FEEDBACK_KEY = 'answer_feedback';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

function b64urlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signSession(username, role, signingKey, ttlSeconds = 12 * 60 * 60) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ sub: username, role, exp });
  const payloadBytes = new TextEncoder().encode(payload);
  const key = await hmacKey(signingKey);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return {
    token: `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    username,
    role,
  };
}

async function verifySession(authHeader, signingKey) {
  if (!authHeader || !signingKey) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const payloadBytes = b64urlDecode(parts[0]);
    const sigBytes = b64urlDecode(parts[1]);
    const key = await hmacKey(signingKey);
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload?.sub || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sub: payload.sub,
      role: payload.role === 'admin' ? 'admin' : 'support',
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function resolveUsers(env) {
  const adminUser = String(env.ADMIN_USERNAME || env.APP_USERNAME || 'integrationsteam').trim();
  const adminPass = String(env.ADMIN_PASSWORD || env.APP_PASSWORD || '');
  const supportUser = String(env.SUPPORT_USERNAME || 'supportteam').trim();
  const supportPass = String(env.SUPPORT_PASSWORD || '');
  return { adminUser, adminPass, supportUser, supportPass };
}

function authenticateUser(env, username, password) {
  const { adminUser, adminPass, supportUser, supportPass } = resolveUsers(env);
  if (adminPass && username === adminUser && password === adminPass) {
    return { username: adminUser, role: 'admin' };
  }
  if (supportPass && username === supportUser && password === supportPass) {
    return { username: supportUser, role: 'support' };
  }
  return null;
}

function requireAdmin(session) {
  return session?.role === 'admin';
}

function newId() {
  return crypto.randomUUID();
}

function topicFromCorrection(correctionText, questionText = '') {
  const fromCorrection = String(correctionText || '').trim().split(/[.!?\n]/)[0];
  if (fromCorrection && fromCorrection.length >= 8) return fromCorrection.slice(0, 120);
  const fromQuestion = String(questionText || '').trim().slice(0, 120);
  return fromQuestion || 'User correction';
}

async function readList(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(kv, key, list) {
  await kv.put(key, JSON.stringify(list));
}

function sortNewest(a, b) {
  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders(request) });
    }
    if (request.method !== 'POST') {
      return json(request, { error: 'Method not allowed' }, 405);
    }

    try {
      if (!env.KB) {
        return json(request, { error: 'KV binding KB is missing' }, 500);
      }
      if (!env.SESSION_SIGNING_KEY) {
        return json(request, { error: 'SESSION_SIGNING_KEY secret is missing' }, 500);
      }

      const body = await request.json();
      const action = String(body?.action || '');

      if (action === 'login') {
        const username = String(body?.username || '').trim();
        const password = String(body?.password || '');
        const user = authenticateUser(env, username, password);
        if (!user) {
          return json(request, { error: 'Invalid username or password.' }, 401);
        }
        const session = await signSession(user.username, user.role, env.SESSION_SIGNING_KEY);
        return json(request, session);
      }

      const session = await verifySession(
        request.headers.get('Authorization'),
        env.SESSION_SIGNING_KEY
      );
      if (!session) {
        return json(request, { error: 'Unauthorized' }, 401);
      }

      if (action === 'me') {
        return json(request, { username: session.sub, role: session.role });
      }

      if (action === 'listKnowledge') {
        const entries = (await readList(env.KB, KNOWLEDGE_KEY)).sort(sortNewest);
        return json(request, { entries, role: session.role, username: session.sub });
      }

      if (action === 'submitFeedback') {
        const rating = body?.rating === 'up' ? 'up' : body?.rating === 'down' ? 'down' : null;
        if (!rating) return json(request, { error: 'rating must be up or down' }, 400);

        const feedback = {
          id: newId(),
          createdAt: new Date().toISOString(),
          rating,
          questionText: String(body?.questionText || ''),
          answerText: String(body?.answerText || ''),
          correctionText: body?.correctionText ? String(body.correctionText) : null,
          provider: body?.provider ? String(body.provider) : null,
          clientId: String(body?.clientId || 'anonymous'),
          submittedBy: session.sub,
          submittedByRole: session.role,
        };

        const feedbackList = await readList(env.KB, FEEDBACK_KEY);
        feedbackList.unshift(feedback);
        await writeList(env.KB, FEEDBACK_KEY, feedbackList.slice(0, 2000));

        let pendingKnowledge = null;
        if (rating === 'down' && feedback.correctionText) {
          const now = new Date().toISOString();
          const autoApprove = session.role === 'admin';
          pendingKnowledge = {
            id: newId(),
            topic: topicFromCorrection(feedback.correctionText, feedback.questionText),
            content: feedback.correctionText,
            status: autoApprove ? 'approved' : 'pending',
            source: 'correction',
            feedbackId: feedback.id,
            submittedBy: session.sub,
            createdAt: now,
            updatedAt: now,
            ...(autoApprove ? { reviewedBy: session.sub } : {}),
          };
          const entries = await readList(env.KB, KNOWLEDGE_KEY);
          entries.unshift(pendingKnowledge);
          await writeList(env.KB, KNOWLEDGE_KEY, entries);
        }

        return json(request, { feedback, pendingKnowledge });
      }

      if (action === 'saveKnowledge') {
        const now = new Date().toISOString();
        let status = body?.status === 'pending' ? 'pending' : 'approved';
        // Support may only create pending suggestions; admin can approve on save.
        if (session.role !== 'admin') {
          status = 'pending';
        }
        const entry = {
          id: newId(),
          topic: String(body?.topic || ''),
          content: String(body?.content || ''),
          status,
          source: String(body?.source || 'teach'),
          feedbackId: body?.feedbackId || null,
          submittedBy: session.sub,
          createdAt: now,
          updatedAt: now,
        };
        const entries = await readList(env.KB, KNOWLEDGE_KEY);
        entries.unshift(entry);
        await writeList(env.KB, KNOWLEDGE_KEY, entries);
        return json(request, { entry });
      }

      if (['approve', 'reject', 'update', 'delete'].includes(action)) {
        if (!requireAdmin(session)) {
          return json(
            request,
            { error: 'Only integrationsteam (admin) can approve or manage knowledge entries.' },
            403
          );
        }
        const id = body?.id;
        if (!id) return json(request, { error: 'id required' }, 400);
        let entries = await readList(env.KB, KNOWLEDGE_KEY);
        const idx = entries.findIndex((e) => e.id === id);
        if (idx < 0) return json(request, { error: 'knowledge entry not found' }, 404);

        if (action === 'delete') {
          const [removed] = entries.splice(idx, 1);
          await writeList(env.KB, KNOWLEDGE_KEY, entries);
          return json(request, { entry: removed });
        }

        const current = entries[idx];
        const updated = {
          ...current,
          updatedAt: new Date().toISOString(),
          reviewedBy: session.sub,
        };
        if (action === 'approve') {
          updated.status = 'approved';
          if (body?.topic) updated.topic = String(body.topic);
          if (body?.content) updated.content = String(body.content);
        } else if (action === 'reject') {
          updated.status = 'rejected';
        } else if (action === 'update') {
          if (body?.topic != null) updated.topic = String(body.topic);
          if (body?.content != null) updated.content = String(body.content);
          if (body?.status) updated.status = String(body.status);
        }
        entries[idx] = updated;
        await writeList(env.KB, KNOWLEDGE_KEY, entries);
        return json(request, { entry: updated });
      }

      return json(request, { error: `Unknown action: ${action}` }, 400);
    } catch (error) {
      return json(
        request,
        { error: error instanceof Error ? error.message : String(error) },
        500
      );
    }
  },
};
