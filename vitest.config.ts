import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, 'migrations');
  const migrations = await readD1Migrations(migrationsPath);
  return {
    resolve: {
      alias: {
        'astro:middleware': new URL('./test/mock-astro-middleware.ts', import.meta.url).pathname,
        'astro:actions': new URL('./test/mock-astro-actions.ts', import.meta.url).pathname,
      },
    },
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: '2026-07-07',
          d1Databases: { DB: 'todo-fraai-agency-test' },
          bindings: { TEST_MIGRATIONS: migrations, JWT_SECRET: 'test-secret-at-least-32-characters-long' },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
