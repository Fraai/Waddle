# Todo App MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of todo.fraai.agency — a personal, per-user Todoist alternative for the fraai.agency team, with Google SSO, multiple projects, sections, subtasks, priorities, due dates, and drag-and-drop ordering.

**Architecture:** Astro SSR on Cloudflare Workers + D1, following the exact conventions already used by `crm.fraai.agency` and `flow.fraai.agency`: `wrangler.toml` + `migrations/`, Astro Actions for mutations, `sortablejs` for drag-and-drop, raw SQL via `D1Database.prepare()`, Vitest + `@cloudflare/vitest-pool-workers` for DB-backed tests. Auth is a ported, narrowed copy of `flow.fraai.agency`'s WebCrypto JWT + Google OAuth implementation.

**Tech Stack:** Astro 7, `@astrojs/cloudflare`, Cloudflare Workers + D1, Tailwind CSS v4, `sortablejs`, `zod`, Vitest, `@cloudflare/vitest-pool-workers`, TypeScript.

**Spec:** [docs/superpowers/specs/2026-09-15-todo-app-design.md](../specs/2026-09-15-todo-app-design.md)

## Global Constraints

- Personal, per-user data only — no sharing, no assignment, no cross-user visibility. Every DB query that touches `projects`, `sections`, or `tasks` must be scoped to the acting user's `user_id`, including in batched/cascading deletes (a delete statement that only filters by `project_id` without also checking that project's `user_id` is a bug — see Task 7).
- Auth: Google OAuth, `@fraai.agency` accounts only. No passwords, no other SSO providers, no roles/organizations.
- Due dates are date-only (`YYYY-MM-DD`), no time-of-day.
- Out of scope: recurring tasks, labels/tags, mobile layout.
- A mutation on an id the current user doesn't own (or doesn't exist) must behave as 404 Not Found, never 403 Forbidden — don't leak existence of other users' data.
- English UI throughout (internal tool).
- Node >= 22.12.0, matching the other fraai.agency internal tools.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `.env.example`
- Create: `src/styles/global.css`
- Create: `src/pages/index.astro`
- Create: `public/.gitkeep`

**Interfaces:**
- Produces: a buildable Astro + Cloudflare project skeleton every later task adds files to. No app code yet.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "todo-fraai-agency",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "wrangler dev",
    "pretest": "astro build",
    "test": "vitest run",
    "db:migrate:local": "wrangler d1 migrations apply todo-fraai-agency --local",
    "db:migrate:remote": "wrangler d1 migrations apply todo-fraai-agency --remote",
    "deploy": "astro build && wrangler deploy"
  },
  "dependencies": {
    "@astrojs/cloudflare": "^14.0.2",
    "astro": "^7.0.4",
    "sortablejs": "^1.15.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.17.0",
    "@cloudflare/workers-types": "^4.20260701.1",
    "@tailwindcss/vite": "^4.0.0",
    "@types/sortablejs": "^1.15.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.9",
    "wrangler": "^4.106.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs cleanly, creates `package-lock.json` and `node_modules/`.

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  }
}
```

- [ ] **Step 5: Create `wrangler.toml`**

```toml
name = "todo-fraai-agency"
main = "@astrojs/cloudflare/entrypoints/server"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

route = { pattern = "todo.fraai.agency", custom_domain = true }

[assets]
directory = "./dist/client"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "todo-fraai-agency"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "migrations"
```

If you have `wrangler` authenticated against the fraai.agency Cloudflare account, run `npx wrangler d1 create todo-fraai-agency` and replace `database_id` with the printed id. If not, leave the placeholder — local dev, `wrangler d1 migrations apply --local`, and all Vitest tests use a local/simulated D1 and never read this value; only `wrangler deploy` needs the real id.

- [ ] **Step 6: Generate Cloudflare Worker types**

Run: `npx wrangler types`
Expected: creates `worker-configuration.d.ts` in the project root.

- [ ] **Step 7: Create `.env.example`**

```
JWT_SECRET=min-32-char-random-string
AUTH_GOOGLE_ID=google-oauth-client-id
AUTH_GOOGLE_SECRET=google-oauth-client-secret
```

- [ ] **Step 8: Create `src/styles/global.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 9: Create a placeholder homepage at `src/pages/index.astro`**

```astro
---
import '../styles/global.css';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Todo</title>
  </head>
  <body>
    <p>todo.fraai.agency</p>
  </body>
</html>
```

(Task 6 replaces this with the real auth-aware redirect.)

- [ ] **Step 10: Create `public/.gitkeep`**

Empty file — keeps the `public/` directory in git until real static assets are added.

- [ ] **Step 11: Verify the project builds**

Run: `npm run build`
Expected: succeeds, produces `dist/`.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json wrangler.toml .env.example src/styles/global.css src/pages/index.astro public/.gitkeep worker-configuration.d.ts
git commit -m "Scaffold Astro + Cloudflare Workers project"
```

---

## Task 2: Database schema + test harness

**Files:**
- Create: `migrations/0001_init.sql`
- Create: `vitest.config.ts`
- Create: `test/apply-migrations.ts`
- Create: `test/mock-astro-middleware.ts`
- Test: `test/schema.test.ts`

**Interfaces:**
- Produces: the `users`, `projects`, `sections`, `tasks` tables every later task's DB code relies on, plus the Vitest + local-D1 test harness every later `test/*.test.ts` file uses.

- [ ] **Step 1: Write the schema migration**

```sql
-- migrations/0001_init.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  color TEXT,
  is_inbox INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  section_id INTEGER REFERENCES sections(id),
  parent_task_id INTEGER REFERENCES tasks(id),
  title TEXT NOT NULL,
  due_date TEXT,
  priority INTEGER NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 4),
  done_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_sections_project ON sections(project_id);
CREATE INDEX idx_tasks_user_open ON tasks(user_id, done_at, due_date);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
```

- [ ] **Step 2: Create the Vitest config with a local D1 binding**

```ts
// vitest.config.ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrationsPath = path.join(__dirname, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);
  return {
    resolve: {
      alias: {
        'astro:middleware': new URL('./test/mock-astro-middleware.ts', import.meta.url).pathname,
      },
    },
    plugins: [
      cloudflareTest({
        miniflare: {
          d1Databases: { DB: 'todo-fraai-agency-test' },
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
```

- [ ] **Step 3: Create the migration-applying setup file**

```ts
// test/apply-migrations.ts
import { applyD1Migrations, env } from 'cloudflare:test';

// Setup files run outside isolated storage, and may be run multiple times.
// applyD1Migrations() only applies migrations that haven't already been
// applied, so calling this here on every test file is safe.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 4: Create the `astro:middleware` mock used by middleware tests**

```ts
// test/mock-astro-middleware.ts
export function defineMiddleware(handler: any) {
  return handler;
}
```

- [ ] **Step 5: Write a schema smoke test**

```ts
// test/schema.test.ts
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
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: both tests in `test/schema.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add migrations vitest.config.ts test/apply-migrations.ts test/mock-astro-middleware.ts test/schema.test.ts
git commit -m "Add D1 schema and Vitest/D1 test harness"
```

---

## Task 3: Auth utilities — JWT, cookies, domain allowlist

**Files:**
- Create: `src/utils/auth.ts`
- Test: `test/auth.test.ts`

**Interfaces:**
- Produces: `signJWT(payload, secret)`, `verifyJWT(token, secret)`, `parseCookies(header)`, `makeAuthCookie(token)`, `clearAuthCookie()`, `isAllowedEmail(email)`, and the `JWTPayload` type. Task 5 (middleware) and Task 6 (OAuth routes) both depend on these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// test/auth.test.ts
import { describe, expect, it } from 'vitest';
import {
  signJWT,
  verifyJWT,
  parseCookies,
  makeAuthCookie,
  clearAuthCookie,
  isAllowedEmail,
} from '../src/utils/auth';

const SECRET = 'a'.repeat(32);

describe('JWT sign/verify', () => {
  it('round-trips a payload', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency', name: 'Sam' }, SECRET);
    const payload = await verifyJWT(token, SECRET);
    expect(payload?.sub).toBe('1');
    expect(payload?.email).toBe('sam@fraai.agency');
    expect(payload?.name).toBe('Sam');
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency' }, SECRET);
    const payload = await verifyJWT(token, 'b'.repeat(32));
    expect(payload).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyJWT('not-a-jwt', SECRET)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signJWT({ sub: '1', email: 'sam@fraai.agency' }, SECRET);
    const [header, body, sig] = token.split('.');
    const decoded = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    decoded.exp = Math.floor(Date.now() / 1000) - 10;
    const reencoded = btoa(JSON.stringify(decoded)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(await verifyJWT(`${header}.${reencoded}.${sig}`, SECRET)).toBeNull();
  });
});

describe('cookie helpers', () => {
  it('parses a cookie header into a record', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('returns an empty object for a null header', () => {
    expect(parseCookies(null)).toEqual({});
  });

  it('makeAuthCookie sets HttpOnly, SameSite=Lax, and a 7-day Max-Age', () => {
    const cookie = makeAuthCookie('token123');
    expect(cookie).toContain('auth-token=token123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 7}`);
  });

  it('clearAuthCookie expires the cookie immediately', () => {
    expect(clearAuthCookie()).toContain('Max-Age=0');
  });
});

describe('isAllowedEmail', () => {
  it('allows @fraai.agency addresses', () => {
    expect(isAllowedEmail('sam@fraai.agency')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedEmail('Sam@Fraai.Agency')).toBe(true);
  });

  it('rejects other domains', () => {
    expect(isAllowedEmail('sam@gmail.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/utils/auth.ts` does not exist yet.

- [ ] **Step 3: Implement `src/utils/auth.ts`**

```ts
/**
 * WebCrypto-only auth utilities — zero Node.js built-ins, so this runs on
 * the Cloudflare Workers edge runtime.
 */

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(str: string): Uint8Array {
  return new Uint8Array(atob(str).split('').map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '==='.slice((str.length + 3) % 4);
  return base64ToBytes(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

function textToBase64Url(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

export interface JWTPayload {
  sub: string;
  email: string;
  name?: string | null;
  iat: number;
  exp: number;
}

const JWT_HEADER = textToBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = { ...payload, iat: now, exp: now + JWT_TTL_SECONDS };
  const body = textToBase64Url(JSON.stringify(fullPayload));
  const data = `${JWT_HEADER}.${body}`;
  const key = await hmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const data = `${header}.${body}`;
    const key = await hmacKey(secret, 'verify');
    const valid = await crypto.subtle.verify(
      'HMAC', key, base64UrlDecode(sig), new TextEncoder().encode(data),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const [k, ...v] = part.trim().split('=');
      return k ? [[k.trim(), decodeURIComponent(v.join('='))]] : [];
    }),
  );
}

export function makeAuthCookie(token: string): string {
  return `auth-token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${JWT_TTL_SECONDS}`;
}

export function clearAuthCookie(): string {
  return `auth-token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

const ALLOWED_DOMAINS = ['@fraai.agency'];

export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return ALLOWED_DOMAINS.some((d) => e.endsWith(d));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests in `test/auth.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/auth.ts test/auth.test.ts
git commit -m "Add JWT, cookie, and domain-allowlist auth utilities"
```

---

## Task 4: Google OAuth helpers

**Files:**
- Modify: `src/utils/auth.ts` (append to the file from Task 3)
- Modify: `test/auth.test.ts` (append to the file from Task 3)

**Interfaces:**
- Consumes: nothing new from earlier tasks.
- Produces: `getGoogleAuthUrl(clientId, redirectUri, state)` and `exchangeGoogleCode(code, clientId, clientSecret, redirectUri)`. Task 6 depends on both exact names and the `{ email, name }` return shape of `exchangeGoogleCode`.

- [ ] **Step 1: Write the failing tests**

Append to `test/auth.test.ts`:

```ts
import { getGoogleAuthUrl, exchangeGoogleCode } from '../src/utils/auth';
import { vi, afterEach } from 'vitest';

describe('getGoogleAuthUrl', () => {
  it('builds a Google OAuth consent URL with the given params', () => {
    const url = new URL(getGoogleAuthUrl('client-id', 'https://todo.fraai.agency/api/auth/callback', 'state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://todo.fraai.agency/api/auth/callback');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });
});

describe('exchangeGoogleCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exchanges a code for the user profile on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: 'sam@fraai.agency', name: 'Sam' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toEqual({ email: 'sam@fraai.agency', name: 'Sam' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad request', { status: 400 })));
    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toBeNull();
  });

  it('returns null when the userinfo request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangeGoogleCode('code', 'id', 'secret', 'https://todo.fraai.agency/api/auth/callback');
    expect(profile).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getGoogleAuthUrl`/`exchangeGoogleCode` are not exported yet.

- [ ] **Step 3: Append the OAuth helpers to `src/utils/auth.ts`**

```ts
export function getGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ email: string; name: string } | null> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return null;
  const { email, name } = (await userRes.json()) as { email: string; name: string };
  return { email, name };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests in `test/auth.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/auth.ts test/auth.test.ts
git commit -m "Add Google OAuth code-exchange helpers"
```

---

## Task 5: Auth middleware

**Files:**
- Create: `src/middleware.ts`
- Create: `src/env.d.ts`
- Test: `test/middleware.test.ts`

**Interfaces:**
- Consumes: `parseCookies`, `verifyJWT` from `src/utils/auth.ts` (Task 3).
- Produces: `context.locals.user: { id: number; email: string; name: string | null } | null`, set on every request. Every later page/action reads `Astro.locals.user` / `context.locals.user` with this exact shape.

- [ ] **Step 1: Declare `Locals` in `src/env.d.ts`**

```ts
/// <reference types="astro/client" />
/// <reference path="../worker-configuration.d.ts" />

declare namespace App {
  interface Locals {
    user: { id: number; email: string; name: string | null } | null;
  }
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/middleware.test.ts
import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../src/middleware';
import { signJWT, makeAuthCookie } from '../src/utils/auth';
import { env } from 'cloudflare:test';

function makeContext(url: string, cookie?: string) {
  const request = new Request(url, cookie ? { headers: { cookie } } : undefined);
  return { request, locals: {} as any, redirect: vi.fn((to: string) => new Response(null, { status: 302, headers: { Location: to } })) };
}

describe('auth middleware', () => {
  it('sets locals.user to null when there is no auth cookie', async () => {
    const context = makeContext('https://todo.fraai.agency/app/today');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(context.locals.user).toBeNull();
  });

  it('redirects unauthenticated requests to /app/* to /login', async () => {
    const context = makeContext('https://todo.fraai.agency/app/today');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(context.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('sets locals.user from a valid JWT cookie and calls next', async () => {
    const token = await signJWT({ sub: '42', email: 'sam@fraai.agency', name: 'Sam' }, env.JWT_SECRET);
    const context = makeContext('https://todo.fraai.agency/app/today', makeAuthCookie(token));
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(context.locals.user).toEqual({ id: 42, email: 'sam@fraai.agency', name: 'Sam' });
    expect(next).toHaveBeenCalled();
  });

  it('does not guard routes outside /app', async () => {
    const context = makeContext('https://todo.fraai.agency/login');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    await onRequest(context as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('sets X-Robots-Tag: noindex on every response', async () => {
    const context = makeContext('https://todo.fraai.agency/login');
    const next = vi.fn().mockResolvedValue(new Response('ok'));
    const response = await onRequest(context as any, next);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
```

- [ ] **Step 3: Add `JWT_SECRET` to the test D1/Miniflare bindings**

In `vitest.config.ts`, add a `bindings` entry so `env.JWT_SECRET` is available in tests:

```ts
      miniflare: {
        d1Databases: { DB: 'todo-fraai-agency-test' },
        bindings: { TEST_MIGRATIONS: migrations, JWT_SECRET: 'test-secret-at-least-32-characters-long' },
      },
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/middleware.ts` does not exist yet.

- [ ] **Step 5: Implement `src/middleware.ts`**

```ts
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { parseCookies, verifyJWT } from './utils/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals, redirect } = context;
  const url = new URL(request.url);

  locals.user = null;
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies['auth-token'];
  if (token) {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (payload) {
      locals.user = { id: parseInt(payload.sub, 10), email: payload.email, name: payload.name ?? null };
    }
  }

  if (url.pathname.startsWith('/app') && !locals.user) {
    return redirect('/login');
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests in `test/middleware.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add src/middleware.ts src/env.d.ts vitest.config.ts test/middleware.test.ts
git commit -m "Add JWT auth middleware guarding /app routes"
```

---

## Task 6: OAuth routes, user provisioning, login/error pages

**Files:**
- Create: `src/lib/users.ts`
- Create: `src/pages/api/auth/google.ts`
- Create: `src/pages/api/auth/callback.ts`
- Create: `src/pages/login.astro`
- Create: `src/pages/auth/error.astro`
- Modify: `src/pages/index.astro` (replace the Task 1 placeholder)
- Test: `test/users.test.ts`

**Interfaces:**
- Consumes: `getGoogleAuthUrl`, `exchangeGoogleCode`, `isAllowedEmail`, `signJWT`, `makeAuthCookie`, `parseCookies` (Tasks 3–4); `App.Locals.user` (Task 5).
- Produces: `provisionUser(db, email, name): Promise<{ id: number; email: string; name: string | null; created_at: string }>` — auto-creates the user and their `is_inbox` project. Task 11 (`AppLayout`) relies on every user having exactly one `is_inbox = 1` project.

- [ ] **Step 1: Write the failing test**

```ts
// test/users.test.ts
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { provisionUser } from '../src/lib/users';

describe('provisionUser', () => {
  it('creates a user and an Inbox project on first login', async () => {
    const user = await provisionUser(env.DB, 'sam@fraai.agency', 'Sam');
    expect(user.email).toBe('sam@fraai.agency');
    expect(user.name).toBe('Sam');

    const inbox = await env.DB.prepare('SELECT * FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(user.id).first<{ name: string }>();
    expect(inbox?.name).toBe('Inbox');
  });

  it('is idempotent: a second login updates the name but does not duplicate the user or inbox', async () => {
    const first = await provisionUser(env.DB, 'sam2@fraai.agency', 'Sam');
    const second = await provisionUser(env.DB, 'sam2@fraai.agency', 'Samuel');
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Samuel');

    const userCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?')
      .bind('sam2@fraai.agency').first<{ n: number }>();
    expect(userCount?.n).toBe(1);

    const inboxCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND is_inbox = 1')
      .bind(first.id).first<{ n: number }>();
    expect(inboxCount?.n).toBe(1);
  });

  it('lowercases the email', async () => {
    const user = await provisionUser(env.DB, 'Sam3@Fraai.Agency', null);
    expect(user.email).toBe('sam3@fraai.agency');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/lib/users.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/users.ts`**

```ts
export interface User {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
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
     WHERE NOT EXISTS (SELECT 1 FROM projects WHERE user_id = ? AND is_inbox = 1)`,
  ).bind(user.id, user.id).run();

  return user;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all tests in `test/users.test.ts` pass.

- [ ] **Step 5: Implement `src/pages/api/auth/google.ts`**

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getGoogleAuthUrl } from '../../../utils/auth';

export const GET: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const state = crypto.randomUUID();
  const url = getGoogleAuthUrl(env.AUTH_GOOGLE_ID, redirectUri, state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': `oauth-state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
};
```

- [ ] **Step 6: Implement `src/pages/api/auth/callback.ts`**

```ts
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  exchangeGoogleCode, isAllowedEmail, signJWT, makeAuthCookie, parseCookies,
} from '../../../utils/auth';
import { provisionUser } from '../../../lib/users';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('cookie'));

  if (!code || !state || state !== cookies['oauth-state']) {
    return Response.redirect(`${url.origin}/auth/error?reason=state`, 302);
  }

  const redirectUri = `${url.origin}/api/auth/callback`;
  const profile = await exchangeGoogleCode(code, env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET, redirectUri);
  if (!profile) {
    return Response.redirect(`${url.origin}/auth/error?reason=exchange`, 302);
  }
  if (!isAllowedEmail(profile.email)) {
    return Response.redirect(`${url.origin}/auth/error?reason=domain`, 302);
  }

  const user = await provisionUser(env.DB, profile.email, profile.name ?? null);
  const token = await signJWT({ sub: String(user.id), email: user.email, name: user.name }, env.JWT_SECRET);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${url.origin}/app/today`,
      'Set-Cookie': makeAuthCookie(token),
    },
  });
};
```

- [ ] **Step 7: Create `src/pages/login.astro`**

```astro
---
import '../styles/global.css';
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Sign in · Todo</title>
  </head>
  <body class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <h1 class="text-2xl font-semibold mb-6">Todo</h1>
      <a href="/api/auth/google" class="inline-block px-4 py-2 rounded bg-black text-white">
        Sign in with Google
      </a>
    </div>
  </body>
</html>
```

- [ ] **Step 8: Create `src/pages/auth/error.astro`**

```astro
---
import '../../styles/global.css';
const reason = Astro.url.searchParams.get('reason') ?? 'unknown';
const messages: Record<string, string> = {
  state: 'Sign-in expired, please try again.',
  exchange: 'Could not verify your Google account, please try again.',
  domain: 'Only @fraai.agency accounts can sign in.',
  unknown: 'Something went wrong signing you in.',
};
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Sign-in error · Todo</title>
  </head>
  <body class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center max-w-sm">
      <p class="text-red-600 mb-4">{messages[reason] ?? messages.unknown}</p>
      <a href="/login" class="underline">Back to sign in</a>
    </div>
  </body>
</html>
```

- [ ] **Step 9: Replace `src/pages/index.astro` with the auth-aware redirect**

```astro
---
return Astro.redirect(Astro.locals.user ? '/app/today' : '/login');
---
```

- [ ] **Step 10: Verify the project still builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/lib/users.ts src/pages/api/auth src/pages/login.astro src/pages/auth/error.astro src/pages/index.astro test/users.test.ts
git commit -m "Add Google OAuth routes, user provisioning, login/error pages"
```

---

## Task 7: Projects — DB functions and actions

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/validation.ts`
- Create: `src/actions/index.ts`
- Test: `test/projects.test.ts`

**Interfaces:**
- Produces: `NotFoundError`, `Project` type, `listProjects(db, userId)`, `createProject(db, userId, name)`, `renameProject(db, userId, projectId, name)`, `deleteProject(db, userId, projectId)`, `reorderProjects(db, userId, orderedIds)` in `src/lib/db.ts`; the `server` actions object in `src/actions/index.ts` with `createProject`/`renameProject`/`deleteProject`/`reorderProjects`. Tasks 8 and 9 append `Section`/`Task` types and functions to the same `db.ts`, `validation.ts`, and `actions/index.ts` files.

- [ ] **Step 1: Write the failing tests**

```ts
// test/projects.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import * as db from '../src/lib/db';

let userId: number;
let otherUserId: number;

beforeEach(async () => {
  const user = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`user-${crypto.randomUUID()}@fraai.agency`).first<{ id: number }>();
  userId = user!.id;
  const other = await env.DB.prepare('INSERT INTO users (email) VALUES (?) RETURNING *')
    .bind(`other-${crypto.randomUUID()}@fraai.agency`).first<{ id: number }>();
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/lib/db.ts` does not exist yet (also references `createSection`/`createTask`, added in Tasks 8–9; that's fine, this whole file compiles once all three tasks land — for now expect a module-not-found failure).

- [ ] **Step 3: Implement the projects portion of `src/lib/db.ts`**

```ts
// src/lib/db.ts
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
  const statements = orderedIds.map((id, index) =>
    db.prepare('UPDATE projects SET position = ? WHERE id = ? AND user_id = ? AND is_inbox = 0')
      .bind(index + 1, id, userId),
  );
  await db.batch(statements);
}
```

- [ ] **Step 4: Create `src/lib/validation.ts` with the projects schemas**

```ts
import { z } from 'zod';

export const requiredText = (message: string) => z.string().trim().min(1, message);
export const idParam = z.coerce.number().int().positive();
export const dateString = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date (YYYY-MM-DD)');

export const createProjectSchema = z.object({
  name: requiredText('Name is required'),
});
export const renameProjectSchema = z.object({
  projectId: idParam,
  name: requiredText('Name is required'),
});
export const deleteProjectSchema = z.object({ projectId: idParam });
export const reorderProjectsSchema = z.object({ orderedIds: z.array(idParam).min(1) });
```

- [ ] **Step 5: Create `src/actions/index.ts` with the projects actions**

```ts
import { defineAction, ActionError } from 'astro:actions';
import { env } from 'cloudflare:workers';
import * as db from '../lib/db';
import {
  createProjectSchema, renameProjectSchema, deleteProjectSchema, reorderProjectsSchema,
} from '../lib/validation';

function requireUser(context: { locals: App.Locals }) {
  if (!context.locals.user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  return context.locals.user;
}

async function wrapNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof db.NotFoundError) {
      throw new ActionError({ code: 'NOT_FOUND', message: err.message });
    }
    throw err;
  }
}

export const server = {
  createProject: defineAction({
    accept: 'form',
    input: createProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      return db.createProject(env.DB, user.id, input.name);
    },
  }),
  renameProject: defineAction({
    input: renameProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.renameProject(env.DB, user.id, input.projectId, input.name));
      return { success: true };
    },
  }),
  deleteProject: defineAction({
    input: deleteProjectSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.deleteProject(env.DB, user.id, input.projectId));
      return { success: true };
    },
  }),
  reorderProjects: defineAction({
    input: reorderProjectsSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await db.reorderProjects(env.DB, user.id, input.orderedIds);
      return { success: true };
    },
  }),
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests in `test/projects.test.ts` pass. (`createSection`/`createTask` calls inside this test file won't type-check/resolve until Tasks 8–9 add them — if running this task in isolation, temporarily comment out the `deleteProject`/cross-user tests' section/task setup lines, then restore them in Task 9's test run.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/validation.ts src/actions/index.ts test/projects.test.ts
git commit -m "Add project CRUD + reorder, DB functions and Astro Actions"
```

---

## Task 8: Sections — DB functions and actions

**Files:**
- Modify: `src/lib/db.ts` (append)
- Modify: `src/lib/validation.ts` (append)
- Modify: `src/actions/index.ts` (append)
- Test: `test/sections.test.ts`

**Interfaces:**
- Consumes: `NotFoundError`, `assertProjectOwned` (module-private, Task 7).
- Produces: `Section` type, `listSections(db, userId, projectId)`, `createSection(db, userId, projectId, name)`, `renameSection(db, userId, sectionId, name)`, `deleteSection(db, userId, sectionId)`, `reorderSections(db, userId, projectId, orderedIds)`; `createSection`/`renameSection`/`deleteSection`/`reorderSections` actions. Task 9's `createTask`/`updateTask` validate `sectionId` against these rows.

- [ ] **Step 1: Write the failing tests**

```ts
// test/sections.test.ts
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createSection` etc. are not exported from `src/lib/db.ts` yet.

- [ ] **Step 3: Append the sections functions to `src/lib/db.ts`**

```ts
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

export async function reorderSections(
  db: D1Database, userId: number, projectId: number, orderedIds: number[],
): Promise<void> {
  await assertProjectOwned(db, userId, projectId);
  const statements = orderedIds.map((id, index) =>
    db.prepare('UPDATE sections SET position = ? WHERE id = ? AND project_id = ?').bind(index + 1, id, projectId),
  );
  await db.batch(statements);
}
```

- [ ] **Step 4: Append the sections schemas to `src/lib/validation.ts`**

```ts
export const createSectionSchema = z.object({
  projectId: idParam,
  name: requiredText('Name is required'),
});
export const renameSectionSchema = z.object({
  sectionId: idParam,
  name: requiredText('Name is required'),
});
export const deleteSectionSchema = z.object({ sectionId: idParam });
export const reorderSectionsSchema = z.object({
  projectId: idParam,
  orderedIds: z.array(idParam).min(1),
});
```

- [ ] **Step 5: Append the sections actions to `src/actions/index.ts`**

Add the import:

```ts
import {
  createProjectSchema, renameProjectSchema, deleteProjectSchema, reorderProjectsSchema,
  createSectionSchema, renameSectionSchema, deleteSectionSchema, reorderSectionsSchema,
} from '../lib/validation';
```

Add to the `server` object (after the projects actions):

```ts
  createSection: defineAction({
    accept: 'form',
    input: createSectionSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      return wrapNotFound(() => db.createSection(env.DB, user.id, input.projectId, input.name));
    },
  }),
  renameSection: defineAction({
    input: renameSectionSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.renameSection(env.DB, user.id, input.sectionId, input.name));
      return { success: true };
    },
  }),
  deleteSection: defineAction({
    input: deleteSectionSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.deleteSection(env.DB, user.id, input.sectionId));
      return { success: true };
    },
  }),
  reorderSections: defineAction({
    input: reorderSectionsSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.reorderSections(env.DB, user.id, input.projectId, input.orderedIds));
      return { success: true };
    },
  }),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests in `test/sections.test.ts` pass (the `createTask` call inside it starts working once Task 9 lands — if running Task 8 standalone, this one test stays red until then).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/validation.ts src/actions/index.ts test/sections.test.ts
git commit -m "Add section CRUD + reorder, DB functions and Astro Actions"
```

---

## Task 9: Tasks — DB functions and actions (including subtasks)

**Files:**
- Modify: `src/lib/db.ts` (append)
- Modify: `src/lib/validation.ts` (append)
- Modify: `src/actions/index.ts` (append)
- Test: `test/tasks.test.ts`

**Interfaces:**
- Consumes: `NotFoundError`, `assertProjectOwned` (Task 7).
- Produces: `Task` type, `listTasksByProject(db, userId, projectId)`, `listOpenDatedTasks(db, userId)`, `createTask(db, userId, input)`, `updateTask(db, userId, taskId, input)`, `toggleTaskDone(db, userId, taskId)`, `deleteTask(db, userId, taskId)`, `reorderTasks(db, userId, projectId, sectionId, orderedIds)`. Task 10 (`dates.ts`) imports the `Task` type; Tasks 12–14 (pages) call `listTasksByProject`/`listOpenDatedTasks` and the actions.

- [ ] **Step 1: Write the failing tests**

```ts
// test/tasks.test.ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createTask` etc. are not exported from `src/lib/db.ts` yet.

- [ ] **Step 3: Append the tasks functions to `src/lib/db.ts`**

```ts
export interface Task {
  id: number;
  user_id: number;
  project_id: number;
  section_id: number | null;
  parent_task_id: number | null;
  title: string;
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
    const parent = await db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ? AND user_id = ?')
      .bind(input.parentTaskId, input.projectId, userId).first();
    if (!parent) throw new NotFoundError('Parent task not found');
  }

  const row = await db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE project_id = ? AND section_id IS ?',
  ).bind(input.projectId, input.sectionId ?? null).first<{ max: number }>();
  const nextPosition = (row?.max ?? 0) + 1;

  const result = await db.prepare(
    `INSERT INTO tasks (user_id, project_id, section_id, parent_task_id, title, due_date, priority, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(
    userId, input.projectId, input.sectionId ?? null, input.parentTaskId ?? null,
    input.title, input.dueDate ?? null, input.priority ?? 4, nextPosition,
  ).first<Task>();
  if (!result) throw new Error('Failed to create task');
  return result;
}

export interface UpdateTaskInput {
  title?: string;
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
  if (input.projectId != null) await assertProjectOwned(db, userId, input.projectId);
  if (input.sectionId != null) {
    const section = await db.prepare('SELECT id FROM sections WHERE id = ? AND project_id = ?')
      .bind(input.sectionId, projectId).first();
    if (!section) throw new NotFoundError('Section not found');
  }

  await db.prepare(
    `UPDATE tasks SET title = ?, due_date = ?, priority = ?, project_id = ?, section_id = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  ).bind(
    input.title ?? task.title,
    input.dueDate !== undefined ? input.dueDate : task.due_date,
    input.priority ?? task.priority,
    projectId,
    input.sectionId !== undefined ? input.sectionId : task.section_id,
    taskId, userId,
  ).run();
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

export async function reorderTasks(
  db: D1Database, userId: number, projectId: number, sectionId: number | null, orderedIds: number[],
): Promise<void> {
  await assertProjectOwned(db, userId, projectId);
  const statements = orderedIds.map((id, index) =>
    db.prepare(
      'UPDATE tasks SET section_id = ?, position = ? WHERE id = ? AND project_id = ? AND user_id = ?',
    ).bind(sectionId, index + 1, id, projectId, userId),
  );
  await db.batch(statements);
}
```

- [ ] **Step 4: Append the tasks schemas to `src/lib/validation.ts`**

```ts
export const createTaskSchema = z.object({
  projectId: idParam,
  sectionId: idParam.optional(),
  parentTaskId: idParam.optional(),
  title: requiredText('Title is required'),
  dueDate: dateString.optional(),
  priority: z.coerce.number().int().min(1).max(4).optional().default(4),
});
export const updateTaskSchema = z.object({
  taskId: idParam,
  title: requiredText('Title is required').optional(),
  dueDate: dateString.nullable().optional(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  projectId: idParam.optional(),
  sectionId: idParam.nullable().optional(),
});
export const toggleTaskDoneSchema = z.object({ taskId: idParam });
export const deleteTaskSchema = z.object({ taskId: idParam });
export const reorderTasksSchema = z.object({
  projectId: idParam,
  sectionId: idParam.nullable().optional(),
  orderedIds: z.array(idParam).min(1),
});
```

- [ ] **Step 5: Append the tasks actions to `src/actions/index.ts`**

Add to the import from `../lib/validation`:

```ts
  createTaskSchema, updateTaskSchema, toggleTaskDoneSchema, deleteTaskSchema, reorderTasksSchema,
```

Add to the `server` object:

```ts
  createTask: defineAction({
    accept: 'form',
    input: createTaskSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      return wrapNotFound(() => db.createTask(env.DB, user.id, {
        projectId: input.projectId,
        sectionId: input.sectionId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        title: input.title,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
      }));
    },
  }),
  updateTask: defineAction({
    input: updateTaskSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      const { taskId, ...rest } = input;
      await wrapNotFound(() => db.updateTask(env.DB, user.id, taskId, rest));
      return { success: true };
    },
  }),
  toggleTaskDone: defineAction({
    input: toggleTaskDoneSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.toggleTaskDone(env.DB, user.id, input.taskId));
      return { success: true };
    },
  }),
  deleteTask: defineAction({
    input: deleteTaskSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.deleteTask(env.DB, user.id, input.taskId));
      return { success: true };
    },
  }),
  reorderTasks: defineAction({
    input: reorderTasksSchema,
    handler: async (input, context) => {
      const user = requireUser(context);
      await wrapNotFound(() => db.reorderTasks(env.DB, user.id, input.projectId, input.sectionId ?? null, input.orderedIds));
      return { success: true };
    },
  }),
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including `test/projects.test.ts` and `test/sections.test.ts` cases that depend on `createTask`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/validation.ts src/actions/index.ts test/tasks.test.ts
git commit -m "Add task CRUD, subtasks, toggle-done, and reorder"
```

---

## Task 10: Date-grouping utilities (Today/Upcoming)

**Files:**
- Create: `src/lib/dates.ts`
- Test: `test/dates.test.ts`

**Interfaces:**
- Consumes: `Task` type (Task 9).
- Produces: `todayISO(date?)`, `splitOverdueAndToday(tasks, today)`, `groupUpcoming(tasks, today)`. Tasks 13–14 (Today/Upcoming pages) call all three.

- [ ] **Step 1: Write the failing tests**

```ts
// test/dates.test.ts
import { describe, expect, it } from 'vitest';
import { todayISO, splitOverdueAndToday, groupUpcoming } from '../src/lib/dates';
import type { Task } from '../src/lib/db';

function task(overrides: Partial<Task>): Task {
  return {
    id: 1, user_id: 1, project_id: 1, section_id: null, parent_task_id: null,
    title: 'Task', due_date: null, priority: 4, done_at: null, position: 1,
    created_at: '', updated_at: '', ...overrides,
  };
}

describe('todayISO', () => {
  it('formats a date as YYYY-MM-DD in the Europe/Brussels timezone', () => {
    // 2026-01-01T23:30:00Z is 2026-01-02 00:30 CET — a UTC-based "today"
    // would get this wrong, which is exactly the bug this function avoids.
    expect(todayISO(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02');
  });
});

describe('splitOverdueAndToday', () => {
  const today = '2026-06-15';
  it('splits tasks into overdue (before today) and today', () => {
    const tasks = [
      task({ id: 1, due_date: '2026-06-10' }),
      task({ id: 2, due_date: '2026-06-15' }),
      task({ id: 3, due_date: '2026-06-20' }),
      task({ id: 4, due_date: null }),
    ];
    const { overdue, today: dueToday } = splitOverdueAndToday(tasks, today);
    expect(overdue.map((t) => t.id)).toEqual([1]);
    expect(dueToday.map((t) => t.id)).toEqual([2]);
  });
});

describe('groupUpcoming', () => {
  const today = '2026-06-15';
  it('groups future tasks by due date, sorted ascending, excluding today and the past', () => {
    const tasks = [
      task({ id: 1, due_date: '2026-06-20' }),
      task({ id: 2, due_date: '2026-06-18' }),
      task({ id: 3, due_date: '2026-06-20' }),
      task({ id: 4, due_date: '2026-06-15' }),
      task({ id: 5, due_date: '2026-06-10' }),
    ];
    const groups = groupUpcoming(tasks, today);
    expect(groups.map((g) => g.date)).toEqual(['2026-06-18', '2026-06-20']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `src/lib/dates.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/dates.ts`**

```ts
import type { Task } from './db';

// Uses the fixed Europe/Brussels timezone rather than the Worker's UTC
// clock, so "today" matches what a Belgium-based user actually sees, even
// right after midnight UTC.
export function todayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(date);
}

export interface TodayGroups {
  overdue: Task[];
  today: Task[];
}

export function splitOverdueAndToday(tasks: Task[], today: string): TodayGroups {
  return {
    overdue: tasks.filter((t) => t.due_date !== null && t.due_date < today),
    today: tasks.filter((t) => t.due_date === today),
  };
}

export interface UpcomingGroup {
  date: string;
  tasks: Task[];
}

export function groupUpcoming(tasks: Task[], today: string): UpcomingGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.due_date === null || task.due_date <= today) continue;
    const group = byDate.get(task.due_date);
    if (group) group.push(task);
    else byDate.set(task.due_date, [task]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateTasks]) => ({ date, tasks: dateTasks }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests in `test/dates.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts test/dates.test.ts
git commit -m "Add Today/Upcoming date-grouping utilities"
```

---

## Task 11: App layout and sidebar

**Files:**
- Create: `src/layouts/AppLayout.astro`
- Create: `src/scripts/sidebar.ts`

**Interfaces:**
- Consumes: `listProjects` (Task 7), `App.Locals.user` (Task 5), the `reorderProjects`/`deleteProject` actions (Task 7).
- Produces: `AppLayout` — every `/app/*` page (Tasks 12–14) wraps its content in `<AppLayout title="...">`.

- [ ] **Step 1: Create `src/layouts/AppLayout.astro`**

```astro
---
import '../styles/global.css';
import { actions } from 'astro:actions';
import { env } from 'cloudflare:workers';
import { listProjects } from '../lib/db';

interface Props {
  title: string;
}
const { title } = Astro.props;
const user = Astro.locals.user!;
const projects = await listProjects(env.DB, user.id);
const inbox = projects.find((p) => p.is_inbox === 1)!;
const otherProjects = projects.filter((p) => p.is_inbox === 0);
const path = Astro.url.pathname;
const isActive = (href: string) => path === href;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>{title} · Todo</title>
  </head>
  <body class="flex min-h-screen bg-gray-50 text-gray-900">
    <aside class="w-64 shrink-0 border-r border-gray-200 p-4 flex flex-col gap-1">
      <div class="font-semibold mb-4">Todo</div>
      <a href="/app/today" class={`px-2 py-1 rounded ${isActive('/app/today') ? 'bg-gray-200' : ''}`}>Today</a>
      <a href="/app/upcoming" class={`px-2 py-1 rounded ${isActive('/app/upcoming') ? 'bg-gray-200' : ''}`}>Upcoming</a>
      <a
        href={`/app/projects/${inbox.id}`}
        class={`px-2 py-1 rounded ${isActive(`/app/projects/${inbox.id}`) ? 'bg-gray-200' : ''}`}
      >
        Inbox
      </a>
      <div class="mt-4 text-xs uppercase text-gray-500">Projects</div>
      <ul id="project-list" class="flex flex-col gap-1">
        {otherProjects.map((project) => (
          <li data-project-id={project.id} class="flex items-center gap-1 group">
            <a
              href={`/app/projects/${project.id}`}
              class={`flex-1 block px-2 py-1 rounded ${isActive(`/app/projects/${project.id}`) ? 'bg-gray-200' : ''}`}
            >
              {project.name}
            </a>
            <button
              class="project-delete text-xs text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 px-1"
              data-project-id={project.id}
              title="Delete project"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
      <form method="POST" action={actions.createProject} class="mt-2">
        <input name="name" placeholder="New project" class="w-full text-sm border rounded px-2 py-1" required />
      </form>
    </aside>
    <main class="flex-1 p-6">
      <slot />
    </main>
  </body>
</html>
<script src="../scripts/sidebar.ts"></script>
```

- [ ] **Step 2: Create `src/scripts/sidebar.ts`**

```ts
import Sortable from 'sortablejs';
import { actions } from 'astro:actions';

const list = document.getElementById('project-list');
if (list) {
  new Sortable(list, {
    animation: 150,
    onEnd: async () => {
      const orderedIds = [...list.children].map((el) => Number((el as HTMLElement).dataset.projectId));
      await actions.reorderProjects({ orderedIds });
    },
  });
}

document.querySelectorAll<HTMLButtonElement>('.project-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this project and all its tasks?')) return;
    const projectId = Number(button.dataset.projectId);
    await actions.deleteProject({ projectId });
    location.href = '/app/today';
  });
});
```

- [ ] **Step 3: Verify the project still builds**

Run: `npm run build`
Expected: succeeds (no page uses `AppLayout` yet, but it must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add src/layouts/AppLayout.astro src/scripts/sidebar.ts
git commit -m "Add app shell layout with sidebar and drag-to-reorder projects"
```

---

## Task 12: Project view page (sections, tasks, subtasks, drag-and-drop)

**Files:**
- Create: `src/pages/app/projects/[id].astro`
- Create: `src/scripts/task-toggle.ts`
- Create: `src/scripts/task-list.ts`

**Interfaces:**
- Consumes: `listSections`, `listTasksByProject`, `listProjects` (Task 7–9); `createTask`, `createSection`, `deleteSection`, `toggleTaskDone`, `deleteTask`, `reorderTasks` actions (Tasks 8–9); `AppLayout` (Task 11).
- Produces: `attachTaskToggles()` from `task-toggle.ts`, reused by Tasks 13–14.

- [ ] **Step 1: Create `src/scripts/task-toggle.ts`**

```ts
import { actions } from 'astro:actions';

export function attachTaskToggles(): void {
  document.querySelectorAll<HTMLInputElement>('.task-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const taskId = Number(checkbox.dataset.taskId);
      await actions.toggleTaskDone({ taskId });
      location.reload();
    });
  });
}

attachTaskToggles();
```

- [ ] **Step 2: Create `src/scripts/task-list.ts`**

```ts
import Sortable from 'sortablejs';
import { actions } from 'astro:actions';
import { attachTaskToggles } from './task-toggle';

attachTaskToggles();

document.querySelectorAll<HTMLButtonElement>('.task-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    const taskId = Number(button.dataset.taskId);
    await actions.deleteTask({ taskId });
    location.reload();
  });
});

document.querySelectorAll<HTMLButtonElement>('.section-delete').forEach((button) => {
  button.addEventListener('click', async () => {
    if (!confirm('Delete this section? Its tasks move to the project\'s unsectioned list.')) return;
    const sectionId = Number(button.dataset.sectionId);
    await actions.deleteSection({ sectionId });
    location.reload();
  });
});

const root = document.querySelector<HTMLElement>('[data-project-id]');
const projectId = root ? Number(root.dataset.projectId) : null;

if (projectId !== null) {
  document.querySelectorAll<HTMLElement>('.task-list').forEach((list) => {
    new Sortable(list, {
      group: 'tasks',
      animation: 150,
      onEnd: async (event) => {
        const target = event.to;
        const sectionIdRaw = target.dataset.sectionId;
        const sectionId = sectionIdRaw ? Number(sectionIdRaw) : null;
        const orderedIds = [...target.children].map((el) => Number((el as HTMLElement).dataset.taskId));
        await actions.reorderTasks({ projectId, sectionId, orderedIds });
        location.reload();
      },
    });
  });
}
```

- [ ] **Step 3: Create `src/pages/app/projects/[id].astro`**

```astro
---
import AppLayout from '../../../layouts/AppLayout.astro';
import { actions } from 'astro:actions';
import { env } from 'cloudflare:workers';
import * as db from '../../../lib/db';

const user = Astro.locals.user!;
const projectId = Number(Astro.params.id);
if (!Number.isInteger(projectId)) return Astro.redirect('/app/today');

const projects = await db.listProjects(env.DB, user.id);
const project = projects.find((p) => p.id === projectId);
if (!project) return Astro.redirect('/app/today');

const [sections, tasks] = await Promise.all([
  db.listSections(env.DB, user.id, projectId),
  db.listTasksByProject(env.DB, user.id, projectId),
]);

const topLevel = tasks.filter((t) => t.parent_task_id === null);
const subtasksByParent = new Map<number, typeof tasks>();
for (const t of tasks) {
  if (t.parent_task_id === null) continue;
  const list = subtasksByParent.get(t.parent_task_id) ?? [];
  list.push(t);
  subtasksByParent.set(t.parent_task_id, list);
}

const sectionGroups = [
  { id: null as number | null, name: null as string | null, tasks: topLevel.filter((t) => t.section_id === null) },
  ...sections.map((s) => ({ id: s.id, name: s.name, tasks: topLevel.filter((t) => t.section_id === s.id) })),
];
---
<AppLayout title={project.name}>
  <div data-project-id={projectId}>
    <h1 class="text-xl font-semibold mb-4">{project.name}</h1>

    {sectionGroups.map((group) => (
      <section class="mb-6">
        {group.name && (
          <h2 class="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
            {group.name}
            <button class="section-delete text-xs text-gray-400 hover:text-red-500" data-section-id={group.id}>
              &times;
            </button>
          </h2>
        )}
        <ul class="task-list flex flex-col gap-1" data-section-id={group.id ?? ''}>
          {group.tasks.map((task) => (
            <li data-task-id={task.id} class="border rounded p-2">
              <div class="flex items-center gap-2">
                <input type="checkbox" class="task-toggle" data-task-id={task.id} checked={task.done_at !== null} />
                <span class={task.done_at ? 'line-through text-gray-400' : ''}>{task.title}</span>
                {task.due_date && <span class="text-xs text-gray-500">{task.due_date}</span>}
                <span class="text-xs text-gray-400">P{task.priority}</span>
                <button class="task-delete text-xs text-red-500" data-task-id={task.id}>Delete</button>
              </div>
              {(subtasksByParent.get(task.id) ?? []).length > 0 && (
                <ul class="ml-6 mt-1 flex flex-col gap-1">
                  {(subtasksByParent.get(task.id) ?? []).map((sub) => (
                    <li class="flex items-center gap-2 text-sm">
                      <input type="checkbox" class="task-toggle" data-task-id={sub.id} checked={sub.done_at !== null} />
                      <span class={sub.done_at ? 'line-through text-gray-400' : ''}>{sub.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <form method="POST" action={actions.createTask} class="ml-6 mt-1">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="parentTaskId" value={task.id} />
                <input name="title" placeholder="Add subtask" class="text-xs border rounded px-1" />
              </form>
            </li>
          ))}
        </ul>
        <form method="POST" action={actions.createTask} class="mt-2 flex gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          {group.id !== null && <input type="hidden" name="sectionId" value={group.id} />}
          <input name="title" placeholder="Add task" class="text-sm border rounded px-2 py-1 flex-1" required />
        </form>
      </section>
    ))}

    <form method="POST" action={actions.createSection} class="mt-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="name" placeholder="Add section" class="text-sm border rounded px-2 py-1" required />
    </form>
  </div>
</AppLayout>
<script src="../../../scripts/task-list.ts"></script>
```

Full-page reload after every mutation (`location.reload()` in the client scripts) is a deliberate simplification for the MVP — it avoids building client-side state reconciliation. Revisit if the reload becomes noticeably slow or jarring in daily use.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, then in a browser: sign in (needs real Google OAuth credentials in `.dev.vars` — see Task 15's README), open the Inbox project, add a section, add a task, add a subtask, toggle a task done, drag-reorder tasks within and across sections, delete a task, delete a section (confirm its remaining tasks become unsectioned, not deleted). Confirm each action persists across a page reload.

- [ ] **Step 5: Verify the project builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/pages/app/projects src/scripts/task-toggle.ts src/scripts/task-list.ts
git commit -m "Add project view: sections, tasks, subtasks, drag-and-drop"
```

---

## Task 13: Today view

**Files:**
- Create: `src/pages/app/today.astro`

**Interfaces:**
- Consumes: `listOpenDatedTasks` (Task 9), `todayISO`/`splitOverdueAndToday` (Task 10), `attachTaskToggles` via `task-toggle.ts` (Task 12), `AppLayout` (Task 11).

- [ ] **Step 1: Create `src/pages/app/today.astro`**

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import { env } from 'cloudflare:workers';
import { listOpenDatedTasks } from '../../lib/db';
import { todayISO, splitOverdueAndToday } from '../../lib/dates';

const user = Astro.locals.user!;
const tasks = await listOpenDatedTasks(env.DB, user.id);
const today = todayISO();
const { overdue, today: dueToday } = splitOverdueAndToday(tasks, today);
---
<AppLayout title="Today">
  <h1 class="text-xl font-semibold mb-4">Today</h1>

  {overdue.length > 0 && (
    <section class="mb-6">
      <h2 class="text-sm font-medium text-red-600 mb-2">Overdue</h2>
      <ul class="flex flex-col gap-1">
        {overdue.map((task) => (
          <li class="border rounded p-2 flex items-center gap-2">
            <input type="checkbox" class="task-toggle" data-task-id={task.id} />
            <span>{task.title}</span>
            <span class="text-xs text-gray-500">{task.due_date}</span>
          </li>
        ))}
      </ul>
    </section>
  )}

  <section>
    <h2 class="text-sm font-medium text-gray-500 mb-2">Today</h2>
    {dueToday.length === 0 && <p class="text-gray-500 text-sm">Nothing due today.</p>}
    <ul class="flex flex-col gap-1">
      {dueToday.map((task) => (
        <li class="border rounded p-2 flex items-center gap-2">
          <input type="checkbox" class="task-toggle" data-task-id={task.id} />
          <span>{task.title}</span>
        </li>
      ))}
    </ul>
  </section>
</AppLayout>
<script src="../../scripts/task-toggle.ts"></script>
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in, create tasks with a past due date and today's due date across different projects, confirm they appear under Overdue/Today respectively and checking them off removes them on reload.

- [ ] **Step 4: Commit**

```bash
git add src/pages/app/today.astro
git commit -m "Add Today view"
```

---

## Task 14: Upcoming view

**Files:**
- Create: `src/pages/app/upcoming.astro`

**Interfaces:**
- Consumes: `listOpenDatedTasks` (Task 9), `todayISO`/`groupUpcoming` (Task 10), `task-toggle.ts` (Task 12), `AppLayout` (Task 11).

- [ ] **Step 1: Create `src/pages/app/upcoming.astro`**

```astro
---
import AppLayout from '../../layouts/AppLayout.astro';
import { env } from 'cloudflare:workers';
import { listOpenDatedTasks } from '../../lib/db';
import { todayISO, groupUpcoming } from '../../lib/dates';

const user = Astro.locals.user!;
const tasks = await listOpenDatedTasks(env.DB, user.id);
const today = todayISO();
const groups = groupUpcoming(tasks, today);
---
<AppLayout title="Upcoming">
  <h1 class="text-xl font-semibold mb-4">Upcoming</h1>
  {groups.length === 0 && <p class="text-gray-500">No upcoming tasks.</p>}
  {groups.map((group) => (
    <section class="mb-6">
      <h2 class="text-sm font-medium text-gray-500 mb-2">{group.date}</h2>
      <ul class="flex flex-col gap-1">
        {group.tasks.map((task) => (
          <li class="border rounded p-2 flex items-center gap-2">
            <input type="checkbox" class="task-toggle" data-task-id={task.id} />
            <span>{task.title}</span>
          </li>
        ))}
      </ul>
    </section>
  ))}
</AppLayout>
<script src="../../scripts/task-toggle.ts"></script>
```

- [ ] **Step 2: Verify the project builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in, create tasks with several distinct future due dates, confirm they're grouped under the right date headings in ascending order.

- [ ] **Step 4: Commit**

```bash
git add src/pages/app/upcoming.astro
git commit -m "Add Upcoming view"
```

---

## Task 15: Docs and final verification

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

**Interfaces:**
- Produces: nothing consumed by other tasks — this is documentation plus an end-to-end sanity check that every prior task's pieces fit together.

- [ ] **Step 1: Create `CLAUDE.md`**

```markdown
# CLAUDE.md — todo.fraai.agency

Internal Todoist alternative for the fraai.agency team. Astro SSR on Cloudflare Workers + D1.

## What this app is

- **Internal only** — no public registration.
- **Google SSO** — `@fraai.agency` accounts only. Non-allowed domains are rejected at `/api/auth/callback` with a redirect to `/auth/error?reason=domain`.
- **Personal, per-user data** — every user has their own projects/sections/tasks. No sharing, no assignment, no cross-user visibility. Every user gets an auto-created, un-renameable, un-deletable "Inbox" project on first login.
- **Desktop-only MVP**, English UI, due dates only (no time-of-day), no recurring tasks, no labels.

## Required secrets

| Secret | Purpose |
|---|---|
| `JWT_SECRET` | HS256 JWT signing (min 32 chars) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

Local: put these in `.dev.vars` (gitignored, see `.env.example` for the variable names). Production: `npx wrangler secret put <NAME>`.

## Google OAuth setup

In Google Cloud Console, create an OAuth 2.0 Web Application credential with these authorized redirect URIs:
- `https://todo.fraai.agency/api/auth/callback`
- `http://localhost:4321/api/auth/callback`

## DB binding

`DB` — Cloudflare D1, bound in `wrangler.toml`. Apply migrations: `npm run db:migrate:local` (add `:remote` for production).

## Dev commands

```bash
npm run dev       # Astro dev server on http://localhost:4321
npm run build     # Production build
npm test          # Vitest unit + DB tests (local D1, no Cloudflare account needed)
npx wrangler dev  # Preview against a Cloudflare Worker runtime locally
npm run deploy    # Build and deploy to Cloudflare
```

## Key files

- `src/middleware.ts` — JWT verification, route guard for `/app/*`
- `src/utils/auth.ts` — Google OAuth helpers, JWT sign/verify, domain allowlist
- `src/lib/users.ts` — user + inbox-project auto-provisioning on login
- `src/lib/db.ts` — all project/section/task queries, scoped to the acting user
- `src/lib/dates.ts` — Today/Upcoming date-grouping (Europe/Brussels timezone)
- `src/actions/index.ts` — all mutations (Astro Actions)
- `src/pages/app/` — Today, Upcoming, and per-project views
- `migrations/0001_init.sql` — D1 schema

## What was intentionally left out of the MVP

Recurring tasks, labels/tags, mobile layout, due times, multi-user sharing/assignment, roles.
```

- [ ] **Step 2: Create `README.md`**

```markdown
# todo.fraai.agency

Internal Todoist alternative for the fraai.agency team.

## Setup

```bash
npm install
cp .env.example .dev.vars   # fill in real values, see CLAUDE.md
npm run db:migrate:local
npm run dev
```

See `CLAUDE.md` for architecture, required secrets, and Google OAuth setup.
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: every test across all `test/*.test.ts` files passes.

- [ ] **Step 4: Run a full production build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "Add project documentation"
```
