import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../src/middleware';
import { signJWT, makeAuthCookie } from '../src/utils/auth';
import { env } from 'cloudflare:test';

function makeContext(url: string, cookie?: string) {
  const request = new Request(url, cookie ? { headers: { cookie } } : undefined);
  return { request, locals: {} as any, redirect: vi.fn((to: string) => new Response(null, { status: 302, headers: { Location: to } })) };
}

describe('auth middleware', () => {
  it('sets locals.user to null when there is no auth cookie', async () => {
    const context = makeContext('https://todo.fraai.agency/app/today');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(context.locals.user).toBeNull();
  });

  it('redirects unauthenticated requests to /app/* to /login', async () => {
    const context = makeContext('https://todo.fraai.agency/app/today');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(context.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('sets locals.user from a valid JWT cookie and calls next', async () => {
    const token = await signJWT({ sub: '42', email: 'sam@fraai.agency', name: 'Sam' }, env.JWT_SECRET);
    const context = makeContext('https://todo.fraai.agency/app/today', makeAuthCookie(token));
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(context.locals.user).toEqual({ id: 42, email: 'sam@fraai.agency', name: 'Sam' });
    expect(next).toHaveBeenCalled();
  });

  it('does not guard routes outside /app', async () => {
    const context = makeContext('https://todo.fraai.agency/login');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('sets X-Robots-Tag: noindex on every response', async () => {
    const context = makeContext('https://todo.fraai.agency/login');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const response = await onRequest(context as any, next);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
