/**
 * Pure session helpers mirrored for unit tests (Edge Function uses Deno Web Crypto).
 * Keeps sign/verify behavior covered without Deno runtime in Vitest.
 */
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

export async function signSession(username, signingKey, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ sub: username, exp });
  const payloadBytes = new TextEncoder().encode(payload);
  const key = await hmacKey(signingKey);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes));
  return {
    token: `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export async function verifySession(token, signingKey) {
  if (!token || !signingKey) return null;
  const parts = String(token).replace(/^Bearer\s+/i, '').trim().split('.');
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
    return payload;
  } catch {
    return null;
  }
}
