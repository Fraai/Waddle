import { describe, expect, it, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';
import { createProjectSchema, setProjectTypeSchema, setProjectParentSchema } from '../src/lib/validation';

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

  it('treats a blank parentProjectId (unselected <select>) as absent, not invalid', () => {
    const result = createProjectSchema.safeParse({ name: 'A', parentProjectId: '' });
    expect(result.success).toBe(true);
    expect(result.data?.parentProjectId).toBeUndefined();
  });

  it('coerces a numeric parentProjectId', () => {
    const result = createProjectSchema.safeParse({ name: 'A', parentProjectId: '3' });
    expect(result.success).toBe(true);
    expect(result.data?.parentProjectId).toBe(3);
  });
});

describe('setProjectParentSchema', () => {
  it('accepts a numeric parentProjectId or null, rejects missing/undefined', () => {
    expect(setProjectParentSchema.safeParse({ projectId: 1, parentProjectId: 2 }).success).toBe(true);
    expect(setProjectParentSchema.safeParse({ projectId: 1, parentProjectId: null }).success).toBe(true);
    expect(setProjectParentSchema.safeParse({ projectId: 1 }).success).toBe(false);
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

describe('toggleProjectFavorite', () => {
  it('turns favorite on, appending after any existing favorites', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    const b = await db.createProject(env.DB, userId, 'B');

    await db.toggleProjectFavorite(env.DB, userId, a.id);
    await db.toggleProjectFavorite(env.DB, userId, b.id);

    const [reloadedA, reloadedB] = await db.listProjects(env.DB, userId);
    expect(reloadedA.is_favorite).toBe(1);
    expect(reloadedA.favorite_position).toBe(1);
    expect(reloadedB.is_favorite).toBe(1);
    expect(reloadedB.favorite_position).toBe(2);
  });

  it('turns favorite back off and clears favorite_position', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    await db.toggleProjectFavorite(env.DB, userId, a.id);
    await db.toggleProjectFavorite(env.DB, userId, a.id);

    const [reloaded] = await db.listProjects(env.DB, userId);
    expect(reloaded.is_favorite).toBe(0);
    expect(reloaded.favorite_position).toBeNull();
  });

  it('like setProjectType, exempts the inbox', async () => {
    await env.DB.prepare('INSERT INTO projects (user_id, name, is_inbox) VALUES (?, ?, 1)').bind(userId, 'Inbox').run();
    const inbox = await env.DB.prepare('SELECT id FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(userId).first<{ id: number }>();
    await expect(db.toggleProjectFavorite(env.DB, userId, inbox!.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('throws NotFoundError for a project owned by someone else', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.toggleProjectFavorite(env.DB, userId, theirs.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('reorderFavoriteProjects', () => {
  it('rewrites favorite_position 1..n in the given order, independent of the main position', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    const b = await db.createProject(env.DB, userId, 'B');
    const c = await db.createProject(env.DB, userId, 'C');
    await db.toggleProjectFavorite(env.DB, userId, a.id);
    await db.toggleProjectFavorite(env.DB, userId, b.id);
    await db.toggleProjectFavorite(env.DB, userId, c.id);

    await db.reorderFavoriteProjects(env.DB, userId, [c.id, a.id, b.id]);

    const projects = await db.listProjects(env.DB, userId);
    const byFavoritePosition = [...projects].sort((x, y) => (x.favorite_position ?? 0) - (y.favorite_position ?? 0));
    expect(byFavoritePosition.map((p) => p.name)).toEqual(['C', 'A', 'B']);
    // The main list order (by `position`) is untouched by a favorites reorder.
    expect(projects.map((p) => p.name)).toEqual(['A', 'B', 'C']);
  });

  it('throws NotFoundError for a project that is not currently a favorite', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    const b = await db.createProject(env.DB, userId, 'B');
    await db.toggleProjectFavorite(env.DB, userId, a.id);

    await expect(db.reorderFavoriteProjects(env.DB, userId, [a.id, b.id])).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('createProject with a parent', () => {
  it('creates the project as a child, positioned among that parent\'s existing children', async () => {
    const parent = await db.createProject(env.DB, userId, 'Client X');
    const first = await db.createProject(env.DB, userId, 'Phase 1', 'work', parent.id);
    const second = await db.createProject(env.DB, userId, 'Phase 2', 'work', parent.id);

    expect(first.parent_project_id).toBe(parent.id);
    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
    // A sibling group under a parent is independent of the top-level one.
    expect(parent.position).toBe(1);
  });

  it('throws NotFoundError if the given parent does not exist or is not owned', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.createProject(env.DB, userId, 'Child', 'work', theirs.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('throws ValidationError if the given parent is itself a child', async () => {
    const parent = await db.createProject(env.DB, userId, 'Client X');
    const child = await db.createProject(env.DB, userId, 'Phase 1', 'work', parent.id);
    await expect(db.createProject(env.DB, userId, 'Grandchild', 'work', child.id)).rejects.toBeInstanceOf(db.ValidationError);
  });
});

describe('setProjectParent', () => {
  it('reparents a top-level project under another, appended after existing children', async () => {
    const parent = await db.createProject(env.DB, userId, 'Client X');
    await db.createProject(env.DB, userId, 'Phase 1', 'work', parent.id);
    const standalone = await db.createProject(env.DB, userId, 'Website Redesign');

    await db.setProjectParent(env.DB, userId, standalone.id, parent.id);

    const [reloaded] = (await db.listProjects(env.DB, userId)).filter((p) => p.id === standalone.id);
    expect(reloaded.parent_project_id).toBe(parent.id);
    expect(reloaded.position).toBe(2);
  });

  it('promotes a child back to top-level when set to null', async () => {
    const parent = await db.createProject(env.DB, userId, 'Client X');
    const child = await db.createProject(env.DB, userId, 'Phase 1', 'work', parent.id);

    await db.setProjectParent(env.DB, userId, child.id, null);

    const [reloaded] = (await db.listProjects(env.DB, userId)).filter((p) => p.id === child.id);
    expect(reloaded.parent_project_id).toBeNull();
  });

  it('rejects a project becoming its own parent', async () => {
    const a = await db.createProject(env.DB, userId, 'A');
    await expect(db.setProjectParent(env.DB, userId, a.id, a.id)).rejects.toBeInstanceOf(db.ValidationError);
  });

  it('rejects nesting under a project that is itself already a child (no grandchildren)', async () => {
    const parent = await db.createProject(env.DB, userId, 'Client X');
    const child = await db.createProject(env.DB, userId, 'Phase 1', 'work', parent.id);
    const other = await db.createProject(env.DB, userId, 'Other');

    await expect(db.setProjectParent(env.DB, userId, other.id, child.id)).rejects.toBeInstanceOf(db.ValidationError);
  });

  it('rejects a project with its own children from becoming a child', async () => {
    const parentA = await db.createProject(env.DB, userId, 'A');
    await db.createProject(env.DB, userId, 'A child', 'work', parentA.id);
    const parentB = await db.createProject(env.DB, userId, 'B');

    await expect(db.setProjectParent(env.DB, userId, parentA.id, parentB.id)).rejects.toBeInstanceOf(db.ValidationError);
  });

  it('like setProjectType, exempts the inbox on both sides', async () => {
    await env.DB.prepare('INSERT INTO projects (user_id, name, is_inbox) VALUES (?, ?, 1)').bind(userId, 'Inbox').run();
    const inbox = await env.DB.prepare('SELECT id FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(userId).first<{ id: number }>();
    const a = await db.createProject(env.DB, userId, 'A');

    await expect(db.setProjectParent(env.DB, userId, inbox!.id, a.id)).rejects.toBeInstanceOf(db.NotFoundError);
    await expect(db.setProjectParent(env.DB, userId, a.id, inbox!.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('throws NotFoundError for a project owned by someone else', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    const a = await db.createProject(env.DB, userId, 'A');
    await expect(db.setProjectParent(env.DB, userId, theirs.id, a.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('deleteProject with children', () => {
  it('promotes children to top-level instead of deleting them', async () => {
    const parent = await db.createProject(env.DB, userId, 'Client X');
    const child = await db.createProject(env.DB, userId, 'Phase 1', 'work', parent.id);

    await db.deleteProject(env.DB, userId, parent.id);

    const remaining = await db.listProjects(env.DB, userId);
    expect(remaining.map((p) => p.id)).toEqual([child.id]);
    expect(remaining[0].parent_project_id).toBeNull();
  });
});
