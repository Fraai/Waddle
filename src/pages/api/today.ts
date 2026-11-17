import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import * as db from '../../lib/db';
import { getUserByEmail } from '../../lib/users';
import { todayISO, splitOverdueAndToday, DEFAULT_TIMEZONE } from '../../lib/dates';
import { isAllowedEmail, timingSafeEqual } from '../../utils/auth';

// Feed of one user's overdue + due-today tasks for dash.fraai.agency (GET),
// plus completing/reopening one of them (POST).
// Server-to-server: the caller holds DASH_TOKEN and names the (already
// authenticated) user by email, so anyone with the token can read any allowed
// user's task titles. Leave DASH_TOKEN unset to disable the endpoint.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// null = authorized; otherwise the response to send back.
function denied(request: Request): Response | null {
  if (!env.DASH_TOKEN) return new Response('Not found', { status: 404 });
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !timingSafeEqual(token, env.DASH_TOKEN)) return json({ error: 'unauthorized' }, 401);
  return null;
}

const cleanEmail = (raw: unknown) => {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email && isAllowedEmail(email, env.ALLOWED_EMAIL_DOMAIN) ? email : null;
};

export const GET: APIRoute = async ({ request, url }) => {
  const no = denied(request);
  if (no) return no;
  const email = cleanEmail(url.searchParams.get('email'));
  if (!email) return json({ error: 'bad email' }, 400);

  const today = todayISO(undefined, env.TIMEZONE ?? DEFAULT_TIMEZONE);
  const user = await getUserByEmail(env.DB, email);
  // Never signed in to Waddle: not an error, just nothing to show.
  if (!user) return json({ today, overdue: [], dueToday: [] });

  const { overdue, today: dueToday } = splitOverdueAndToday(await db.listOpenDatedTasks(env.DB, user.id), today);
  const view = (t: db.Task) => ({ id: t.id, title: t.title, dueDate: t.due_date, dueTime: t.due_time, priority: t.priority });
  return json({ today, overdue: overdue.map(view), dueToday: dueToday.map(view) });
};

// Complete (done: true) or reopen (done: false) one of the user's tasks from
// the dash. Idempotent: setting the state it already has is a no-op, so a
// double click can't flip it back. Body: { email, taskId, done }.
export const POST: APIRoute = async ({ request }) => {
  const no = denied(request);
  if (no) return no;
  const body = await request.json().catch(() => null) as { email?: unknown; taskId?: unknown; done?: unknown } | null;
  const email = cleanEmail(body?.email);
  const taskId = Number(body?.taskId);
  if (!email || !Number.isInteger(taskId) || taskId <= 0 || typeof body?.done !== 'boolean') return json({ error: 'bad request' }, 400);

  const user = await getUserByEmail(env.DB, email);
  const task = user && await env.DB.prepare('SELECT done_at FROM tasks WHERE id = ? AND user_id = ?')
    .bind(taskId, user.id).first<{ done_at: string | null }>();
  if (!user || !task) return json({ error: 'not found' }, 404);
  if ((task.done_at !== null) === body.done) return json({ ok: true, changed: false });
  const { nextOccurrenceCreated } = await db.toggleTaskDone(env.DB, user.id, taskId);
  return json({ ok: true, changed: true, nextOccurrenceCreated });
};
