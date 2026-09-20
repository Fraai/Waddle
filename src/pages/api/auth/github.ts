import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getGitHubAuthUrl } from '../../../utils/auth';

export const GET: APIRoute = async ({ request }) => {
  if (!env.AUTH_GITHUB_ID) {
    return new Response('GitHub sign-in is not configured', { status: 404 });
  }
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback/github`;
  const state = crypto.randomUUID();
  const url = getGitHubAuthUrl(env.AUTH_GITHUB_ID, redirectUri, state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': `oauth-state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600; Secure`,
    },
  });
};
