const ALLOWED_ORIGINS = [
  "https://cihanhartamaci.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(
  username: string,
  signingKey: string,
  ttlSeconds = 12 * 60 * 60,
): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ sub: username, exp });
  const payloadBytes = new TextEncoder().encode(payload);
  const key = await hmacKey(signingKey);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
  const token = `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

export async function verifySession(
  token: string | null | undefined,
  signingKey: string,
): Promise<{ sub: string; exp: number } | null> {
  if (!token || !signingKey) return null;
  const parts = token.replace(/^Bearer\s+/i, "").trim().split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, sigPart] = parts;
  try {
    const payloadBytes = b64urlDecode(payloadPart);
    const sigBytes = b64urlDecode(sigPart);
    const key = await hmacKey(signingKey);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload?.sub || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  req: Request,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}
