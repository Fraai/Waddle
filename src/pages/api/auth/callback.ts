import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  exchangeGoogleCode, isAllowedEmail, signJWT, makeAuthCookie, parseCookies,
} from '../../../utils/auth';
import { provisionUser } from '../../../lib/users';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('cookie'));

  if (!code || !state || state !== cookies['oauth-state']) {
    return Response.redirect(`${url.origin}/auth/error?reason=state`, 302);
  }

  const redirectUri = `${url.origin}/api/auth/callback`;
  const profile = await exchangeGoogleCode(code, env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET, redirectUri);
  if (!profile) {
    return Response.redirect(`${url.origin}/auth/error?reason=exchange`, 302);
  }
  if (!isAllowedEmail(profile.email, env.ALLOWED_EMAIL_DOMAIN)) {
    return Response.redirect(`${url.origin}/auth/error?reason=domain`, 302);
  }

  const user = await provisionUser(env.DB, profile.email, profile.name ?? null);
  const token = await signJWT({ sub: String(user.id), email: user.email, name: user.name }, env.JWT_SECRET);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}/app/today`,
      'Set-Cookie': makeAuthCookie(token),
    },
  });
};
