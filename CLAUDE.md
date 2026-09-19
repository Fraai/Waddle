# CLAUDE.md — todo.fraai.agency

Internal Todoist alternative for the fraai.agency team. Astro SSR on Cloudflare Workers + D1.

## What this app is

- **Internal only** — no public registration.
- **Google SSO** — `@fraai.agency` accounts only. Non-allowed domains are rejected at `/api/auth/callback` with a redirect to `/auth/error?reason=domain`.
- **Personal, per-user data** — every user has their own projects/sections/tasks. No sharing, no assignment, no cross-user visibility. Every user gets an auto-created, un-renameable, un-deletable "Inbox" project on first login.
- **Responsive down to phone width** — sidebar collapses into a hamburger-triggered drawer below 768px (CSS-only, via a `peer`-checked checkbox in `AppLayout.astro`; no JS). At 768px+, the sidebar can also be manually collapsed (⌘B, or the toggle buttons) — a separate, JS/localStorage-backed preference (`sidebar.ts` + the `data-sidebar-collapsed` attribute set on `<html>`), independent of the mobile drawer. English UI, due dates only (no time-of-day), no recurring tasks, no labels.
- **Every project is "private" or "work"** (`projects.type`, defaults to `work`) — toggled via the badge next to a project's name in the sidebar, including the Inbox. A sidebar segmented control (All/Work/Private) filters everything by it: Today, Upcoming, and Week hide non-matching tasks, and the sidebar hides non-matching projects. Also a JS/localStorage preference (`data-task-filter` on `<html>`), same mechanism as the sidebar collapse. Project pages are *not* filtered — visiting one directly always shows its own tasks regardless of the ambient filter.
- **Project URLs are slugs** (`/app/projects/fitness`, not `/app/projects/7`) — derived from the name on every request by `lib/slug.ts`, not stored. A rename changes the URL immediately; an old link 404s into the same "not found" → redirect-to-Today fallback the project page already had for a bad id, rather than erroring. Same-named projects get a `-2`/`-3` suffix, assigned by id (creation order) so a drag-reorder can't shift which project owns a bare slug.
- **Project colours** — a fixed 8-swatch palette (`PROJECT_COLORS` in `lib/validation.ts`, kept in sync by hand with the copy in `scripts/sidebar.ts`, same as the existing `projectHue()` duplication). Click the sidebar dot to cycle through it; unset projects keep the old hue-based default colour.
- **Finished tasks leave the project view** — a project page only lists open tasks by default; done top-level (not sub-) tasks move into a "Completed" `<details>` disclosure at the bottom on next load. Subtasks still just strike through in place, like before.

## Required secrets

| Secret | Purpose |
|---|---|
| `JWT_SECRET` | HS256 JWT signing (min 32 chars) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `MCP_TOKEN` | Bearer token for `/api/mcp` — optional, leave unset to disable it |
| `MCP_USER_EMAIL` | Which existing user `MCP_TOKEN` authenticates as — optional, required if `MCP_TOKEN` is set |

Local: put these in `.dev.vars` (gitignored, see `.env.example` for the variable names). Production: `npx wrangler secret put <NAME>`.

## MCP server

`/api/mcp` (`src/pages/api/mcp.ts`) exposes the app to any MCP client (Claude Code, Claude Desktop, Claude.ai custom connectors) as tools: `list_projects`, `list_today`, `list_upcoming`, `list_project_tasks`, `create_project`, `create_task`, `toggle_task_done`, `delete_task`. Built on `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` in stateless mode (fresh `McpServer` per request — no session state, since every tool call re-authenticates and re-queries D1 anyway).

Auth is a single Bearer token (`MCP_TOKEN`) mapped to one account (`MCP_USER_EMAIL`) — this is personal automation, not multi-tenant, so the same token in two different Claude installs just authenticates as that one person both times. Not OAuth; if this ever needs to serve multiple people with their own logins, that's the upgrade path. `MCP_USER_EMAIL` must already exist (sign in via the browser once first) — the endpoint resolves an existing user (`getUserByEmail`), it never provisions one.

Client config (Claude Code / Desktop, `~/.claude.json` or the app's MCP settings):
```json
{
  "mcpServers": {
    "todo-fraai-agency": {
      "url": "https://todo.fraai.agency/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

## Google OAuth setup

In Google Cloud Console, create an OAuth 2.0 Web Application credential with these authorized redirect URIs:
- `https://todo.fraai.agency/api/auth/callback`
- `http://localhost:4321/api/auth/callback`

## DB binding

`DB` — Cloudflare D1, bound in `wrangler.toml`. Apply migrations: `npm run db:migrate:local` (add `:remote` for production — remember to run this against production *before* deploying a migration that ships new code depending on it). `wrangler.toml`'s `database_id` points at the real, already-created `todo-fraai-agency` database.

## Dev commands

```bash
npm run dev       # Astro dev server on http://localhost:4321
npm run build     # Production build
npm test          # Vitest unit + DB tests (local D1, no Cloudflare account needed)
npx wrangler dev  # Preview against a Cloudflare Worker runtime locally
npm run deploy    # Build and deploy to Cloudflare
```

## Key files

- `src/middleware.ts` — JWT verification, route guard for `/app/*`, security response headers (CSP with a per-request nonce, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`)
- `src/utils/auth.ts` — Google OAuth helpers, JWT sign/verify, domain allowlist
- `src/lib/users.ts` — user + inbox-project auto-provisioning on login
- `src/lib/db.ts` — all project/section/task queries, scoped to the acting user
- `src/lib/dates.ts` — Today/Upcoming date-grouping (Europe/Brussels timezone)
- `src/lib/slug.ts` — derives a project's URL slug from its name (not persisted — see "Project URLs" above)
- `src/actions/index.ts` — all mutations (Astro Actions)
- `src/pages/app/` — Today, Upcoming, Week, and per-project views (`projects/[slug].astro`)
- `src/pages/api/mcp.ts` — MCP server (see "MCP server" above)
- `migrations/` — D1 schema (`0001_init.sql` base schema, `0002_unique_inbox_per_user.sql` adds the one-inbox-per-user constraint, `0003_add_task_description_href.sql` adds `tasks.description`/`tasks.href` edited via the task detail modal, `0004_add_project_type.sql` adds `projects.type` — see `src/scripts/task-edit.ts` and `src/scripts/sidebar.ts`)

## What was intentionally left out of the MVP

Recurring tasks, labels/tags, due times, multi-user sharing/assignment, roles.
