# CLAUDE.md — todo.fraai.agency

Internal Todoist alternative for the Fraai Agency team. Astro SSR on Cloudflare Workers + D1.

## What this app is

- **Internal only** — no public registration.
- **Google SSO** — `@fraai.agency` accounts only. Non-allowed domains are rejected at `/api/auth/callback` with a redirect to `/auth/error?reason=domain`.
- **Personal, per-user data** — every user has their own projects/sections/tasks. No sharing, no assignment, no cross-user visibility. Every user gets an auto-created, un-renameable, un-deletable "Inbox" project on first login.
- **Responsive down to phone width** — sidebar collapses into a hamburger-triggered drawer below 768px (CSS-only, via a `peer`-checked checkbox in `AppLayout.astro`; no JS). At 768px+, the sidebar can also be manually collapsed (⌘B, or the toggle buttons) — a separate, JS/localStorage-backed preference (`sidebar.ts` + the `data-sidebar-collapsed` attribute set on `<html>`), independent of the mobile drawer. English UI, no labels.
- **Every project is "private" or "work"** (`projects.type`, defaults to `work`) — toggled via the badge next to a project's name in the sidebar. The Inbox is exempt (no badge, `setProjectType` rejects it like rename/delete already did) — it's the catch-all, not a private/work project, so it and its tasks always show regardless of the filter. A sidebar segmented control (All/Work/Private) filters everything else by it: Today, Upcoming, and Week hide non-matching tasks, and the sidebar hides non-matching projects. Also a JS/localStorage preference (`data-task-filter` on `<html>`), same mechanism as the sidebar collapse. Project pages are *not* filtered — visiting one directly always shows its own tasks regardless of the ambient filter.
- **Project URLs are slugs** (`/app/projects/fitness`, not `/app/projects/7`) — derived from the name on every request by `lib/slug.ts`, not stored. A rename changes the URL immediately; an old link 404s into the same "not found" → redirect-to-Today fallback the project page already had for a bad id, rather than erroring. Same-named projects get a `-2`/`-3` suffix, assigned by id (creation order) so a drag-reorder can't shift which project owns a bare slug.
- **Project colours** — a fixed 64-swatch palette (`PROJECT_COLORS` in `lib/validation.ts`, kept in sync by hand with the copy in `scripts/sidebar.ts`, same as the existing `projectHue()` duplication). Click the sidebar dot to open a swatch-grid popover; unset projects keep the old hue-based default colour.
- **Finished tasks leave the project view** — a project page only lists open tasks by default; done top-level (not sub-) tasks move into a "Completed" `<details>` disclosure at the bottom on next load. Subtasks still just strike through in place, like before.
- **Recurring tasks** — simple interval repeat, no separate recurring-series concept (`lib/repeat.ts`). A task's `repeat_rule` (`"daily"` / `"weekly"` / `"monthly"` / `"every:N:days"`, editable only from the task detail modal) is copied onto a brand-new task created when you complete the current one — completing, deleting, or editing one occurrence never touches any other. A repeat rule with no due date is inert (nothing to roll the date forward from), so it just completes normally. `toggleTaskDone` returns whether it spawned one; the client reloads in that case rather than trying to work out where the new occurrence belongs in whatever list is on screen.
- **Installable as a home-screen/dock app** — `public/manifest.json` + `public/icon*.png` (cropped/resized from `brand-assets/branding.jpeg`, the source brand photo — kept out of `public/` so it isn't deployed as dead weight; regenerate with Pillow if it ever changes, `sips` can resize but not re-crop precisely), linked from both `AppLayout.astro` and `login.astro`'s `<head>` (no shared layout between them, so the tags are duplicated by hand). No service worker — this is an always-online internal tool, so it's install-for-appearance only (own icon, no browser chrome), not offline support.
- **Brand colour is `#f6a80a`** (an amber/orange) — `--accent` in `global.css`. Raw, it's only ~2:1 contrast against white, which fails WCAG for text/icons/outlines, so there's a second token, `--accent-ink` (`#946505` in light mode, same as `--accent` in dark mode where the raw colour already clears 9:1 against the dark background) for anything drawn *on* a light surface. Rule of thumb: solid fills (button backgrounds, the app icon) use `--accent`; text, borders, outlines, and icons use `--accent-ink`. `.btn--primary` uses dark text (`#1d1d1f`), not white, for the same contrast reason.

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

`/api/mcp` (`src/pages/api/mcp.ts`) exposes the app to any MCP client (Claude Code, Claude Desktop, Claude.ai custom connectors) as tools: `list_projects`, `list_today`, `list_upcoming`, `list_project_tasks`, `create_project`, `create_section`, `create_task` (takes an optional `repeatRule`), `toggle_task_done` (returns `nextOccurrenceCreated`), `delete_task`. Built on `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` in stateless mode (fresh `McpServer` per request — no session state, since every tool call re-authenticates and re-queries D1 anyway).

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
- `src/layouts/AppLayout.astro` — the sidebar shell every `/app/*` page renders into. Takes an optional `projects` prop — every current page already fetches its own project list for its own rendering, so it passes that straight through instead of making AppLayout query D1 a second time for the same rows. A new page should do the same (pass `projects={projects}`) rather than let AppLayout fall back to fetching it itself.
- `src/utils/auth.ts` — Google OAuth helpers, JWT sign/verify, domain allowlist
- `src/lib/users.ts` — user + inbox-project auto-provisioning on login
- `src/lib/db.ts` — all project/section/task queries, scoped to the acting user
- `src/lib/dates.ts` — Today/Upcoming date-grouping (Europe/Brussels timezone)
- `src/lib/slug.ts` — derives a project's URL slug from its name (not persisted — see "Project URLs" above)
- `src/actions/index.ts` — all mutations (Astro Actions)
- `src/pages/app/` — Today, Upcoming, Week, and per-project views (`projects/[slug].astro`)
- `src/pages/api/mcp.ts` — MCP server (see "MCP server" above)
- `migrations/` — D1 schema (`0001_init.sql` base schema, `0002_unique_inbox_per_user.sql` adds the one-inbox-per-user constraint, `0003_add_task_description_href.sql` adds `tasks.description`/`tasks.href` edited via the task detail modal, `0004_add_project_type.sql` adds `projects.type` — see `src/scripts/task-edit.ts` and `src/scripts/sidebar.ts`, `0005_add_task_repeat_rule.sql` adds `tasks.repeat_rule` — see `lib/repeat.ts`)

## What was intentionally left out of the MVP

Labels/tags, multi-user sharing/assignment, roles.
