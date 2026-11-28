import API from "../api/axios";

export function isWebPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getBrowserNotificationPermission() {
  if (!isWebPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushServiceWorker() {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return registration;
}

export async function getExistingPushSubscription() {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeBrowserPush({ requestPermission = true } = {}) {
  if (!isWebPushSupported()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Browser notification permission is blocked. Enable it in browser site settings."
        : "Notification permission was not granted."
    );
  }

  const vapidRes = await API.get("/notifications/vapid-public-key");
  const publicKey = vapidRes.data?.publicKey;
  if (!vapidRes.data?.configured || !publicKey) {
    throw new Error("Web Push VAPID keys are not configured on the server.");
  }

  const registration = await registerPushServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const subJson = subscription.toJSON();
  await API.post("/notifications/push-token", {
    token: subJson.endpoint,
    platform: "web",
    provider: "webpush",
    subscription: subJson,
    deviceName: `${navigator.platform || "Web"} · ${navigator.userAgent.slice(0, 60)}`,
  });

  return subscription;
}

export async function unsubscribeBrowserPush() {
  const subscription = await getExistingPushSubscription();
  if (!subscription) {
    return { endpoint: null, serverUnregistered: true, browserUnsubscribed: true };
  }
  const endpoint = subscription.endpoint;
  let serverUnregistered = false;
  let serverError = null;
  try {
    await API.delete("/notifications/push-token", { data: { token: endpoint } });
    serverUnregistered = true;
  } catch (err) {
    serverError = err?.response?.data?.error || err?.message || "Failed to unregister push token on server";
  }

  let browserUnsubscribed = false;
  try {
    browserUnsubscribed = await subscription.unsubscribe();
  } catch {
    browserUnsubscribed = false;
  }

  return { endpoint, serverUnregistered, browserUnsubscribed, serverError };
}
