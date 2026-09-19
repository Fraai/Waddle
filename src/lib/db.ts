export class NotFoundError extends Error {}

export interface Project {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  type: 'private' | 'work';
  is_inbox: number;
  position: number;
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

export async function createProject(
  db: D1Database, userId: number, name: string, type: 'private' | 'work' = 'work',
): Promise<Project> {
  const row = await db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM projects WHERE user_id = ?')
    .bind(userId).first<{ max: number }>();
  const nextPosition = (row?.max ?? 0) + 1;
  const result = await db.prepare(
    'INSERT INTO projects (user_id, name, type, position) VALUES (?, ?, ?, ?) RETURNING *',
  ).bind(userId, name, type, nextPosition).first<Project>();
  if (!result) throw new Error('Failed to create project');
  return result;
}

export async function renameProject(db: D1Database, userId: number, projectId: number, name: string): Promise<void> {
  const { meta } = await db.prepare(
    'UPDATE projects SET name = ? WHERE id = ? AND user_id = ? AND is_inbox = 0',
  ).bind(name, projectId, userId).run();
  if (meta.changes === 0) throw new NotFoundError('Project not found');
}

// Unlike rename/delete, the Inbox can change type — it's not exempt from
// the private/work split just because it's un-renameable.
export async function setProjectType(
  db: D1Database, userId: number, projectId: number, type: 'private' | 'work',
): Promise<void> {
  const { meta } = await db.prepare(
    'UPDATE projects SET type = ? WHERE id = ? AND user_id = ?',
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
    db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ? AND is_inbox = 0').bind(projectId, userId),
  ]);
  if (results[2].meta.changes === 0) throw new NotFoundError('Project not found');
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

// ponytail: hardened per the Task 7 reorderProjects fix — checks that every
// id in orderedIds actually belongs to this project before touching any row,
// instead of silently no-op'ing on a foreign/nonexistent id.
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
  priority: number;
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
  priority?: number;
}

export async function listTasksByProject(db: D1Database, userId: number, projectId: number): Promise<Task[]> {
  await assertProjectOwned(db, userId, projectId);
  const { results } = await db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? AND user_id = ? ORDER BY position ASC',
  ).bind(projectId, userId).all<Task>();
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
    `INSERT INTO tasks (user_id, project_id, section_id, parent_task_id, title, description, href, due_date, priority, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(
    userId, input.projectId, input.sectionId ?? null, input.parentTaskId ?? null,
    input.title, input.description ?? null, input.href ?? null,
    input.dueDate ?? null, input.priority ?? 4, nextPosition,
  ).first<Task>();
  if (!result) throw new Error('Failed to create task');
  return result;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  href?: string | null;
  dueDate?: string | null;
  priority?: number;
  projectId?: number;
  sectionId?: number | null;
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

  const updateThis = db.prepare(
    `UPDATE tasks SET title = ?, description = ?, href = ?, due_date = ?, priority = ?, project_id = ?, section_id = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  ).bind(
    input.title ?? task.title,
    input.description !== undefined ? input.description : task.description,
    input.href !== undefined ? input.href : task.href,
    input.dueDate !== undefined ? input.dueDate : task.due_date,
    input.priority ?? task.priority,
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

export async function toggleTaskDone(db: D1Database, userId: number, taskId: number): Promise<void> {
  const task = await db.prepare('SELECT done_at FROM tasks WHERE id = ? AND user_id = ?')
    .bind(taskId, userId).first<{ done_at: string | null }>();
  if (!task) throw new NotFoundError('Task not found');

  await db.prepare(`UPDATE tasks SET done_at = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(task.done_at ? null : new Date().toISOString(), taskId, userId).run();
}

export async function deleteTask(db: D1Database, userId: number, taskId: number): Promise<void> {
  const results = await db.batch([
    db.prepare('DELETE FROM tasks WHERE parent_task_id = ? AND user_id = ?').bind(taskId, userId),
    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(taskId, userId),
  ]);
  if (results[1].meta.changes === 0) throw new NotFoundError('Task not found');
}

// ponytail: hardened per the Task 7/8 reorderX fix — checks that every id in
// orderedIds actually belongs to this project/user before touching any row,
// instead of silently no-op'ing on a foreign/nonexistent id.
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
