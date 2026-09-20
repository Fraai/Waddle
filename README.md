# Todo

A self-hosted Todoist alternative that talks to Claude natively — task management as an MCP server, not just a web app. Built by [Fraai Agency](https://fraai.agency), a web studio in Flanders, and used daily by the team in production since it shipped.

![Statistics page: streaks, a GitHub-style activity heatmap, and day/hour breakdowns](docs/screenshot.png)

Astro SSR on Cloudflare Workers, D1 for storage, Google SSO restricted to one Workspace domain of your choosing (no forking required — see below). Runs comfortably on Cloudflare's free tier for a small team, so self-hosting costs $0 where a per-seat SaaS plan doesn't.

## Why this instead of Todoist/Things/Linear's task view

- **It's an MCP server first.** `/api/mcp` exposes the same tasks Claude Code, Claude Desktop, or a custom connector can list, create, and complete — ask Claude what's due today, or have it file a task mid-conversation, without switching apps. No other open-source todo app does this natively.
- **You own the data.** Cloudflare D1 in your own account, not a third party's database.
- **It's not a toy.** Recurring tasks, real Web Push notifications (works with the app fully closed), drag-and-drop, subtasks, and a statistics page with a GitHub-style completion heatmap — the things a team actually asks for after a week of daily use.

## Features

- **Today / Upcoming / Week views** — overdue and due-today tasks, a rolling agenda grouped by date, and a 7-day board you can drag tasks across.
- **Projects** — personal to each user, marked private or work (filterable from the sidebar), with a colour you can set per project and a readable URL (`/app/projects/fitness`, not `/app/projects/7`). Every user gets an un-renameable, un-deletable Inbox on first login.
- **Sections, subtasks, descriptions, links, recurring tasks** — sections group tasks within a project (drag to reorder); tasks can have subtasks, a free-text description, a link, and a repeat rule, all editable from a detail modal.
- **Push notifications** — a task with a due date and time sends a real Web Push notification, even with the app closed.
- **Statistics** — completion streaks, a GitHub-style activity heatmap, and breakdowns by project/priority/day/hour.
- **Installable** — has a manifest and icons, so it can be added to your home screen (iPhone/iPad) or dock (Mac) as a standalone app.
- **MCP server** — `/api/mcp` exposes the app to Claude (Code, Desktop, or a custom connector) as tools for listing, creating, and completing tasks and projects. See `CLAUDE.md` for the tool list and setup.

## Deploying your own instance

Requires a Cloudflare account (the free tier is enough) and a Google Cloud project for OAuth.

1. **Fork/clone this repo, then install:**
   ```bash
   npm install
   ```

2. **Create your own D1 database and KV namespace** (this repo's `wrangler.toml` points at Fraai Agency's — you need your own):
   ```bash
   npx wrangler d1 create todo-app
   npx wrangler kv namespace create SESSION
   ```
   Copy the printed `database_id` and KV `id` into `wrangler.toml` (replacing the existing ones), and change `name` and `[route].pattern` (or delete `[route]` to use the free `*.workers.dev` subdomain instead of a custom domain).

3. **Set up Google OAuth** — in Google Cloud Console, create an OAuth 2.0 Web Application credential with these authorized redirect URIs:
   - `https://<your-domain>/api/auth/callback`
   - `http://localhost:4321/api/auth/callback`

4. **Configure secrets** — copy `.env.example` to `.dev.vars` and fill in real values (see the comments in that file and `CLAUDE.md` for what each one does). `ALLOWED_EMAIL_DOMAIN` is what restricts sign-in to your org's Google Workspace domain. For production, push each one with `npx wrangler secret put <NAME>` instead of relying on `.dev.vars` (which is local-only and gitignored).

5. **Apply migrations and run:**
   ```bash
   npm run db:migrate:local
   npm run dev
   ```
   Once you're ready to ship: `npm run db:migrate:remote` (against production, before the first deploy that needs it) then `npm run deploy`.

## Commands

```bash
npm run dev               # Astro dev server on http://localhost:4321
npm run build              # Production build
npm test                   # Vitest unit + DB tests (local D1, no Cloudflare account needed)
npx wrangler dev            # Preview against a Cloudflare Worker runtime locally
npm run deploy             # Build and deploy to Cloudflare
npm run db:migrate:local   # Apply migrations to the local D1 database
npm run db:migrate:remote  # Apply migrations to production
```

See `CLAUDE.md` for architecture, the full list of required secrets, and the MCP tool reference.

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Fraai Agency](https://fraai.agency) — we build and host Astro sites for clients in Flanders. This is one of our own internal tools, open-sourced as-is.
