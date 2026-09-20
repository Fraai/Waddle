import { handle } from '@astrojs/cloudflare/handler';
import { runNotificationSweep } from './lib/notify-sweep';

// Astro's own Cloudflare entrypoint (@astrojs/cloudflare/entrypoints/server)
// only exports `fetch` — this wraps the same `handle` it re-exports, adding
// `scheduled` for the cron-triggered push notification sweep (see
// lib/notify-sweep.ts and wrangler.toml's [triggers]).
//
// `env` is cast to match runNotificationSweep's own param type rather than
// the generated Env — like every other secret in this app (JWT_SECRET,
// MCP_TOKEN, ...), VAPID_PUBLIC_KEY etc. are set via `wrangler secret put`
// and never appear in the generated worker-configuration.d.ts.
export default {
  fetch: handle,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runNotificationSweep(env as unknown as Parameters<typeof runNotificationSweep>[0]));
  },
};
