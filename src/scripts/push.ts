import { actions } from 'astro:actions';

const button = document.getElementById('notifications-toggle') as HTMLButtonElement | null;
const label = document.getElementById('notifications-label');

if (button && label) {
  const vapidKey = button.dataset.vapidKey ?? '';

  // The VAPID public key arrives base64url-encoded (what the server
  // generated it as, and what the browser's own applicationServerKey
  // convention expects) — PushManager.subscribe() wants it as raw bytes.
  function urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  function setLabel(subscribed: boolean): void {
    label.textContent = subscribed ? 'Notifications: On' : 'Notifications';
    button!.setAttribute('aria-pressed', String(subscribed));
  }

  async function currentSubscription(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration('/');
    return (await registration?.pushManager.getSubscription()) ?? null;
  }

  async function subscribe(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // Notably: iOS/iPadOS Safari only exposes these once the app is
      // added to the Home Screen — a plain browser tab doesn't have them.
      alert('This browser doesn’t support push notifications here — on iPhone/iPad, add the app to your Home Screen first.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notifications permission was not granted.');
      return;
    }
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const json = subscription.toJSON();
    const { error } = await actions.subscribePush({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    });
    if (error) {
      alert(error.message);
      await subscription.unsubscribe();
      return;
    }
    setLabel(true);
  }

  async function unsubscribe(subscription: PushSubscription): Promise<void> {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    const { error } = await actions.unsubscribePush({ endpoint });
    if (error) alert(error.message);
    setLabel(false);
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const existing = await currentSubscription();
      if (existing) {
        await unsubscribe(existing);
      } else {
        await subscribe();
      }
    } finally {
      button.disabled = false;
    }
  });

  currentSubscription().then((sub) => setLabel(sub !== null));
}
