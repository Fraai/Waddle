import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { parseCookies, verifyJWT } from './utils/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals, redirect } = context;
  const url = new URL(request.url);

  locals.user = null;
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies['auth-token'];
  if (token) {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (payload) {
      locals.user = { id: parseInt(payload.sub, 10), email: payload.email, name: payload.name ?? null };
    }
  }

  if (url.pathname.startsWith('/app') && !locals.user) {
    return redirect('/login');
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
