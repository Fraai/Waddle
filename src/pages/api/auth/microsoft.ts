import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getMicrosoftAuthUrl } from '../../../utils/auth';

export const GET: APIRoute = async ({ request }) => {
  if (!env.AUTH_MICROSOFT_ID) {
    return new Response('Microsoft sign-in is not configured', { status: 404 });
  }
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback/microsoft`;
  const state = crypto.randomUUID();
  // "common" accepts both work/school and personal Microsoft accounts from
  // any tenant — ALLOWED_EMAIL_DOMAIN is the real gate either way, same as
  // Google's hd hint isn't what actually restricts sign-in.
  const tenant = env.AUTH_MICROSOFT_TENANT || 'common';
  const url = getMicrosoftAuthUrl(env.AUTH_MICROSOFT_ID, redirectUri, state, tenant);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': `oauth-state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
    },
  });
};
