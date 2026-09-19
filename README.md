# todo.fraai.agency

Internal Todoist alternative for the Fraai Agency team. Astro SSR on Cloudflare Workers, D1 for storage, Google SSO restricted to `@fraai.agency` accounts.

## Features

- **Today / Upcoming / Week views** — overdue and due-today tasks, a rolling agenda grouped by date, and a 7-day board you can drag tasks across.
- **Projects** — personal to each user, marked private or work (filterable from the sidebar), with a colour you can set per project and a readable URL (`/app/projects/fitness`, not `/app/projects/7`). Every user gets an un-renameable, un-deletable Inbox on first login.
- **Sections, subtasks, descriptions, links** — sections group tasks within a project (drag to reorder); tasks can have subtasks, a free-text description, and a link, all editable from a detail modal.
- **Installable** — has a manifest and icons, so it can be added to your home screen (iPhone/iPad) or dock (Mac) as a standalone app.
- **MCP server** — `/api/mcp` exposes the app to Claude (Code, Desktop, or a custom connector) as tools for listing, creating, and completing tasks and projects. See `CLAUDE.md` for the tool list and setup.

## Setup

```bash
npm install
cp .env.example .dev.vars   # fill in real values, see CLAUDE.md
npm run db:migrate:local
npm run dev
```

## Commands

```bash
npm run dev                # Astro dev server on http://localhost:4321
npm run build              # Production build
npm test                   # Vitest unit + DB tests (local D1, no Cloudflare account needed)
npx wrangler dev           # Preview against a Cloudflare Worker runtime locally
npm run deploy             # Build and deploy to Cloudflare
npm run db:migrate:local   # Apply migrations to the local D1 database
npm run db:migrate:remote  # Apply migrations to production
```

See `CLAUDE.md` for architecture, required secrets, Google OAuth setup, and the MCP tool reference.
