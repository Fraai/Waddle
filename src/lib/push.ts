import { buildPushPayload, type PushMessage, type PushSubscription, type VapidKeys } from '@block65/webcrypto-web-push';

export interface PushEnv {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendPushResult {
  ok: boolean;
  // The push service reports the subscription itself as gone (404/410) —
  // the caller should delete it rather than keep retrying it forever.
  expired: boolean;
}

export async function sendPush(
  env: PushEnv, subscription: StoredSubscription, message: PushMessage,
): Promise<SendPushResult> {
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const pushSubscription: PushSubscription = {
    endpoint: subscription.endpoint,
    expirationTime: null,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  const payload = await buildPushPayload(message, pushSubscription, vapid);
  const res = await fetch(subscription.endpoint, payload);
  if (res.status === 404 || res.status === 410) return { ok: false, expired: true };
  return { ok: res.ok, expired: false };
}
