import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import * as db from '../../lib/db';
import { getUserByEmail } from '../../lib/users';
import { todayISO, splitOverdueAndToday, DEFAULT_TIMEZONE } from '../../lib/dates';
import { isAllowedEmail, timingSafeEqual } from '../../utils/auth';

// Read-only feed of one user's overdue + due-today tasks for dash.fraai.agency.
// Server-to-server: the caller holds DASH_TOKEN and names the (already
// authenticated) user by email, so anyone with the token can read any allowed
// user's task titles. Leave DASH_TOKEN unset to disable the endpoint.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const GET: APIRoute = async ({ request, url }) => {
  if (!env.DASH_TOKEN) return new Response('Not found', { status: 404 });
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !timingSafeEqual(token, env.DASH_TOKEN)) return json({ error: 'unauthorized' }, 401);

  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email || !isAllowedEmail(email, env.ALLOWED_EMAIL_DOMAIN)) return json({ error: 'bad email' }, 400);

  const today = todayISO(undefined, env.TIMEZONE ?? DEFAULT_TIMEZONE);
  const user = await getUserByEmail(env.DB, email);
  // Never signed in to Waddle: not an error, just nothing to show.
  if (!user) return json({ today, overdue: [], dueToday: [] });

  const { overdue, today: dueToday } = splitOverdueAndToday(await db.listOpenDatedTasks(env.DB, user.id), today);
  const view = (t: db.Task) => ({ id: t.id, title: t.title, dueDate: t.due_date, dueTime: t.due_time, priority: t.priority });
  return json({ today, overdue: overdue.map(view), dueToday: dueToday.map(view) });
};
