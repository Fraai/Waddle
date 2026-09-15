export class NotFoundError extends Error {}

export interface Project {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
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

export async function createProject(db: D1Database, userId: number, name: string): Promise<Project> {
  const row = await db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM projects WHERE user_id = ?')
    .bind(userId).first<{ max: number }>();
  const nextPosition = (row?.max ?? 0) + 1;
  const result = await db.prepare(
    'INSERT INTO projects (user_id, name, position) VALUES (?, ?, ?) RETURNING *',
  ).bind(userId, name, nextPosition).first<Project>();
  if (!result) throw new Error('Failed to create project');
  return result;
}

export async function renameProject(db: D1Database, userId: number, projectId: number, name: string): Promise<void> {
  const { meta } = await db.prepare(
    'UPDATE projects SET name = ? WHERE id = ? AND user_id = ? AND is_inbox = 0',
  ).bind(name, projectId, userId).run();
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
