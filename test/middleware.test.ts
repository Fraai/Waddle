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
    const response = await onRequest(context as any, next);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('sets X-Robots-Tag: noindex on redirect for unauthenticated /app', async () => {
    const context = makeContext('https://todo.fraai.agency/app/today');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const response = await onRequest(context as any, next);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
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

describe('form action handling', () => {
  async function authedContext(url: string, action?: unknown) {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency' }, env.JWT_SECRET);
    const context = makeContext(url, makeAuthCookie(token)) as any;
    context.__action = action;
    return context;
  }

  it('redirects a successful form action back to the same path, dropping ?_action', async () => {
    const context = await authedContext('https://todo.fraai.agency/app/today?_action=createProject', {
      calledFrom: 'form',
      name: 'createProject',
      handler: async () => ({ data: { id: 7 }, error: undefined }),
    });
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    const response = await onRequest(context, next);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/app/today');
    expect(next).not.toHaveBeenCalled();
  });

  it('renders the page with the result when a form action fails, instead of redirecting', async () => {
    const error = new Error('Name is required');
    const context = await authedContext('https://todo.fraai.agency/app/today?_action=createProject', {
      calledFrom: 'form',
      name: 'createProject',
      handler: async () => ({ data: undefined, error }),
    });
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    const response = await onRequest(context, next);

    expect(next).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(context.__actionResult).toEqual({ name: 'createProject', result: { data: undefined, error } });
  });

  it('leaves RPC actions alone so client scripts get the result back', async () => {
    const handler = vi.fn();
    const context = await authedContext('https://todo.fraai.agency/app/today', {
      calledFrom: 'rpc',
      name: 'toggleTaskDone',
      handler,
    });
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(handler).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
