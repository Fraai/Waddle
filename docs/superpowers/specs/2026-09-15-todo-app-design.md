# todo.fraai.agency — design

Internal Todoist alternative for the fraai.agency team. Astro SSR on Cloudflare
Workers + D1. Desktop-only MVP, English UI.

## What this app is

- **Internal only** — no public registration. Google SSO, `@fraai.agency`
  accounts only.
- **Personal, per-user data** — each user has their own projects and tasks.
  No sharing, no assignment, no cross-user visibility.
- **Multiple projects per user**, each with optional sections, tasks, and
  one level of subtasks.

## Out of scope for MVP

- Recurring tasks
- Labels/tags
- Mobile layout
- Due *times* — due dates are date-only (`YYYY-MM-DD`), no time-of-day
- Sharing/assignment/collaboration of any kind

## Stack

Same conventions as the other fraai.agency internal tools
([crm.fraai.agency](../../../../crm.fraai.agency), [flow.fraai.agency](../../../../flow.fraai.agency)):

- Astro (SSR, `@astrojs/cloudflare` adapter)
- Cloudflare Workers + D1, `wrangler.toml`, migrations in `migrations/`
- Tailwind CSS v4
- Astro Actions (`astro:actions`) for all mutations — no hand-rolled JSON API
  routes except the OAuth endpoints, which must be plain `APIRoute`s to
  handle redirects
- `sortablejs` for drag-and-drop reordering
- Vitest for tests

## Auth

Port `flow.fraai.agency`'s `src/utils/auth.ts` (WebCrypto HS256 JWT +
Google OAuth code exchange) with one change: `ALLOWED_DOMAINS = ['@fraai.agency']`
only (no `@stedof.be`).

- `GET /api/auth/google` — redirects to Google's OAuth consent screen,
  sets a short-lived `oauth-state` cookie.
- `GET /api/auth/callback` — exchanges the code, verifies the state cookie,
  rejects non-`@fraai.agency` emails to `/auth/error?reason=domain`,
  upserts the user, signs a JWT, sets it as an httpOnly `auth-token` cookie,
  redirects to `/app/today`.
- `src/middleware.ts` — verifies the JWT cookie on every request, sets
  `context.locals.user`. Unauthenticated requests to `/app/*` redirect to
  `/login`. Sets `X-Robots-Tag: noindex, nofollow` on every response (internal
  tool, never indexed).

Secrets (`.dev.vars` locally, `wrangler secret put` in production):
`JWT_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.

No roles, no organizations — every user only ever touches their own rows.

## Data model

```sql
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

Notes:

- `is_inbox` marks the one project every user gets auto-created on first
  login (name "Inbox", can't be renamed/deleted). This means `project_id`
  on `tasks` is never null — no "no project" special-casing in queries or UI.
- Priority follows the Todoist convention: `1` = highest (shown red) ...
  `4` = none (default, shown as no flag).
- `parent_task_id` self-references `tasks`. The DB allows arbitrary nesting
  depth, but the UI only ever offers "add subtask" on top-level tasks and
  never on a subtask itself, so nesting never goes past one level in
  practice — no CHECK constraint needed for a state the UI can't produce.
- `position` is a plain integer, rewritten 1..n across the affected list
  (all tasks in one section, or all sections in one project) on every
  drag-and-drop drop — see Ordering below. New rows are appended at the
  end of their list on creation (`position` = current max + 1).

## Views / routes

All under `/app`, guarded by middleware:

- `/app/today` — open tasks (across all projects) with `due_date` <= today,
  overdue first
- `/app/upcoming` — open tasks with a future `due_date`, grouped by date
- `/app/projects/:id` — one project's sections and tasks (inbox is just a
  project id, no separate route)

Sidebar (shared layout) lists all projects by `position`, inbox pinned first.

Non-`/app` routes: `/login` (Google sign-in button), `/auth/error`,
`/api/auth/google`, `/api/auth/callback`.

Rendering: server-rendered Astro pages, small vanilla-JS islands for
interactivity (checkbox toggle, quick-add input, drag-and-drop) — same
pattern as crm/flow. No SPA framework.

## Actions (`src/actions/index.ts`)

- `createProject`, `renameProject`, `deleteProject` (refuses on `is_inbox`),
  `reorderProjects`
- `createSection`, `renameSection`, `deleteSection`, `reorderSections`
- `createTask` (title, project_id, section_id?, parent_task_id?, due_date?,
  priority?), `updateTask` (title/due_date/priority/project_id/section_id),
  `toggleTaskDone`, `deleteTask`, `reorderTasks`

All actions read `context.locals.user` for the owner id and scope every
query to it — no action ever takes a `user_id` param from the client.

`reorderTasks` / `reorderSections` / `reorderProjects` take the full ordered
list of ids for the affected list (section, project, or the whole sidebar)
and rewrite `position` 1..n in one transaction, mirroring crm's
`sortablejs` `onEnd` → full-list-POST pattern (see
`crm.fraai.agency/src/scripts/kanban.ts`).

## Error handling

- OAuth failures (bad state, exchange failure, disallowed domain) redirect
  to `/auth/error?reason=...`, same as flow.fraai.agency.
- Actions validate input with Zod (already a dependency in crm) and return
  Astro Action errors on invalid input; the client shows them inline.
- A task/project/section mutation for an id the current user doesn't own
  is treated as not-found (404), never a 403 — don't leak existence.

## Testing

Vitest, matching crm/flow/intake:

- `middleware.test.ts` — JWT verification, redirect-when-unauthenticated
- Date-grouping logic for Today/Upcoming (timezone edge cases around
  "today")
- `reorderTasks`/`reorderSections`/`reorderProjects` position-rewrite logic
- Domain allowlist rejection in the OAuth callback
