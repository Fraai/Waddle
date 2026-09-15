import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';

describe('schema', () => {
  it('creates the users, projects, sections, and tasks tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'projects', 'sections', 'tasks')"
    ).all<{ name: string }>();
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['projects', 'sections', 'tasks', 'users']);
  });

  it('lets you insert a user, an inbox project, and a task referencing both', async () => {
    const user = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
      .bind('test@fraai.agency')
      .first<{ id: number }>();
    const project = await env.DB.prepare(
      'INSERT INTO projects (user_id, name, is_inbox) VALUES (?, ?, 1) RETURNING *'
    )
      .bind(user!.id, 'Inbox')
      .first<{ id: number }>();
    const task = await env.DB.prepare(
      'INSERT INTO tasks (user_id, project_id, title) VALUES (?, ?, ?) RETURNING *'
    )
      .bind(user!.id, project!.id, 'First task')
      .first<{ id: number; priority: number }>();
    expect(task!.priority).toBe(4);
  });
});
