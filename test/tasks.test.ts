import { describe, expect, it, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';

let userId: number;
let otherUserId: number;
let projectId: number;

beforeEach(async () => {
  const user = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`user-${crypto.randomUUID()}@fraai.agency`).first<{ id: number }>();
  userId = user!.id;
  const other = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`other-${crypto.randomUUID()}@fraai.agency`).first<{ id: number }>();
  otherUserId = other!.id;
  const project = await db.createProject(env.DB, userId, 'Project');
  projectId = project.id;
});

describe('createTask', () => {
  it('creates a top-level task with defaults', async () => {
    const task = await db.createTask(env.DB, userId, { projectId, title: 'Write plan' });
    expect(task.priority).toBe(4);
    expect(task.section_id).toBeNull();
    expect(task.parent_task_id).toBeNull();
    expect(task.due_date).toBeNull();
    expect(task.done_at).toBeNull();
  });

  it('creates a subtask under a parent task', async () => {
    const parent = await db.createTask(env.DB, userId, { projectId, title: 'Parent' });
    const child = await db.createTask(env.DB, userId, { projectId, parentTaskId: parent.id, title: 'Child' });
    expect(child.parent_task_id).toBe(parent.id);
  });

  it('rejects a sectionId that does not belong to the given project', async () => {
    const otherProject = await db.createProject(env.DB, userId, 'Other');
    const section = await db.createSection(env.DB, userId, otherProject.id, 'Elsewhere');
    await expect(
      db.createTask(env.DB, userId, { projectId, sectionId: section.id, title: 'Bad' }),
    ).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('rejects a parentTaskId that is itself a subtask', async () => {
    const parent = await db.createTask(env.DB, userId, { projectId, title: 'Parent' });
    const child = await db.createTask(env.DB, userId, { projectId, parentTaskId: parent.id, title: 'Child' });
    await expect(
      db.createTask(env.DB, userId, { projectId, parentTaskId: child.id, title: 'Grandchild' }),
    ).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('rejects a project the user does not own', async () => {
    const theirs = await db.createProject(env.DB, otherUserId, 'Theirs');
    await expect(db.createTask(env.DB, userId, { projectId: theirs.id, title: 'Nope' }))
      .rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('appends position within its (project, section) list independently per section', async () => {
    const section = await db.createSection(env.DB, userId, projectId, 'Section');
    const unsectionedA = await db.createTask(env.DB, userId, { projectId, title: 'A' });
    const sectionedA = await db.createTask(env.DB, userId, { projectId, sectionId: section.id, title: 'B' });
    const unsectionedB = await db.createTask(env.DB, userId, { projectId, title: 'C' });
    expect(unsectionedA.position).toBe(1);
    expect(sectionedA.position).toBe(1);
    expect(unsectionedB.position).toBe(2);
  });
});

describe('updateTask', () => {
  it('updates the given fields and leaves the rest unchanged', async () => {
    const task = await db.createTask(env.DB, userId, { projectId, title: 'Original', priority: 3 });
    await db.updateTask(env.DB, userId, task.id, { title: 'Renamed' });
    const [reloaded] = await db.listTasksByProject(env.DB, userId, projectId);
    expect(reloaded.title).toBe('Renamed');
    expect(reloaded.priority).toBe(3);
  });

  it('throws NotFoundError for a task owned by someone else', async () => {
    const theirProject = await db.createProject(env.DB, otherUserId, 'Theirs');
    const theirTask = await db.createTask(env.DB, otherUserId, { projectId: theirProject.id, title: 'Theirs' });
    await expect(db.updateTask(env.DB, userId, theirTask.id, { title: 'Hijacked' })).rejects.toBeInstanceOf(db.NotFoundError);
  });

  it('clears a stale section_id when moved to a different project without specifying sectionId', async () => {
    const section = await db.createSection(env.DB, userId, projectId, 'Section A');
    const task = await db.createTask(env.DB, userId, { projectId, sectionId: section.id, title: 'Movable' });
    const otherProject = await db.createProject(env.DB, userId, 'Other');

    await db.updateTask(env.DB, userId, task.id, { projectId: otherProject.id });

    const [reloaded] = await db.listTasksByProject(env.DB, userId, otherProject.id);
    expect(reloaded.project_id).toBe(otherProject.id);
    expect(reloaded.section_id).toBeNull();
  });
});

describe('toggleTaskDone', () => {
  it('marks an open task done, then marks it open again', async () => {
    const task = await db.createTask(env.DB, userId, { projectId, title: 'Toggle me' });
    await db.toggleTaskDone(env.DB, userId, task.id);
    let [reloaded] = await db.listTasksByProject(env.DB, userId, projectId);
    expect(reloaded.done_at).not.toBeNull();

    await db.toggleTaskDone(env.DB, userId, task.id);
    [reloaded] = await db.listTasksByProject(env.DB, userId, projectId);
    expect(reloaded.done_at).toBeNull();
  });
});

describe('deleteTask', () => {
  it('deletes a task and its subtasks', async () => {
    const parent = await db.createTask(env.DB, userId, { projectId, title: 'Parent' });
    await db.createTask(env.DB, userId, { projectId, parentTaskId: parent.id, title: 'Child' });

    await db.deleteTask(env.DB, userId, parent.id);

    const remaining = await db.listTasksByProject(env.DB, userId, projectId);
    expect(remaining).toEqual([]);
  });

  it('throws NotFoundError for a task owned by someone else', async () => {
    const theirProject = await db.createProject(env.DB, otherUserId, 'Theirs');
    const theirTask = await db.createTask(env.DB, otherUserId, { projectId: theirProject.id, title: 'Theirs' });
    await expect(db.deleteTask(env.DB, userId, theirTask.id)).rejects.toBeInstanceOf(db.NotFoundError);
  });
});

describe('reorderTasks', () => {
  it('rewrites position and can move tasks into a different section', async () => {
    const section = await db.createSection(env.DB, userId, projectId, 'Section');
    const a = await db.createTask(env.DB, userId, { projectId, title: 'A' });
    const b = await db.createTask(env.DB, userId, { projectId, title: 'B' });

    await db.reorderTasks(env.DB, userId, projectId, section.id, [b.id, a.id]);

    const tasks = await db.listTasksByProject(env.DB, userId, projectId);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(byId.get(b.id)?.section_id).toBe(section.id);
    expect(byId.get(b.id)?.position).toBe(1);
    expect(byId.get(a.id)?.section_id).toBe(section.id);
    expect(byId.get(a.id)?.position).toBe(2);
  });

  it('throws NotFoundError and leaves positions unchanged when an id belongs to another project/user', async () => {
    const a = await db.createTask(env.DB, userId, { projectId, title: 'A' });
    const b = await db.createTask(env.DB, userId, { projectId, title: 'B' });

    const theirProject = await db.createProject(env.DB, otherUserId, 'Theirs');
    const theirTask = await db.createTask(env.DB, otherUserId, { projectId: theirProject.id, title: 'Foreign' });

    await expect(
      db.reorderTasks(env.DB, userId, projectId, null, [b.id, theirTask.id]),
    ).rejects.toBeInstanceOf(db.NotFoundError);

    const tasks = await db.listTasksByProject(env.DB, userId, projectId);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(byId.get(a.id)?.position).toBe(1);
    expect(byId.get(b.id)?.position).toBe(2);
  });

  it('throws NotFoundError and leaves rows unchanged when sectionId belongs to a different project', async () => {
    const a = await db.createTask(env.DB, userId, { projectId, title: 'A' });
    const b = await db.createTask(env.DB, userId, { projectId, title: 'B' });

    const otherProject = await db.createProject(env.DB, userId, 'Other');
    const foreignSection = await db.createSection(env.DB, userId, otherProject.id, 'Foreign section');

    await expect(
      db.reorderTasks(env.DB, userId, projectId, foreignSection.id, [a.id, b.id]),
    ).rejects.toBeInstanceOf(db.NotFoundError);

    const tasks = await db.listTasksByProject(env.DB, userId, projectId);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    expect(byId.get(a.id)?.section_id).toBeNull();
    expect(byId.get(a.id)?.position).toBe(1);
    expect(byId.get(b.id)?.section_id).toBeNull();
    expect(byId.get(b.id)?.position).toBe(2);
  });
});

describe('listOpenDatedTasks', () => {
  it('only returns open tasks that have a due date, ordered by due date', async () => {
    await db.createTask(env.DB, userId, { projectId, title: 'No date' });
    const later = await db.createTask(env.DB, userId, { projectId, title: 'Later', dueDate: '2099-01-02' });
    const sooner = await db.createTask(env.DB, userId, { projectId, title: 'Sooner', dueDate: '2099-01-01' });
    const done = await db.createTask(env.DB, userId, { projectId, title: 'Done', dueDate: '2099-01-01' });
    await db.toggleTaskDone(env.DB, userId, done.id);

    const tasks = await db.listOpenDatedTasks(env.DB, userId);
    expect(tasks.map((t) => t.id)).toEqual([sooner.id, later.id]);
  });
});
