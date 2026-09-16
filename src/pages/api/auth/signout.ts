import type { APIRoute } from 'astro';
import { clearAuthCookie } from '../../../utils/auth';

export const POST: APIRoute = async ({ url }) => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}/login`,
      'Set-Cookie': clearAuthCookie(),
    },
  });
};
