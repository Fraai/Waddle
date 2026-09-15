import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getGoogleAuthUrl } from '../../../utils/auth';

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const state = crypto.randomUUID();
  const url = getGoogleAuthUrl(env.AUTH_GOOGLE_ID, redirectUri, state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': `oauth-state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
    },
  });
};
