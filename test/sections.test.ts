import { describe, expect, it, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';

let userId: number;
let otherUserId: number;
let projectId: number;

beforeEach(async () => {
  const user = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`user-${crypto.randomUUID()}@example.com`).first<{ id: number }>();
  userId = user!.id;
  const other = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`other-${crypto.randomUUID()}@example.com`).first<{ id: number }>();
  otherUserId = other!.id;
  const project = await db.createProject(env.DB, userId, 'Project');
  projectId = project.id;
});

describe('createSection / listSections', () => {
  it('creates sections appended in order', async () => {
    await db.createSection(env.DB, userId, projectId, 'To do');
    const second = await db.createSection(env.DB, userId, projectId, 'Doing');
    expect(second.position).toBe(2);

    const sections = await db.listSections(env.DB, userId, projectId);
    expect(sections.map((s) => s.name)).toEqual(['To do', 'Doing']);
  });

  it('throws NotFoundError when the project belongs to someone else', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.createSection(env.DB, userId, theirs.id, 'Nope')).rejects.toBeInstanceOf(db.NotFoundError);
    await expect(db.listSections(env.DB, userId, theirs.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('renameSection / deleteSection', () => {
  it('renames a section the user owns', async () => {
    const section = await db.createSection(env.DB, userId, projectId, 'Old');
    await db.renameSection(env.DB, userId, section.id, 'New');
    const [reloaded] = await db.listSections(env.DB, userId, projectId);
    expect(reloaded.name).toBe('New');
  });

  it('throws NotFoundError renaming/deleting a section owned by someone else', async () => {
    const theirProject = await db.createProject(env.DB, otherUserId, 'Theirs');
    const theirSection = await db.createSection(env.DB, otherUserId, theirProject.id, 'Theirs');
    await expect(db.renameSection(env.DB, userId, theirSection.id, 'Hijacked')).rejects.toBeInstanceOf(db.NotFoundError);
    await expect(db.deleteSection(env.DB, userId, theirSection.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('un-sections (does not delete) tasks in a deleted section', async () => {
    const section = await db.createSection(env.DB, userId, projectId, 'Doomed');
    const task = await db.createTask(env.DB, userId, { projectId, sectionId: section.id, title: 'Survives' });

    await db.deleteSection(env.DB, userId, section.id);

    const reloaded = await env.DB.prepare('SELECT section_id FROM tasks WHERE id = ?')
      .bind(task.id).first<{ section_id: number | null }>();
    expect(reloaded?.section_id).toBeNull();
  });
});

describe('reorderSections', () => {
  it('rewrites positions 1..n in the given order', async () => {
    const a = await db.createSection(env.DB, userId, projectId, 'A');
    const b = await db.createSection(env.DB, userId, projectId, 'B');

    await db.reorderSections(env.DB, userId, projectId, [b.id, a.id]);

    const sections = await db.listSections(env.DB, userId, projectId);
    expect(sections.map((s) => s.name)).toEqual(['B', 'A']);
  });

  it('throws NotFoundError and leaves positions unchanged when an id belongs to another project/user', async () => {
    const a = await db.createSection(env.DB, userId, projectId, 'A');
    const b = await db.createSection(env.DB, userId, projectId, 'B');

    const theirProject = await db.createProject(env.DB, otherUserId, 'Theirs');
    const theirSection = await db.createSection(env.DB, otherUserId, theirProject.id, 'Foreign');

    await expect(
      db.reorderSections(env.DB, userId, projectId, [b.id, theirSection.id]),
    ).rejects.toBeInstanceOf(db.NotFoundError);

    const sections = await db.listSections(env.DB, userId, projectId);
    expect(sections.map((s) => s.name)).toEqual(['A', 'B']);
  });
});
