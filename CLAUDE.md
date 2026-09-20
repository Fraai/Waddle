# CLAUDE.md — Waddle (todo.fraai.agency)

Internal Todoist alternative for the Fraai Agency team, branded as "Waddle" for the open-source release. Astro SSR on Cloudflare Workers + D1. Self-hostable for any org — see `README.md` for deploying your own instance.

## What this app is

- **Internal only** — no public registration.
- **Google, GitHub, and Microsoft SSO** — all restricted to one domain, set via the `ALLOWED_EMAIL_DOMAIN` secret (`fraai.agency` for this deployment); the domain check is the real gate for every provider, not just a consent-screen hint. Non-allowed domains are rejected at each provider's callback with a redirect to `/auth/error?reason=domain`; see `src/utils/auth.ts`'s `isAllowedEmail`. Google is the only one treated as required — GitHub and Microsoft are optional, additional sign-in options, gated on `AUTH_GITHUB_ID`/`AUTH_MICROSOFT_ID` being set (both unset by default; `login.astro` only shows a provider's button if its ID is configured). See "OAuth setup" below.
- **Statistics** — `/app/stats` computes streaks, a GitHub-style completion heatmap, and breakdowns by weekday/hour/project/priority/work-vs-private, all server-side from every task the user has ever created (`lib/stats.ts`, unit tested). No client JS, no new dependencies.
- **Personal, per-user data** — every user has their own projects/sections/tasks. No sharing, no assignment, no cross-user visibility. Every user gets an auto-created, un-renameable, un-deletable "Inbox" project on first login.
- **Responsive down to phone width** — sidebar collapses into a hamburger-triggered drawer below 768px (CSS-only, via a `peer`-checked checkbox in `AppLayout.astro`; no JS). At 768px+, the sidebar can also be manually collapsed (⌘B, or the toggle buttons) — a separate, JS/localStorage-backed preference (`sidebar.ts` + the `data-sidebar-collapsed` attribute set on `<html>`), independent of the mobile drawer. English UI, no labels.
- **Every project is "private" or "work"** (`projects.type`, defaults to `work`) — toggled via the badge next to a project's name in the sidebar. The Inbox is exempt (no badge, `setProjectType` rejects it like rename/delete already did) — it's the catch-all, not a private/work project, so it and its tasks always show regardless of the filter. A sidebar segmented control (All/Work/Private) filters everything else by it: Today, Upcoming, and Week hide non-matching tasks, and the sidebar hides non-matching projects. Also a JS/localStorage preference (`data-task-filter` on `<html>`), same mechanism as the sidebar collapse. Project pages are *not* filtered — visiting one directly always shows its own tasks regardless of the ambient filter.
- **Project URLs are slugs** (`/app/projects/fitness`, not `/app/projects/7`) — derived from the name on every request by `lib/slug.ts`, not stored. A rename changes the URL immediately; an old link 404s into the same "not found" → redirect-to-Today fallback the project page already had for a bad id, rather than erroring. Same-named projects get a `-2`/`-3` suffix, assigned by id (creation order) so a drag-reorder can't shift which project owns a bare slug.
- **Project colours** — a fixed 64-swatch palette (`PROJECT_COLORS` in `lib/validation.ts`, kept in sync by hand with the copy in `scripts/sidebar.ts`, same as the existing `projectHue()` duplication). Click the sidebar dot to open a swatch-grid popover; unset projects keep the old hue-based default colour.
- **Finished tasks leave the project view** — a project page only lists open tasks by default; done top-level (not sub-) tasks move into a "Completed" `<details>` disclosure at the bottom on next load. Subtasks still just strike through in place, like before.
- **Recurring tasks** — simple interval repeat, no separate recurring-series concept (`lib/repeat.ts`). A task's `repeat_rule` (`"daily"` / `"weekly"` / `"monthly"` / `"every:N:days"`, editable only from the task detail modal) is copied onto a brand-new task created when you complete the current one — completing, deleting, or editing one occurrence never touches any other. A repeat rule with no due date is inert (nothing to roll the date forward from), so it just completes normally. `toggleTaskDone` returns whether it spawned one; the client reloads in that case rather than trying to work out where the new occurrence belongs in whatever list is on screen.
- **Push notifications** — a due date *and* due time (`tasks.due_time`, edit-modal only) gets a real Web Push notification, works even with the app closed. See "Push notifications" below.
- **Installable as a home-screen/dock app** — `public/manifest.json` + `public/icon*.png`/`favicon-32.png`/`apple-touch-icon.png`, all rendered from the duck mascot SVG below and downsampled with Pillow, linked from both `AppLayout.astro` and `login.astro`'s `<head>` (no shared layout between them, so the tags are duplicated by hand). `public/sw.js` exists only for push notifications (see below), not offline support — this is still an always-online tool otherwise.
- **Brand colour is `#f6a80a`** (an amber/orange) — `--accent` in `global.css`. Raw, it's only ~2:1 contrast against white, which fails WCAG for text/icons/outlines, so there's a second token, `--accent-ink` (`#946505` in light mode, same as `--accent` in dark mode where the raw colour already clears 9:1 against the dark background) for anything drawn *on* a light surface. Rule of thumb: solid fills (button backgrounds, the app icon) use `--accent`; text, borders, outlines, and icons use `--accent-ink`. `.btn--primary` uses dark text (`#1d1d1f`), not white, for the same contrast reason.
- **Mascot is a duck** (the name: "get your ducks in a row"), flat-vector, `#f6a80a` body background with a `#fff8ec` cream duck. No `brand-assets/` folder anymore (removed along with the old company photo it held) — the SVG master lives only here, regenerate PNGs by rendering it and downsampling with Pillow (`Image.resize(..., Image.LANCZOS)`) to `favicon-32.png` (32×32), `apple-touch-icon.png` (180×180), `icon-192.png`/`icon-512.png`, and the `docs/screenshot.png`-style GitHub social preview (1280×640, uploaded manually at Settings → General → Social preview, no API for it):
  ```svg
  <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#f6a80a"/>
    <ellipse cx="266" cy="336" rx="146" ry="112" fill="#fff8ec"/>
    <path d="M 210 300 Q 260 280 300 320 Q 260 350 210 340 Z" fill="#f3dfb8"/>
    <circle cx="216" cy="182" r="92" fill="#fff8ec"/>
    <path d="M 288 172 Q 372 158 366 200 Q 358 226 294 214 Q 280 200 288 172 Z" fill="#e08a1e"/>
    <circle cx="238" cy="164" r="13" fill="#1d1d1f"/>
  </svg>
  ```

## Required secrets

| Secret | Purpose |
|---|---|
| `JWT_SECRET` | HS256 JWT signing (min 32 chars) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `ALLOWED_EMAIL_DOMAIN` | Domain allowed to sign in via any provider (no `@`, e.g. `fraai.agency`) |
| `APP_TAGLINE` | Subtitle under the app name on the sign-in page — optional, defaults to "The internal task list for your team." (`login.astro`) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth App credentials — optional, leave unset to hide the "Sign in with GitHub" button |
| `AUTH_MICROSOFT_ID` / `AUTH_MICROSOFT_SECRET` | Azure AD (Entra) app registration credentials — optional, leave unset to hide the "Sign in with Microsoft" button |
| `AUTH_MICROSOFT_TENANT` | Optional, defaults to `common` (any tenant) — set to a specific Entra tenant ID to restrict which org's accounts even reach the consent screen |
| `MCP_TOKEN` | Bearer token for `/api/mcp` — optional, leave unset to disable it |
| `MCP_USER_EMAIL` | Which existing user `MCP_TOKEN` authenticates as — optional, required if `MCP_TOKEN` is set |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Push notifications (see below) — optional, leave unset to hide the sidebar's "Notifications" toggle. Generate with the command in `.env.example`; `VAPID_SUBJECT` is a `mailto:` address |

Local: put these in `.dev.vars` (gitignored, see `.env.example` for the variable names). Production: `npx wrangler secret put <NAME>`.

## MCP server

`/api/mcp` (`src/pages/api/mcp.ts`) exposes the app to any MCP client (Claude Code, Claude Desktop, Claude.ai custom connectors) as tools: `list_projects`, `list_today`, `list_upcoming`, `list_project_tasks`, `create_project`, `create_section`, `create_task` (takes an optional `repeatRule`), `toggle_task_done` (returns `nextOccurrenceCreated`), `delete_task`. Built on `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` in stateless mode (fresh `McpServer` per request — no session state, since every tool call re-authenticates and re-queries D1 anyway).

Auth is a single Bearer token (`MCP_TOKEN`) mapped to one account (`MCP_USER_EMAIL`) — this is personal automation, not multi-tenant, so the same token in two different Claude installs just authenticates as that one person both times. Not OAuth; if this ever needs to serve multiple people with their own logins, that's the upgrade path. `MCP_USER_EMAIL` must already exist (sign in via the browser once first) — the endpoint resolves an existing user (`getUserByEmail`), it never provisions one.

Client config (Claude Code / Desktop, `~/.claude.json` or the app's MCP settings):
```json
{
  "mcpServers": {
    "todo": {
      "url": "https://<your-domain>/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

## Push notifications

A task with a due date *and* a due time (`tasks.due_time`, `"HH:MM"`, set from the task detail modal) gets a real Web Push notification — works even with the app fully closed, not just backgrounded, since it goes through the browser's push service rather than a foreground timer.

- **Client**: `scripts/push.ts` (wired into `AppLayout.astro`'s "Notifications" sidebar button, which only renders if `VAPID_PUBLIC_KEY` is set) registers `public/sw.js`, requests `Notification` permission, and subscribes via `PushManager.subscribe()`. The subscription (`endpoint`/`p256dh`/`auth`) is saved with `actions.subscribePush`/`unsubscribePush` into the `push_subscriptions` table (a user can have several — one per device). `public/sw.js` only has a `push` listener (`showNotification`) and a `notificationclick` listener (focus/open the app) — no offline caching, consistent with this app having no other service-worker behavior.
- **iOS/iPadOS caveat**: Safari only exposes `PushManager`/`Notification` to a site added to the Home Screen — a plain browser tab can't subscribe there. `push.ts` shows an explanatory alert rather than failing silently.
- **Server**: a Cloudflare Cron Trigger (`wrangler.toml`'s `[triggers]`, every 5 minutes) invokes `worker-entry.ts`'s `scheduled()`, which calls `lib/notify-sweep.ts`. That queries `db.listTasksDueForNotification` (every user's open, not-yet-notified tasks whose `due_date` is today and `due_time` has arrived, joined against their push subscriptions) and sends each via `lib/push.ts` (`@block65/webcrypto-web-push` — a WebCrypto/RFC-8291-based Web Push implementation, chosen specifically because it needs no Node crypto APIs Workers doesn't have). A 404/410 response means the push service considers that subscription gone — it's deleted. Every matched task is marked `notified_at` regardless of send success, so a transient failure doesn't get retried into spamming a since-recovered device.
- **`worker-entry.ts`**: Astro's own Cloudflare entrypoint (`@astrojs/cloudflare/entrypoints/server`, what `wrangler.toml`'s `main` pointed at before this) only exports a `fetch` handler — no hook for `scheduled`. This file imports the same `handle` function from the adapter's dedicated `@astrojs/cloudflare/handler` export and re-exports it alongside a `scheduled` handler. Verified this doesn't break anything Astro-specific (image transforms, prerendering, etc. all still route through the same `handle`) via `wrangler dev` and `wrangler deploy --dry-run` before relying on it.
- Editing a task's `dueDate`/`dueTime` clears `notified_at` (`db.updateTask`), so rescheduling re-arms the reminder.
- A repeating task's next occurrence (see "Recurring tasks" above) inherits `dueTime` from the one just completed, but starts with `notified_at` unset (it's a new row) — so it'll notify again next time it's due.

## OAuth setup

Google is required; GitHub and Microsoft are optional — set up only the ones you want to offer.

**Google** — in Google Cloud Console, create an OAuth 2.0 Web Application credential with these authorized redirect URIs:
- `https://<your-domain>/api/auth/callback` (`https://todo.fraai.agency/api/auth/callback` for this deployment)
- `http://localhost:4321/api/auth/callback`

**GitHub** (optional) — in GitHub → Settings → Developer settings → OAuth Apps → New OAuth App, set the "Authorization callback URL" to:
- `https://<your-domain>/api/auth/callback/github`
- `http://localhost:4321/api/auth/callback/github` (GitHub OAuth Apps only allow one callback URL per app — use a second, dev-only OAuth App for local testing, or just test against the deployed URL)

**Microsoft** (optional) — in the Azure Portal → Entra ID → App registrations → New registration, add a Web platform redirect URI:
- `https://<your-domain>/api/auth/callback/microsoft`
- `http://localhost:4321/api/auth/callback/microsoft`

The client secret is under "Certificates & secrets" on the app registration (not the same as the client/application ID).

## DB binding

`DB` — Cloudflare D1, bound in `wrangler.toml`. Apply migrations: `npm run db:migrate:local` (add `:remote` for production — remember to run this against production *before* deploying a migration that ships new code depending on it). `wrangler.toml`'s `database_id` points at this deployment's own `todo-fraai-agency` D1 database — a new deployment needs its own (`npx wrangler d1 create ...`, see `README.md`).

## Custom domain

Not in `wrangler.toml` — deploying without it gives a free `workers.dev` URL. This deployment's `todo.fraai.agency` binding is set at deploy time via `WORKER_DOMAIN=todo.fraai.agency npm run deploy` (see the `deploy` script in `package.json`), not committed anywhere. No application code hardcodes the domain either — every route/redirect URI is derived from the incoming request's own origin (`new URL(request.url).origin`), which is also why the Google/GitHub/Microsoft OAuth callback routes work unmodified in local dev against `localhost:4321`.

## Dev commands

```bash
npm run dev       # Astro dev server on http://localhost:4321
npm run build     # Production build
npm test          # Vitest unit + DB tests (local D1, no Cloudflare account needed)
npx wrangler dev  # Preview against a Cloudflare Worker runtime locally
npm run deploy    # Build and deploy to Cloudflare
```

After any `package.json` change, regenerate the lockfile with a full wipe (`rm -rf node_modules package-lock.json && npm install`), not a plain `npm install` on top of the existing one, then verify with `rm -rf node_modules && npm ci`. `@cloudflare/vitest-pool-workers`'s bundled `wrangler` wants `@cloudflare/workers-types@^4.x` while everything else wants `^5.x`, and both packages publish near-daily dated versions — an incremental install can non-deterministically dedupe away the nested `4.x` copy the tree actually needs, which `npm install` tolerates but `npm ci` (what CI uses) correctly rejects as an out-of-sync lockfile. Bit CI twice before this was written down.

## Key files

- `src/middleware.ts` — JWT verification, route guard for `/app/*`, security response headers (CSP with a per-request nonce, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`)
- `src/layouts/AppLayout.astro` — the sidebar shell every `/app/*` page renders into. Takes an optional `projects` prop — every current page already fetches its own project list for its own rendering, so it passes that straight through instead of making AppLayout query D1 a second time for the same rows. A new page should do the same (pass `projects={projects}`) rather than let AppLayout fall back to fetching it itself.
- `src/utils/auth.ts` — Google/GitHub/Microsoft OAuth helpers, JWT sign/verify, domain allowlist (`isAllowedEmail`, checked against `ALLOWED_EMAIL_DOMAIN`), plus the shared `checkOAuthState`/`completeOAuthLogin` every provider's callback route calls into
- `src/pages/api/auth/{google,github,microsoft}.ts` + `src/pages/api/auth/callback.ts` (Google) / `callback/{github,microsoft}.ts` — one initiate + one callback route per provider; Google's routes keep their original (non-nested) paths since that redirect URI is already registered in production, new providers use `/api/auth/callback/<provider>`
- `src/lib/users.ts` — user + inbox-project auto-provisioning on login
- `src/lib/db.ts` — all project/section/task queries, scoped to the acting user
- `src/lib/dates.ts` — Today/Upcoming date-grouping (Europe/Brussels timezone)
- `src/lib/slug.ts` — derives a project's URL slug from its name (not persisted — see "Project URLs" above)
- `src/lib/repeat.ts` — recurring-task rule parsing/labeling/next-date logic
- `src/lib/push.ts` / `src/lib/notify-sweep.ts` — Web Push sending and the cron sweep (see "Push notifications" above)
- `src/lib/stats.ts` — pure `computeStats` function behind `/app/stats` (see "What this app is" above)
- `src/worker-entry.ts` — the real `wrangler.toml` `main`; wraps Astro's own Cloudflare handler to add the `scheduled` export the push notification cron trigger needs
- `public/sw.js` — service worker, push notifications only, no offline caching
- `src/actions/index.ts` — all mutations (Astro Actions)
- `src/pages/app/` — Today, Upcoming, Week, Statistics (`stats.astro`), and per-project views (`projects/[slug].astro`)
- `src/pages/api/mcp.ts` — MCP server (see "MCP server" above)
- `migrations/` — D1 schema (`0001_init.sql` base schema, `0002_unique_inbox_per_user.sql` adds the one-inbox-per-user constraint, `0003_add_task_description_href.sql` adds `tasks.description`/`tasks.href` edited via the task detail modal, `0004_add_project_type.sql` adds `projects.type` — see `src/scripts/task-edit.ts` and `src/scripts/sidebar.ts`, `0005_add_task_repeat_rule.sql` adds `tasks.repeat_rule` — see `lib/repeat.ts`, `0006_add_notifications.sql` adds `tasks.due_time`/`tasks.notified_at` and the `push_subscriptions` table)

## What was intentionally left out of the MVP

Labels/tags, multi-user sharing/assignment, roles.
