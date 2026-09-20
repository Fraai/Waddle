import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { exchangeGitHubCode, checkOAuthState, completeOAuthLogin } from '../../../../utils/auth';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const checked = checkOAuthState(request);
  if (!checked) {
    return Response.redirect(`${url.origin}/auth/error?reason=state`, 302);
  }

  const redirectUri = `${url.origin}/api/auth/callback/github`;
  const profile = await exchangeGitHubCode(checked.code, env.AUTH_GITHUB_ID, env.AUTH_GITHUB_SECRET, redirectUri);
  if (!profile) {
    return Response.redirect(`${url.origin}/auth/error?reason=exchange`, 302);
  }

  return completeOAuthLogin(env.DB, env.JWT_SECRET, env.ALLOWED_EMAIL_DOMAIN, url.origin, profile);
};
