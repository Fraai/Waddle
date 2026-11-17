import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';
import { todayISO } from '../src/lib/dates';
import { GET, POST } from '../src/pages/api/today';

function call(email: string, token = 'test-dash-token') {
  const url = new URL(`https://todo.test/api/today?email=${encodeURIComponent(email)}`);
  const request = new Request(url, { headers: { authorization: `Bearer ${token}` } });
  return (GET as any)({ request, url }) as Promise<Response>;
}

async function newUser() {
  const email = `u-${crypto.randomUUID()}@example.com`;
  const user = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING id').bind(email).first<{ id: number }>();
  const project = await db.createProject(env.DB, user!.id, 'P');
  return { email, id: user!.id, projectId: project.id };
}

describe('GET /api/today (dash feed)', () => {
  it('rejects a wrong token', async () => {
    expect((await call('a@example.com', 'nope')).status).toBe(401);
  });

  it('rejects an email outside the allowed domain', async () => {
    expect((await call('a@evil.com')).status).toBe(400);
  });

  it('returns empty lists for an unknown user', async () => {
    const body = await (await call('nobody@example.com')).json() as any;
    expect(body.overdue).toEqual([]);
    expect(body.dueToday).toEqual([]);
  });

  it("returns only that user's overdue and due-today tasks", async () => {
    const me = await newUser();
    const other = await newUser();
    const today = todayISO();
    await db.createTask(env.DB, me.id, { projectId: me.projectId, title: 'Mine today', dueDate: today } as any);
    await db.createTask(env.DB, me.id, { projectId: me.projectId, title: 'Mine overdue', dueDate: '2000-01-01' } as any);
    await db.createTask(env.DB, other.id, { projectId: other.projectId, title: 'Not mine', dueDate: today } as any);

    const body = await (await call(me.email.toUpperCase())).json() as any;
    expect(body.dueToday.map((t: any) => t.title)).toEqual(['Mine today']);
    expect(body.overdue.map((t: any) => t.title)).toEqual(['Mine overdue']);
  });
});

function post(body: unknown, token = 'test-dash-token') {
  const request = new Request('https://todo.test/api/today', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return (POST as any)({ request }) as Promise<Response>;
}
const doneAt = (id: number) => env.DB.prepare('SELECT done_at FROM tasks WHERE id = ?').bind(id).first<{ done_at: string | null }>();

describe('POST /api/today (complete from the dash)', () => {
  it('rejects a wrong token and a bad body', async () => {
    expect((await post({ email: 'a@example.com', taskId: 1, done: true }, 'nope')).status).toBe(401);
    expect((await post({ email: 'a@example.com', taskId: 'x', done: true })).status).toBe(400);
    expect((await post({ email: 'a@example.com', taskId: 1 })).status).toBe(400);
  });

  it("completes and reopens the user's own task, idempotently", async () => {
    const me = await newUser();
    const t = await db.createTask(env.DB, me.id, { projectId: me.projectId, title: 'Do it', dueDate: todayISO() } as any);

    expect(await (await post({ email: me.email, taskId: t.id, done: true })).json()).toMatchObject({ changed: true });
    expect((await doneAt(t.id))!.done_at).not.toBeNull();
    expect(await (await post({ email: me.email, taskId: t.id, done: true })).json()).toMatchObject({ changed: false });
    expect((await doneAt(t.id))!.done_at).not.toBeNull();

    await post({ email: me.email, taskId: t.id, done: false });
    expect((await doneAt(t.id))!.done_at).toBeNull();
  });

  it("can't touch another user's task", async () => {
    const me = await newUser();
    const other = await newUser();
    const t = await db.createTask(env.DB, other.id, { projectId: other.projectId, title: 'Theirs', dueDate: todayISO() } as any);
    expect((await post({ email: me.email, taskId: t.id, done: true })).status).toBe(404);
    expect((await doneAt(t.id))!.done_at).toBeNull();
  });
});
