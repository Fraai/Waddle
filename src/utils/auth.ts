/**
 * WebCrypto-only auth utilities — zero Node.js built-ins, so this runs on
 * the Cloudflare Workers edge runtime.
 */

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(str: string): Uint8Array {
  return new Uint8Array(atob(str).split('').map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '==='.slice((str.length + 3) % 4);
  return base64ToBytes(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

function textToBase64Url(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

export interface JWTPayload {
  sub: string;
  email: string;
  name?: string | null;
  iat: number;
  exp: number;
}

const JWT_HEADER = textToBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = { ...payload, iat: now, exp: now + JWT_TTL_SECONDS };
  const body = textToBase64Url(JSON.stringify(fullPayload));
  const data = `${JWT_HEADER}.${body}`;
  const key = await hmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const data = `${header}.${body}`;
    const key = await hmacKey(secret, 'verify');
    const valid = await crypto.subtle.verify(
      'HMAC', key, base64UrlDecode(sig), new TextEncoder().encode(data),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const [k, ...v] = part.trim().split('=');
      return k ? [[k.trim(), decodeURIComponent(v.join('='))]] : [];
    }),
  );
}

export function makeAuthCookie(token: string): string {
  return `auth-token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${JWT_TTL_SECONDS}; Secure`;
}

export function clearAuthCookie(): string {
  return `auth-token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure`;
}

const ALLOWED_DOMAINS = ['@fraai.agency'];

export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return ALLOWED_DOMAINS.some((d) => e.endsWith(d));
}

export function getGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: 'fraai.agency',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ email: string; name: string } | null> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return null;
  const { email, name, verified_email } = (await userRes.json()) as {
    email: string;
    name: string;
    verified_email?: boolean;
  };
  if (verified_email !== true) return null;
  return { email, name };
}
