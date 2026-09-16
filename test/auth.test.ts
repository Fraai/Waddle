import { describe, expect, it } from 'vitest';
import {
  signJWT,
  verifyJWT,
  parseCookies,
  makeAuthCookie,
  clearAuthCookie,
  isAllowedEmail,
} from '../src/utils/auth';

const SECRET = 'a'.repeat(32);

describe('JWT sign/verify', () => {
  it('round-trips a payload', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency', name: 'Sam' }, SECRET);
    const payload = await verifyJWT(token, SECRET);
    expect(payload?.sub).toBe('1');
    expect(payload?.email).toBe('sam@fraai.agency');
    expect(payload?.name).toBe('Sam');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency' }, SECRET);
    const payload = await verifyJWT(token, 'b'.repeat(32));
    expect(payload).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyJWT('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency' }, SECRET);
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
  it('allows @fraai.agency addresses', () => {
    expect(isAllowedEmail('sam@fraai.agency')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedEmail('Sam@Fraai.Agency')).toBe(true);
  });

  it('rejects other domains', () => {
    expect(isAllowedEmail('sam@gmail.com')).toBe(false);
  });
});

import { getGoogleAuthUrl, exchangeGoogleCode } from '../src/utils/auth';
import { vi, afterEach } from 'vitest';

describe('getGoogleAuthUrl', () => {
  it('builds a Google OAuth consent URL with the given params', () => {
    const url = new URL(getGoogleAuthUrl('client-id', 'https://todo.fraai.agency/api/auth/callback', 'state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://todo.fraai.agency/api/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('hd')).toBe('fraai.agency');
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
          JSON.stringify({ email: 'sam@fraai.agency', name: 'Sam', verified_email: true }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toEqual({ email: 'sam@fraai.agency', name: 'Sam' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the userinfo email is not verified', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ email: 'sam@fraai.agency', name: 'Sam', verified_email: false }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toBeNull();
  });

  it('returns null when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad request', { status: 400 })));
    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toBeNull();
  });

  it('returns null when the userinfo request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toBeNull();
  });
});
