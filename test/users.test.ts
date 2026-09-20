import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { provisionUser } from '../src/lib/users';

describe('provisionUser', () => {
  it('creates a user and an Inbox project on first login', async () => {
    const user = await provisionUser(env.DB, 'sam@example.com', 'Sam');
    expect(user.email).toBe('sam@example.com');
    expect(user.name).toBe('Sam');

    const inbox = await env.DB.prepare('SELECT * FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(user.id).first<{ name: string }>();
    expect(inbox?.name).toBe('Inbox');
  });

  it('is idempotent: a second login updates the name but does not duplicate the user or inbox', async () => {
    const first = await provisionUser(env.DB, 'sam2@example.com', 'Sam');
    const second = await provisionUser(env.DB, 'sam2@example.com', 'Samuel');
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Samuel');

    const userCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?')
      .bind('sam2@example.com').first<{ n: number }>();
    expect(userCount?.n).toBe(1);

    const inboxCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(first.id).first<{ n: number }>();
    expect(inboxCount?.n).toBe(1);
  });

  it('lowercases the email', async () => {
    const user = await provisionUser(env.DB, 'Sam3@Example.Com', null);
    expect(user.email).toBe('sam3@example.com');
  });

  it('handles concurrent calls for the same email without creating duplicate inboxes', async () => {
    const email = 'concurrent@example.com';
    const [user1, user2] = await Promise.all([
      provisionUser(env.DB, email, 'User A'),
      provisionUser(env.DB, email, 'User B'),
    ]);
    expect(user1.id).toBe(user2.id);

    const inboxCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(user1.id).first<{ n: number }>();
    expect(inboxCount?.n).toBe(1);
  });
});
