// Only handles push notifications — this app has no offline support (see
// CLAUDE.md), so there's no fetch/install caching logic here at all.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}

  const title = data.title ? `Due now: ${data.title}` : 'Todo reminder';
  event.waitUntil(
    self.registration.showNotification(title, {
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: data.taskId ? `task-${data.taskId}` : undefined,
      data: { taskId: data.taskId ?? null },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow('/app/today') : undefined;
    }),
  );
});
