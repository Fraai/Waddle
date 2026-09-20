import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  signJWT,
  verifyJWT,
  parseCookies,
  makeAuthCookie,
  clearAuthCookie,
  isAllowedEmail,
  checkOAuthState,
  completeOAuthLogin,
} from '../src/utils/auth';

const SECRET = 'a'.repeat(32);

describe('JWT sign/verify', () => {
  it('round-trips a payload', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@example.com', name: 'Sam' }, SECRET);
    const payload = await verifyJWT(token, SECRET);
    expect(payload?.sub).toBe('1');
    expect(payload?.email).toBe('sam@example.com');
    expect(payload?.name).toBe('Sam');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@example.com' }, SECRET);
    const payload = await verifyJWT(token, 'b'.repeat(32));
    expect(payload).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyJWT('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@example.com' }, SECRET);
    const [header, body, sig] = token.split('.');
    const decoded = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    decoded.exp = Math.floor(Date.now() / 1000) - 10;
    const reencoded = btoa(JSON.stringify(decoded)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(await verifyJWT(`${header}.${reencoded}.${sig}`, SECRET)).toBeNull();
  });
});

describe('cookie helpers', () => {
  it('parses a cookie header into a record', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('returns an empty object for a null header', () => {
    expect(parseCookies(null)).toEqual({});
  });

  it('makeAuthCookie sets HttpOnly, SameSite=Lax, Secure, and a 7-day Max-Age', () => {
    const cookie = makeAuthCookie('token123');
    expect(cookie).toContain('auth-token=token123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 7}`);
  });

  it('clearAuthCookie expires the cookie immediately', () => {
    expect(clearAuthCookie()).toContain('Max-Age=0');
  });
});

describe('isAllowedEmail', () => {
  it('allows addresses on the configured domain', () => {
    expect(isAllowedEmail('sam@example.com', 'example.com')).toBe(true);
  });

  it('is case-insensitive on both the email and the configured domain', () => {
    expect(isAllowedEmail('Sam@Example.Com', 'EXAMPLE.COM')).toBe(true);
  });

  it('rejects other domains', () => {
    expect(isAllowedEmail('sam@gmail.com', 'example.com')).toBe(false);
  });
});

import { getGoogleAuthUrl, exchangeGoogleCode } from '../src/utils/auth';
import { vi, afterEach } from 'vitest';

describe('getGoogleAuthUrl', () => {
  it('builds a Google OAuth consent URL with the given params', () => {
    const url = new URL(getGoogleAuthUrl(
      'client-id', 'https://todo.example.com/api/auth/callback', 'state-123', 'example.com',
    ));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://todo.example.com/api/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('hd')).toBe('example.com');
  });
});

describe('exchangeGoogleCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges a code for the user profile on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'sam@example.com', name: 'Sam', verified_email: true }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback');
    expect(profile).toEqual({ email: 'sam@example.com', name: 'Sam' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the userinfo email is not verified', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'sam@example.com', name: 'Sam', verified_email: false }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback');
    expect(profile).toBeNull();
  });

  it('returns null when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad request', { status: 400 })));
    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback');
    expect(profile).toBeNull();
  });

  it('returns null when the userinfo request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback');
    expect(profile).toBeNull();
  });
});

import { getGitHubAuthUrl, exchangeGitHubCode, getMicrosoftAuthUrl, exchangeMicrosoftCode } from '../src/utils/auth';

describe('getGitHubAuthUrl', () => {
  it('builds a GitHub OAuth consent URL requesting the user:email scope', () => {
    const url = new URL(getGitHubAuthUrl(
      'client-id', 'https://todo.example.com/api/auth/callback/github', 'state-123',
    ));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://todo.example.com/api/auth/callback/github');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
  });
});

describe('exchangeGitHubCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('picks the primary, verified email from /user/emails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Sam' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { email: 'sam-secondary@example.com', primary: false, verified: true },
        { email: 'sam-unverified@example.com', primary: true, verified: false },
        { email: 'sam@example.com', primary: true, verified: true },
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGitHubCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback/github');
    expect(profile).toEqual({ email: 'sam@example.com', name: 'Sam' });
  });

  it('returns null when no email is both primary and verified', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'Sam' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { email: 'sam@example.com', primary: true, verified: false },
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGitHubCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback/github');
    expect(profile).toBeNull();
  });

  it('returns null when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad request', { status: 400 })));
    const profile = await exchangeGitHubCode('code', 'id', 'secret', 'https://todo.example.com/api/auth/callback/github');
    expect(profile).toBeNull();
  });
});

describe('getMicrosoftAuthUrl', () => {
  it('builds a Microsoft OAuth consent URL scoped to the given tenant', () => {
    const url = new URL(getMicrosoftAuthUrl(
      'client-id', 'https://todo.example.com/api/auth/callback/microsoft', 'state-123', 'common',
    ));
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://todo.example.com/api/auth/callback/microsoft');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe('openid email profile User.Read');
  });

  it('URL-encodes the tenant into the path so it cannot inject an extra path segment', () => {
    const url = getMicrosoftAuthUrl(
      'client-id', 'https://todo.example.com/api/auth/callback/microsoft', 'state-123', 'weird/tenant?x=1',
    );
    expect(url).toContain('/weird%2Ftenant%3Fx%3D1/oauth2/v2.0/authorize');
  });
});

describe('exchangeMicrosoftCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges a code for the user profile using mail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        mail: 'sam@example.com', userPrincipalName: 'sam_example.com#EXT#@samtenant.onmicrosoft.com', displayName: 'Sam',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeMicrosoftCode(
      'code', 'id', 'secret', 'https://todo.example.com/api/auth/callback/microsoft', 'common',
    );
    expect(profile).toEqual({ email: 'sam@example.com', name: 'Sam' });
  });

  it('falls back to userPrincipalName when mail is null', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        mail: null, userPrincipalName: 'sam@example.com', displayName: 'Sam',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeMicrosoftCode(
      'code', 'id', 'secret', 'https://todo.example.com/api/auth/callback/microsoft', 'common',
    );
    expect(profile?.email).toBe('sam@example.com');
  });

  it('returns null when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad request', { status: 400 })));
    const profile = await exchangeMicrosoftCode(
      'code', 'id', 'secret', 'https://todo.example.com/api/auth/callback/microsoft', 'common',
    );
    expect(profile).toBeNull();
  });
});

describe('checkOAuthState', () => {
  const makeRequest = (query: string, cookie: string | null) => new Request(`https://todo.example.com/api/auth/callback${query}`, {
    headers: cookie ? { cookie } : {},
  });

  it('returns the code when state matches the cookie', () => {
    const req = makeRequest('?code=abc&state=xyz', 'oauth-state=xyz');
    expect(checkOAuthState(req)).toEqual({ code: 'abc' });
  });

  it('returns null when the state does not match the cookie', () => {
    const req = makeRequest('?code=abc&state=xyz', 'oauth-state=different');
    expect(checkOAuthState(req)).toBeNull();
  });

  it('returns null when code or state is missing', () => {
    expect(checkOAuthState(makeRequest('?state=xyz', 'oauth-state=xyz'))).toBeNull();
    expect(checkOAuthState(makeRequest('?code=abc', null))).toBeNull();
  });
});

describe('completeOAuthLogin', () => {
  it('rejects a profile outside the allowed domain without provisioning a user', async () => {
    const res = await completeOAuthLogin(
      env.DB, 'a'.repeat(32), 'example.com', 'https://todo.example.com', { email: 'sam@gmail.com', name: 'Sam' },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://todo.example.com/auth/error?reason=domain');
  });

  it('provisions the user and returns a signed-in redirect with an auth cookie', async () => {
    const res = await completeOAuthLogin(
      env.DB, 'a'.repeat(32), 'example.com', 'https://todo.example.com',
      { email: 'multiprovider@example.com', name: 'Sam' },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://todo.example.com/app/today');
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('auth-token=');
    expect(cookie).toContain('HttpOnly');

    const token = cookie!.match(/auth-token=([^;]+)/)![1];
    const payload = await verifyJWT(token, 'a'.repeat(32));
    expect(payload?.email).toBe('multiprovider@example.com');
  });
});
