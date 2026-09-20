import { describe, expect, it, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';
import { createProjectSchema, setProjectTypeSchema } from '../src/lib/validation';

describe('createProjectSchema', () => {
  it('makes type optional', () => {
    const result = createProjectSchema.safeParse({ name: 'A project' });
    expect(result.success).toBe(true);
    expect(result.data?.type).toBeUndefined();
  });

  it('accepts "private" or "work"', () => {
    expect(createProjectSchema.safeParse({ name: 'A', type: 'private' }).success).toBe(true);
    expect(createProjectSchema.safeParse({ name: 'A', type: 'work' }).success).toBe(true);
  });

  it('rejects anything else', () => {
    expect(createProjectSchema.safeParse({ name: 'A', type: 'personal' }).success).toBe(false);
  });
});

describe('setProjectTypeSchema', () => {
  it('requires both projectId and type', () => {
    expect(setProjectTypeSchema.safeParse({ projectId: '1' }).success).toBe(false);
    expect(setProjectTypeSchema.safeParse({ type: 'private' }).success).toBe(false);
    expect(setProjectTypeSchema.safeParse({ projectId: '1', type: 'private' }).success).toBe(true);
  });
});

let userId: number;
let otherUserId: number;

beforeEach(async () => {
  const user = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`user-${crypto.randomUUID()}@example.com`).first<{ id: number }>();
  userId = user!.id;
  const other = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`other-${crypto.randomUUID()}@example.com`).first<{ id: number }>();
  otherUserId = other!.id;
});

describe('createProject / listProjects', () => {
  it('creates a project owned by the user, appended after existing ones', async () => {
    await db.createProject(env.DB, userId, 'Work');
    const second = await db.createProject(env.DB, userId, 'Personal');
    expect(second.position).toBe(2);

    const projects = await db.listProjects(env.DB, userId);
    expect(projects.map((p) => p.name)).toEqual(['Work', 'Personal']);
  });

  it('does not return another user\'s projects', async () => {
    await db.createProject(env.DB, otherUserId, 'Not mine');
    const projects = await db.listProjects(env.DB, userId);
    expect(projects).toEqual([]);
  });

  it('defaults to type "work" when none is given', async () => {
    const project = await db.createProject(env.DB, userId, 'Untyped');
    expect(project.type).toBe('work');
  });

  it('accepts an explicit type', async () => {
    const project = await db.createProject(env.DB, userId, 'Personal errands', 'private');
    expect(project.type).toBe('private');
  });
});

describe('setProjectType', () => {
  it('changes a project\'s type', async () => {
    const project = await db.createProject(env.DB, userId, 'Side project');
    await db.setProjectType(env.DB, userId, project.id, 'private');
    const [reloaded] = await db.listProjects(env.DB, userId);
    expect(reloaded.type).toBe('private');
  });

  it('like renameProject, exempts the inbox', async () => {
    await env.DB.prepare('INSERT INTO projects (user_id, name, is_inbox) VALUES (?, ?, 1)').bind(userId, 'Inbox').run();
    const inbox = await env.DB.prepare('SELECT id FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(userId).first<{ id: number }>();
    await expect(db.setProjectType(env.DB, userId, inbox!.id, 'private')).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('throws NotFoundError for a project owned by someone else', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.setProjectType(env.DB, userId, theirs.id, 'private')).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('setProjectColor', () => {
  it('changes a project\'s colour', async () => {
    const project = await db.createProject(env.DB, userId, 'Side project');
    await db.setProjectColor(env.DB, userId, project.id, '#ef4444');
    const [reloaded] = await db.listProjects(env.DB, userId);
    expect(reloaded.color).toBe('#ef4444');
  });

  it('throws NotFoundError for a project owned by someone else', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.setProjectColor(env.DB, userId, theirs.id, '#ef4444')).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('renameProject', () => {
  it('renames a project the user owns', async () => {
    const project = await db.createProject(env.DB, userId, 'Old name');
    await db.renameProject(env.DB, userId, project.id, 'New name');
    const [reloaded] = await db.listProjects(env.DB, userId);
    expect(reloaded.name).toBe('New name');
  });

  it('throws NotFoundError for a project owned by someone else', async () => {
    const project = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.renameProject(env.DB, userId, project.id, 'Hijacked')).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('throws NotFoundError when trying to rename the inbox project', async () => {
    await env.DB.prepare('INSERT INTO projects (user_id, name, is_inbox) VALUES (?, ?, 1)').bind(userId, 'Inbox').run();
    const inbox = await env.DB.prepare('SELECT id FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(userId).first<{ id: number }>();
    await expect(db.renameProject(env.DB, userId, inbox!.id, 'Renamed')).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('deleteProject', () => {
  it('deletes a project, its sections, and its tasks', async () => {
    const project = await db.createProject(env.DB, userId, 'To delete');
    const section = await db.createSection(env.DB, userId, project.id, 'A section');
    await db.createTask(env.DB, userId, { projectId: project.id, sectionId: section.id, title: 'A task' });

    await db.deleteProject(env.DB, userId, project.id);

    expect(await db.listProjects(env.DB, userId)).toEqual([]);
    const remainingSections = await env.DB.prepare('SELECT COUNT(*) AS n FROM sections WHERE project_id = ?')
      .bind(project.id).first<{ n: number }>();
    expect(remainingSections?.n).toBe(0);
    const remainingTasks = await env.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?')
      .bind(project.id).first<{ n: number }>();
    expect(remainingTasks?.n).toBe(0);
  });

  it('never deletes another user\'s project, sections, or tasks', async () => {
    const theirProject = await db.createProject(env.DB, otherUserId, 'Theirs');
    const theirSection = await db.createSection(env.DB, otherUserId, theirProject.id, 'Their section');
    await db.createTask(env.DB, otherUserId, { projectId: theirProject.id, sectionId: theirSection.id, title: 'Their task' });

    await expect(db.deleteProject(env.DB, userId, theirProject.id)).rejects.toBeInstanceOf(db.NotFoundError);

    expect(await db.listProjects(env.DB, otherUserId)).toHaveLength(1);
    const sections = await env.DB.prepare('SELECT COUNT(*) AS n FROM sections WHERE project_id = ?')
      .bind(theirProject.id).first<{ n: number }>();
    expect(sections?.n).toBe(1);
    const tasks = await env.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?')
      .bind(theirProject.id).first<{ n: number }>();
    expect(tasks?.n).toBe(1);
  });
});

describe('reorderProjects', () => {
  it('rewrites positions 1..n in the given order', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    const b = await db.createProject(env.DB, userId, 'B');
    const c = await db.createProject(env.DB, userId, 'C');

    await db.reorderProjects(env.DB, userId, [c.id, a.id, b.id]);

    const projects = await db.listProjects(env.DB, userId);
    expect(projects.map((p) => p.name)).toEqual(['C', 'A', 'B']);
  });

  it('throws NotFoundError and changes nothing when an id is not owned by the user', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    const b = await db.createProject(env.DB, userId, 'B');
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');

    await expect(db.reorderProjects(env.DB, userId, [b.id, a.id, theirs.id])).rejects.toBeInstanceOf(db.NotFoundError);

    const projects = await db.listProjects(env.DB, userId);
    expect(projects.map((p) => p.name)).toEqual(['A', 'B']);
  });
});
