# CLAUDE.md — todo.fraai.agency

Internal Todoist alternative for the fraai.agency team. Astro SSR on Cloudflare Workers + D1.

## What this app is

- **Internal only** — no public registration.
- **Google SSO** — `@fraai.agency` accounts only. Non-allowed domains are rejected at `/api/auth/callback` with a redirect to `/auth/error?reason=domain`.
- **Personal, per-user data** — every user has their own projects/sections/tasks. No sharing, no assignment, no cross-user visibility. Every user gets an auto-created, un-renameable, un-deletable "Inbox" project on first login.
- **Responsive down to phone width** — sidebar collapses into a hamburger-triggered drawer below 768px (CSS-only, via a `peer`-checked checkbox in `AppLayout.astro`; no JS). At 768px+, the sidebar can also be manually collapsed (⌘B, or the toggle buttons) — a separate, JS/localStorage-backed preference (`sidebar.ts` + the `data-sidebar-collapsed` attribute set on `<html>`), independent of the mobile drawer. English UI, due dates only (no time-of-day), no recurring tasks, no labels.

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

`DB` — Cloudflare D1, bound in `wrangler.toml`. Apply migrations: `npm run db:migrate:local` (add `:remote` for production). `wrangler.toml`'s `database_id` is still the placeholder `00000000-...` — replace it with a real id from `wrangler d1 create todo-fraai-agency` before `npm run deploy` will work.

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
- `migrations/` — D1 schema (`0001_init.sql` base schema, `0002_unique_inbox_per_user.sql` adds the one-inbox-per-user constraint)

## What was intentionally left out of the MVP

Recurring tasks, labels/tags, due times, multi-user sharing/assignment, roles.
