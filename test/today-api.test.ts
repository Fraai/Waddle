import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';
import { todayISO } from '../src/lib/dates';
import { GET } from '../src/pages/api/today';

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
