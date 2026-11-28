/* HRMS Web Push Service Worker */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "HRMS Notification", body: event.data.text() };
  }

  const title = payload.title || "HRMS Notification";
  const body = payload.body || "You have a new update in HRMS.";
  const tag = payload.tag || "hrms-notification";
  const data = payload.data || {};

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const hasFocusedForegroundTab = clientList.some(
          (client) => client.visibilityState === "visible" && client.focused
        );
        if (hasFocusedForegroundTab) {
          return undefined;
        }
        return self.registration.showNotification(title, {
          body,
          tag,
          icon: "/icons/push-icon-192.png",
          badge: "/icons/push-badge-72.png",
          data,
        });
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const rawAction = String(data.actionUrl || "/notifications");
  const safePath = rawAction.startsWith("/") ? rawAction : "/notifications";
  const targetUrlObj = new URL(safePath, self.location.origin);
  if (data.notificationId) {
    targetUrlObj.searchParams.set("notif_click", String(data.notificationId));
    targetUrlObj.searchParams.set("notif_channel", String(data.channel || "web_push"));
    if (data.deviceTokenId) {
      targetUrlObj.searchParams.set("notif_device", String(data.deviceTokenId));
    }
  }
  const targetUrl = targetUrlObj.href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.postMessage({
              type: "HRMS_NOTIFICATION_CLICK",
              notificationId: data.notificationId || null,
              channel: data.channel || "web_push",
              deviceTokenId: data.deviceTokenId || null,
              actionUrl: safePath,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
