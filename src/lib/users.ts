export interface User {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

// Unlike provisionUser, never creates one — for callers (like MCP auth) that
// must resolve an existing account, not silently make a new one from an
// arbitrary email.
export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.prepare('SELECT id, email, name, created_at FROM users WHERE email = ?')
    .bind(normalizedEmail).first<User>();
  return user ?? null;
}

export async function provisionUser(db: D1Database, email: string, name: string | null): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  await db.prepare(
    `INSERT INTO users (email, name) VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name`,
  ).bind(normalizedEmail, name).run();

  const user = await db.prepare('SELECT id, email, name, created_at FROM users WHERE email = ?')
    .bind(normalizedEmail).first<User>();
  if (!user) throw new Error('Failed to provision user');

  await db.prepare(
    `INSERT INTO projects (user_id, name, is_inbox, position)
     SELECT ?, 'Inbox', 1, 0
     WHERE NOT EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND is_inbox = 1)
     ON CONFLICT (user_id) WHERE is_inbox = 1 DO NOTHING`,
  ).bind(user.id, user.id).run();

  return user;
}
