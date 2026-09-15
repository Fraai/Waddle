import { applyD1Migrations, env } from 'cloudflare:test';

// Setup files run outside isolated storage, and may be run multiple times.
// applyD1Migrations() only applies migrations that haven't already been
// applied, so calling this here on every test file is safe.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
