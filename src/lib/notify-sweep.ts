import * as db from './db';
import { sendPush, type PushEnv } from './push';
import { todayISO, nowHHMM, DEFAULT_TIMEZONE } from './dates';

interface SweepEnv extends PushEnv {
  DB: D1Database;
  TIMEZONE?: string;
}

// Runs on Cloudflare's cron trigger (every 5 minutes — see worker-entry.ts
// and wrangler.toml) — not per-request, so there's no user/session context;
// it sweeps every user's due tasks in one pass.
export async function runNotificationSweep(env: SweepEnv): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;

  const timezone = env.TIMEZONE ?? DEFAULT_TIMEZONE;
  const due = await db.listTasksDueForNotification(env.DB, todayISO(undefined, timezone), nowHHMM(undefined, timezone));
  const notifiedTaskIds = new Set<number>();

  for (const row of due) {
    const { endpoint, p256dh, auth, ...task } = row;
    const result = await sendPush(
      env,
      { endpoint, p256dh, auth },
      { data: { title: task.title, taskId: task.id }, options: { ttl: 3600 } },
    );
    if (result.expired) {
      await db.deletePushSubscriptionByEndpoint(env.DB, endpoint);
    }
    // Marked notified regardless of a transient (non-expired) send
    // failure — retrying every 5 minutes for a task whose push service is
    // erroring would just spam a working device once it recovers.
    notifiedTaskIds.add(task.id);
  }

  for (const taskId of notifiedTaskIds) {
    await db.markTaskNotified(env.DB, taskId);
  }
}
