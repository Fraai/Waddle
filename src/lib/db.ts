import { nextDueDate } from './repeat';

export class NotFoundError extends Error {}

export interface Project {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  type: 'private' | 'work';
  is_inbox: number;
  position: number;
  is_favorite: number;
  favorite_position: number | null;
  parent_project_id: number | null;
  created_at: string;
}

async function assertProjectOwned(db: D1Database, userId: number, projectId: number): Promise<void> {
  const project = await db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .bind(projectId, userId).first();
  if (!project) throw new NotFoundError('Project not found');
}

export async function listProjects(db: D1Database, userId: number): Promise<Project[]> {
  const { results } = await db.prepare(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY is_inbox DESC, position ASC',
  ).bind(userId).all<Project>();
  return results;
}

// `position` orders a project among its siblings — other projects sharing
// the same parent_project_id (NULL counts as its own group, "top level").
// Not a single global sequence, so a new project (or one just reparented,
// see setProjectParent) is appended to the end of whichever group it lands
// in, not the end of the whole table.
export async function createProject(
  db: D1Database, userId: number, name: string, type: 'private' | 'work' = 'work',
  parentProjectId: number | null = null,
): Promise<Project> {
  if (parentProjectId != null) await assertEligibleParent(db, userId, parentProjectId);
  const row = await db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS max FROM projects WHERE user_id = ? AND parent_project_id IS ?',
  ).bind(userId, parentProjectId).first<{ max: number }>();
  const nextPosition = (row?.max ?? 0) + 1;
  const result = await db.prepare(
    'INSERT INTO projects (user_id, name, type, position, parent_project_id) VALUES (?, ?, ?, ?, ?) RETURNING *',
  ).bind(userId, name, type, nextPosition, parentProjectId).first<Project>();
  if (!result) throw new Error('Failed to create project');
  return result;
}

export async function renameProject(db: D1Database, userId: number, projectId: number, name: string): Promise<void> {
  const { meta } = await db.prepare(
    'UPDATE projects SET name = ? WHERE id = ? AND user_id = ? AND is_inbox = 0',
  ).bind(name, projectId, userId).run();
  if (meta.changes === 0) throw new NotFoundError('Project not found');
}

// Like rename/delete, the Inbox is exempt — it's the catch-all, not a
// private/work project, and the UI no longer offers a way to set it.
export async function setProjectType(
  db: D1Database, userId: number, projectId: number, type: 'private' | 'work',
): Promise<void> {
  const { meta } = await db.prepare(
    'UPDATE projects SET type = ? WHERE id = ? AND user_id = ? AND is_inbox = 0',
  ).bind(type, projectId, userId).run();
  if (meta.changes === 0) throw new NotFoundError('Project not found');
}

export async function setProjectColor(
  db: D1Database, userId: number, projectId: number, color: string,
): Promise<void> {
  const { meta } = await db.prepare(
    'UPDATE projects SET color = ? WHERE id = ? AND user_id = ?',
  ).bind(color, projectId, userId).run();
  if (meta.changes === 0) throw new NotFoundError('Project not found');
}

// A candidate parent must be owned, not the Inbox, and not itself a child —
// nesting is capped at one level, so something that already has a parent
// can't gain children of its own.
async function assertEligibleParent(db: D1Database, userId: number, parentProjectId: number): Promise<void> {
  const parent = await db.prepare(
    'SELECT parent_project_id FROM projects WHERE id = ? AND user_id = ? AND is_inbox = 0',
  ).bind(parentProjectId, userId).first<{ parent_project_id: number | null }>();
  if (!parent) throw new NotFoundError('Project not found');
  if (parent.parent_project_id != null) throw new ValidationError('That project is already a sub-project');
}

// Like the other one-level checks, this exists because SQLite can't express
// "no grandchildren" as a table constraint.
export class ValidationError extends Error {}

export async function setProjectParent(
  db: D1Database, userId: number, projectId: number, parentProjectId: number | null,
): Promise<void> {
  if (parentProjectId === projectId) throw new ValidationError('A project cannot be its own parent');

  const project = await db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ? AND is_inbox = 0')
    .bind(projectId, userId).first();
  if (!project) throw new NotFoundError('Project not found');

  if (parentProjectId != null) {
    await assertEligibleParent(db, userId, parentProjectId);
    const hasChildren = await db.prepare(
      'SELECT 1 FROM projects WHERE parent_project_id = ? AND user_id = ? LIMIT 1',
    ).bind(projectId, userId).first();
    if (hasChildren) throw new ValidationError('A project with sub-projects of its own cannot become a sub-project');
  }

  const row = await db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS max FROM projects WHERE user_id = ? AND parent_project_id IS ? AND id != ?',
  ).bind(userId, parentProjectId, projectId).first<{ max: number }>();
  await db.prepare('UPDATE projects SET parent_project_id = ?, position = ? WHERE id = ? AND user_id = ?')
    .bind(parentProjectId, (row?.max ?? 0) + 1, projectId, userId).run();
}

export async function deleteProject(db: D1Database, userId: number, projectId: number): Promise<void> {
  // Every statement is scoped by a subquery that re-checks ownership AND
  // is_inbox = 0 — not just by project_id — so a projectId belonging to
  // another user (or the caller's own inbox) deletes zero rows everywhere,
  // instead of only failing the final projects DELETE while still wiping
  // that project's sections/tasks.
  const ownedProject = `project_id IN (
    SELECT id FROM projects WHERE id = ? AND user_id = ? AND is_inbox = 0
  )`;
  const results = await db.batch([
    db.prepare(`DELETE FROM tasks WHERE ${ownedProject}`).bind(projectId, userId),
    db.prepare(`DELETE FROM sections WHERE ${ownedProject}`).bind(projectId, userId),
    // Sub-projects survive a parent's deletion, promoted to top-level —
    // must run before the projects DELETE below, since a dangling
    // parent_project_id would otherwise point at a row that no longer exists.
    db.prepare('UPDATE projects SET parent_project_id = NULL WHERE parent_project_id = ? AND user_id = ?')
      .bind(projectId, userId),
    db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ? AND is_inbox = 0').bind(projectId, userId),
  ]);
  if (results[3].meta.changes === 0) throw new NotFoundError('Project not found');
}

export async function reorderProjects(db: D1Database, userId: number, orderedIds: number[]): Promise<void> {
  const placeholders = orderedIds.map(() => '?').join(',');
  const owned = await db.prepare(
    `SELECT COUNT(*) AS count FROM projects WHERE user_id = ? AND is_inbox = 0 AND id IN (${placeholders})`,
  ).bind(userId, ...orderedIds).first<{ count: number }>();
  if ((owned?.count ?? 0) !== orderedIds.length) throw new NotFoundError('Project not found');

  const statements = orderedIds.map((id, index) =>
    db.prepare('UPDATE projects SET position = ? WHERE id = ? AND user_id = ? AND is_inbox = 0')
      .bind(index + 1, id, userId),
  );
  await db.batch(statements);
}

// A favorite is a second, independent lens on top of the regular project
// list, not a move — favoriting never touches `position`, and a project can
// be in both places at once. Like rename/delete/setProjectType, the Inbox
// is exempt: it's already pinned above everything, so a duplicate favorite
// state would be redundant.
export async function toggleProjectFavorite(db: D1Database, userId: number, projectId: number): Promise<void> {
  const project = await db.prepare(
    'SELECT is_favorite FROM projects WHERE id = ? AND user_id = ? AND is_inbox = 0',
  ).bind(projectId, userId).first<{ is_favorite: number }>();
  if (!project) throw new NotFoundError('Project not found');

  if (project.is_favorite) {
    await db.prepare('UPDATE projects SET is_favorite = 0, favorite_position = NULL WHERE id = ? AND user_id = ?')
      .bind(projectId, userId).run();
    return;
  }

  const row = await db.prepare(
    'SELECT COALESCE(MAX(favorite_position), 0) AS max FROM projects WHERE user_id = ? AND is_favorite = 1',
  ).bind(userId).first<{ max: number }>();
  await db.prepare('UPDATE projects SET is_favorite = 1, favorite_position = ? WHERE id = ? AND user_id = ?')
    .bind((row?.max ?? 0) + 1, projectId, userId).run();
}

export async function reorderFavoriteProjects(db: D1Database, userId: number, orderedIds: number[]): Promise<void> {
  const placeholders = orderedIds.map(() => '?').join(',');
  const owned = await db.prepare(
    `SELECT COUNT(*) AS count FROM projects WHERE user_id = ? AND is_favorite = 1 AND id IN (${placeholders})`,
  ).bind(userId, ...orderedIds).first<{ count: number }>();
  if ((owned?.count ?? 0) !== orderedIds.length) throw new NotFoundError('Project not found');

  const statements = orderedIds.map((id, index) =>
    db.prepare('UPDATE projects SET favorite_position = ? WHERE id = ? AND user_id = ? AND is_favorite = 1')
      .bind(index + 1, id, userId),
  );
  await db.batch(statements);
}

export interface Section {
  id: number;
  project_id: number;
  name: string;
  position: number;
  created_at: string;
}

export async function listSections(db: D1Database, userId: number, projectId: number): Promise<Section[]> {
  await assertProjectOwned(db, userId, projectId);
  const { results } = await db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY position ASC')
    .bind(projectId).all<Section>();
  return results;
}

export async function createSection(db: D1Database, userId: number, projectId: number, name: string): Promise<Section> {
  await assertProjectOwned(db, userId, projectId);
  const row = await db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM sections WHERE project_id = ?')
    .bind(projectId).first<{ max: number }>();
  const nextPosition = (row?.max ?? 0) + 1;
  const result = await db.prepare('INSERT INTO sections (project_id, name, position) VALUES (?, ?, ?) RETURNING *')
    .bind(projectId, name, nextPosition).first<Section>();
  if (!result) throw new Error('Failed to create section');
  return result;
}

export async function renameSection(db: D1Database, userId: number, sectionId: number, name: string): Promise<void> {
  const { meta } = await db.prepare(
    `UPDATE sections SET name = ?
     WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)`,
  ).bind(name, sectionId, userId).run();
  if (meta.changes === 0) throw new NotFoundError('Section not found');
}

export async function deleteSection(db: D1Database, userId: number, sectionId: number): Promise<void> {
  const results = await db.batch([
    db.prepare('UPDATE tasks SET section_id = NULL WHERE section_id = ? AND user_id = ?').bind(sectionId, userId),
    db.prepare(
      `DELETE FROM sections WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)`,
    ).bind(sectionId, userId),
  ]);
  if (results[1].meta.changes === 0) throw new NotFoundError('Section not found');
}

// Checks that every id in orderedIds actually belongs to this project before
// touching any row, instead of silently no-op'ing on a foreign or
// nonexistent id.
export async function reorderSections(
  db: D1Database, userId: number, projectId: number, orderedIds: number[],
): Promise<void> {
  await assertProjectOwned(db, userId, projectId);
  const placeholders = orderedIds.map(() => '?').join(',');
  const owned = await db.prepare(
    `SELECT COUNT(*) AS count FROM sections WHERE project_id = ? AND id IN (${placeholders})`,
  ).bind(projectId, ...orderedIds).first<{ count: number }>();
  if ((owned?.count ?? 0) !== orderedIds.length) throw new NotFoundError('Section not found');
  const statements = orderedIds.map((id, index) =>
    db.prepare('UPDATE sections SET position = ? WHERE id = ? AND project_id = ?').bind(index + 1, id, projectId),
  );
  await db.batch(statements);
}

export interface Task {
  id: number;
  user_id: number;
  project_id: number;
  section_id: number | null;
  parent_task_id: number | null;
  title: string;
  description: string | null;
  href: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: number;
  repeat_rule: string | null;
  notified_at: string | null;
  done_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  projectId: number;
  sectionId?: number | null;
  parentTaskId?: number | null;
  title: string;
  description?: string | null;
  href?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: number;
  repeatRule?: string | null;
}

export async function listTasksByProject(db: D1Database, userId: number, projectId: number): Promise<Task[]> {
  await assertProjectOwned(db, userId, projectId);
  const { results } = await db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY position ASC',
  ).bind(projectId, userId).all<Task>();
  return results;
}

// Every task the user has ever created, done or open — the raw material
// for the stats page. No date/status filter, unlike every other list query.
export async function listAllTasks(db: D1Database, userId: number): Promise<Task[]> {
  const { results } = await db.prepare('SELECT * FROM tasks WHERE user_id = ?').bind(userId).all<Task>();
  return results;
}

export async function listOpenDatedTasks(db: D1Database, userId: number): Promise<Task[]> {
  const { results } = await db.prepare(
    `SELECT * FROM tasks WHERE user_id = ? AND done_at IS NULL AND due_date IS NOT NULL
     ORDER BY due_date ASC, priority ASC, position ASC`,
  ).bind(userId).all<Task>();
  return results;
}

export async function createTask(db: D1Database, userId: number, input: CreateTaskInput): Promise<Task> {
  await assertProjectOwned(db, userId, input.projectId);

  if (input.sectionId != null) {
    const section = await db.prepare('SELECT id FROM sections WHERE id = ? AND project_id = ?')
      .bind(input.sectionId, input.projectId).first();
    if (!section) throw new NotFoundError('Section not found');
  }
  if (input.parentTaskId != null) {
    const parent = await db.prepare(
      'SELECT id FROM tasks WHERE id = ? AND project_id = ? AND user_id = ? AND parent_task_id IS NULL',
    ).bind(input.parentTaskId, input.projectId, userId).first();
    if (!parent) throw new NotFoundError('Parent task not found');
  }

  const row = await db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE project_id = ? AND section_id IS ? AND user_id = ?',
  ).bind(input.projectId, input.sectionId ?? null, userId).first<{ max: number }>();
  const nextPosition = (row?.max ?? 0) + 1;

  const result = await db.prepare(
    `INSERT INTO tasks (user_id, project_id, section_id, parent_task_id, title, description, href, due_date, due_time, priority, repeat_rule, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(
    userId, input.projectId, input.sectionId ?? null, input.parentTaskId ?? null,
    input.title, input.description ?? null, input.href ?? null,
    input.dueDate ?? null, input.dueTime ?? null, input.priority ?? 4, input.repeatRule ?? null, nextPosition,
  ).first<Task>();
  if (!result) throw new Error('Failed to create task');
  return result;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  href?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: number;
  projectId?: number;
  sectionId?: number | null;
  repeatRule?: string | null;
}

export async function updateTask(
  db: D1Database, userId: number, taskId: number, input: UpdateTaskInput,
): Promise<void> {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .bind(taskId, userId).first<Task>();
  if (!task) throw new NotFoundError('Task not found');

  const projectId = input.projectId ?? task.project_id;
  const projectChanged = input.projectId != null && input.projectId !== task.project_id;
  if (input.projectId != null) await assertProjectOwned(db, userId, input.projectId);
  if (input.sectionId != null) {
    const section = await db.prepare('SELECT id FROM sections WHERE id = ? AND project_id = ?')
      .bind(input.sectionId, projectId).first();
    if (!section) throw new NotFoundError('Section not found');
  }

  // ponytail: when the caller moves the task to a new project without saying
  // anything about section, the task's existing section (scoped to the OLD
  // project) can't just carry over — re-check it against the new project and
  // fall back to null (unsectioned) rather than writing a cross-project
  // section_id/project_id pair.
  let sectionId = input.sectionId !== undefined ? input.sectionId : task.section_id;
  if (input.sectionId === undefined && projectChanged && task.section_id != null) {
    const section = await db.prepare('SELECT id FROM sections WHERE id = ? AND project_id = ?')
      .bind(task.section_id, projectId).first();
    sectionId = section ? task.section_id : null;
  }

  const nextDueDate = input.dueDate !== undefined ? input.dueDate : task.due_date;
  const nextDueTime = input.dueTime !== undefined ? input.dueTime : task.due_time;
  // Rescheduling (date or time) un-fires a notification that already went
  // out, or clears the slot for one that hasn't yet — either way the old
  // notified_at no longer describes the current due date/time.
  const dueChanged = nextDueDate !== task.due_date || nextDueTime !== task.due_time;

  const updateThis = db.prepare(
    `UPDATE tasks SET title = ?, description = ?, href = ?, due_date = ?, due_time = ?, priority = ?, repeat_rule = ?, notified_at = ?, project_id = ?, section_id = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  ).bind(
    input.title ?? task.title,
    input.description !== undefined ? input.description : task.description,
    input.href !== undefined ? input.href : task.href,
    nextDueDate,
    nextDueTime,
    input.priority ?? task.priority,
    input.repeatRule !== undefined ? input.repeatRule : task.repeat_rule,
    dueChanged ? null : task.notified_at,
    projectId,
    sectionId,
    taskId, userId,
  );

  if (!projectChanged) {
    await updateThis.run();
    return;
  }

  // Subtasks always belong to their parent's project (enforced when they're
  // created) — moving the parent without them would leave them pointing at
  // a project their own parent no longer lives in. They're never sectioned
  // (the "Add subtask" form has no section picker), so no section_id to fix
  // up on their end.
  const moveChildren = db.prepare(
    `UPDATE tasks SET project_id = ?, updated_at = datetime('now') WHERE parent_task_id = ? AND user_id = ?`,
  ).bind(projectId, taskId, userId);

  await db.batch([updateThis, moveChildren]);
}

export async function toggleTaskDone(
  db: D1Database, userId: number, taskId: number,
): Promise<{ nextOccurrenceCreated: boolean }> {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .bind(taskId, userId).first<Task>();
  if (!task) throw new NotFoundError('Task not found');

  const markingDone = task.done_at === null;
  await db.prepare(`UPDATE tasks SET done_at = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(markingDone ? new Date().toISOString() : null, taskId, userId).run();

  // Completing a repeating task spawns its next occurrence as an ordinary
  // new task with the same rule copied onto it — no separate series to
  // track. A repeat rule with no due date has nothing to roll forward from,
  // so it just completes like a normal task instead.
  if (markingDone && task.repeat_rule && task.due_date) {
    await createTask(db, userId, {
      projectId: task.project_id,
      sectionId: task.section_id,
      parentTaskId: task.parent_task_id,
      title: task.title,
      description: task.description,
      href: task.href,
      dueDate: nextDueDate(task.due_date, task.repeat_rule),
      dueTime: task.due_time,
      priority: task.priority,
      repeatRule: task.repeat_rule,
    });
    return { nextOccurrenceCreated: true };
  }
  return { nextOccurrenceCreated: false };
}

export async function deleteTask(db: D1Database, userId: number, taskId: number): Promise<void> {
  const results = await db.batch([
    db.prepare('DELETE FROM tasks WHERE parent_task_id = ? AND user_id = ?').bind(taskId, userId),
    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId),
  ]);
  if (results[1].meta.changes === 0) throw new NotFoundError('Task not found');
}

// Checks that every id in orderedIds actually belongs to this project and
// user before touching any row, instead of silently no-op'ing on a foreign
// or nonexistent id.
export async function reorderTasks(
  db: D1Database, userId: number, projectId: number, sectionId: number | null, orderedIds: number[],
): Promise<void> {
  await assertProjectOwned(db, userId, projectId);
  if (sectionId != null) {
    const section = await db.prepare('SELECT id FROM sections WHERE id = ? AND project_id = ?')
      .bind(sectionId, projectId).first();
    if (!section) throw new NotFoundError('Section not found');
  }
  const placeholders = orderedIds.map(() => '?').join(',');
  const owned = await db.prepare(
    `SELECT COUNT(*) AS count FROM tasks WHERE project_id = ? AND user_id = ? AND id IN (${placeholders})`,
  ).bind(projectId, userId, ...orderedIds).first<{ count: number }>();
  if ((owned?.count ?? 0) !== orderedIds.length) throw new NotFoundError('Task not found');
  const statements = orderedIds.map((id, index) =>
    db.prepare(
      'UPDATE tasks SET section_id = ?, position = ? WHERE id = ? AND project_id = ? AND user_id = ?',
    ).bind(sectionId, index + 1, id, projectId, userId),
  );
  await db.batch(statements);
}

// ==========================================================================
// Push notifications
// ==========================================================================

// One row per subscribed browser/device — a user can have several (phone,
// laptop, ...). Upserted on endpoint, since the browser hands back the same
// endpoint for an already-subscribed device rather than minting a new one.
export async function savePushSubscription(
  db: D1Database, userId: number, endpoint: string, p256dh: string, auth: string,
): Promise<void> {
  await db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  ).bind(userId, endpoint, p256dh, auth).run();
}

export async function deletePushSubscription(db: D1Database, userId: number, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(userId, endpoint).run();
}

// No user scoping — called by the notification sweep (src/worker-entry.ts)
// when a push service reports a subscription as gone (404/410), identified
// only by the endpoint URL it was sent to.
export async function deletePushSubscriptionByEndpoint(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
}

export interface DueTaskNotification extends Task {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Cross-user (the sweep runs once for everyone, not per-request) — a task
// with a due_time that has arrived or passed today, not yet notified, not
// done, joined with every push subscription its owner has (so a task with
// two subscribed devices yields two rows, one push each). A task with no
// due_time never matches — there's nothing to compare "now" against.
export async function listTasksDueForNotification(
  db: D1Database, todayISO: string, nowHHMM: string,
): Promise<DueTaskNotification[]> {
  const { results } = await db.prepare(
    `SELECT tasks.*, push_subscriptions.endpoint, push_subscriptions.p256dh, push_subscriptions.auth
     FROM tasks
     JOIN push_subscriptions ON push_subscriptions.user_id = tasks.user_id
     WHERE tasks.done_at IS NULL
       AND tasks.notified_at IS NULL
       AND tasks.due_date = ?
       AND tasks.due_time IS NOT NULL
       AND tasks.due_time <= ?`,
  ).bind(todayISO, nowHHMM).all<DueTaskNotification>();
  return results;
}

export async function markTaskNotified(db: D1Database, taskId: number): Promise<void> {
  await db.prepare(`UPDATE tasks SET notified_at = datetime('now') WHERE id = ?`).bind(taskId).run();
}
