/**
 * WebCrypto-only auth utilities — zero Node.js built-ins, so this runs on
 * the Cloudflare Workers edge runtime.
 */
import { provisionUser } from '../lib/users';

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

// The org's Google Workspace domain (e.g. "example.com", no "@") — set via
// the ALLOWED_EMAIL_DOMAIN secret, not hardcoded, so this is deployable for
// any organization without forking the code.
export function isAllowedEmail(email: string, allowedDomain: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith(`@${allowedDomain.trim().toLowerCase()}`);
}

export function getGoogleAuthUrl(
  clientId: string, redirectUri: string, state: string, allowedDomain: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Just a UI hint (pre-fills/restricts the account chooser) — the real
    // enforcement is isAllowedEmail on the callback, since this can be
    // bypassed client-side.
    hd: allowedDomain,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface OAuthProfile {
  email: string;
  name: string | null;
}

export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<OAuthProfile | null> {
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

export function getGitHubAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    // user:email, not just read:user — GitHub's /user endpoint omits email
    // entirely when a user has it set private, which is common.
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGitHubCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<OAuthProfile | null> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  // GitHub's API 403s without a User-Agent header.
  const headers = {
    Authorization: `Bearer ${access_token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'waddle-app',
  };
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!userRes.ok || !emailsRes.ok) return null;
  const user = (await userRes.json()) as { name: string | null };
  const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
  // The domain allowlist check downstream is the real gate — this just picks
  // which of the account's emails to check it against.
  const primary = emails.find((e) => e.primary && e.verified);
  if (!primary) return null;
  return { email: primary.email, name: user.name };
}

export function getMicrosoftAuthUrl(
  clientId: string, redirectUri: string, state: string, tenant: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid email profile User.Read',
    state,
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  tenant: string,
): Promise<OAuthProfile | null> {
  const tokenRes = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid email profile User.Read',
    }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return null;
  const { mail, userPrincipalName, displayName } = (await userRes.json()) as {
    mail: string | null;
    userPrincipalName: string | null;
    displayName: string | null;
  };
  // mail is null for some account types (e.g. certain guest/B2B setups) —
  // userPrincipalName is always present and is the sign-in identifier there.
  const email = mail ?? userPrincipalName;
  if (!email) return null;
  return { email, name: displayName };
}

// Validates the CSRF state cookie set by the provider's initiate route
// matches what came back on the callback — identical for every provider.
export function checkOAuthState(request: Request): { code: string } | null {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('cookie'));
  if (!code || !state || state !== cookies['oauth-state']) return null;
  return { code };
}

// The shared tail of every provider's callback: gate by domain, provision
// the user, and hand back a signed-in redirect — identical regardless of
// which provider proved the email address.
export async function completeOAuthLogin(
  db: D1Database, jwtSecret: string, allowedDomain: string, origin: string, profile: OAuthProfile,
): Promise<Response> {
  if (!isAllowedEmail(profile.email, allowedDomain)) {
    return Response.redirect(`${origin}/auth/error?reason=domain`, 302);
  }
  const user = await provisionUser(db, profile.email, profile.name);
  const token = await signJWT({ sub: String(user.id), email: user.email, name: user.name }, jwtSecret);
  return new Response(null, {
    status: 302,
    headers: { Location: `${origin}/app/today`, 'Set-Cookie': makeAuthCookie(token) },
  });
}
