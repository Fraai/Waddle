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
