import { defineMiddleware } from 'astro:middleware';
import { getActionContext } from 'astro:actions';
import { env } from 'cloudflare:workers';
import { parseCookies, verifyJWT } from './utils/auth';

function noindex(response: Response): Response {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals } = context;
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
    return noindex(new Response(null, { status: 302, headers: { Location: '/login' } }));
  }

  // Form-submitted actions are handled here rather than in a page, because a
  // form can live in the shared layout: `Astro.redirect()` returned from a
  // layout doesn't redirect, it just renders nothing. On success we send a
  // 303 back to the same path so the URL keeps no ?_action= and a refresh
  // can't resubmit. Errors fall through and render the page with the result.
  const { action, setActionResult, serializeActionResult } = getActionContext(context);
  if (action?.calledFrom === 'form') {
    const result = await action.handler();
    if (!result.error) {
      return noindex(new Response(null, { status: 303, headers: { Location: url.pathname } }));
    }
    setActionResult(action.name, serializeActionResult(result));
  }

  return noindex(await next());
});
