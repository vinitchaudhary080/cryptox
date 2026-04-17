import { notificationApi } from "./api";

/** Convert a base64 URL-safe string to an ArrayBuffer for applicationServerKey. */
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(base64) : "";
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPermissionState(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Register (or fetch existing) service worker at /sw.js. */
export async function getServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("[push] SW register failed", err);
    return null;
  }
}

/** Request permission + subscribe this browser to web push, POST to backend. */
export async function subscribeToPush(): Promise<
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "error"; message?: string }
> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const reg = await getServiceWorker();
    if (!reg) return { ok: false, reason: "error", message: "Service worker unavailable" };

    const keyResp = (await notificationApi.vapidPublicKey()) as {
      success: boolean;
      data?: { publicKey?: string };
      error?: string;
    };
    if (!keyResp.success || !keyResp.data?.publicKey) {
      return { ok: false, reason: "error", message: "VAPID public key missing on server" };
    }
    const applicationServerKey = urlBase64ToBuffer(keyResp.data.publicKey);

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const json = sub.toJSON();
    const resp = (await notificationApi.subscribe({
      endpoint: sub.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      },
      userAgent: navigator.userAgent,
    })) as { success: boolean; error?: string };

    if (!resp.success) {
      return { ok: false, reason: "error", message: resp.error || "Backend subscribe failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message };
  }
}

/** Unsubscribe current browser from web push + notify backend. */
export async function unsubscribeFromPush(): Promise<{ ok: boolean; message?: string }> {
  if (!isPushSupported()) return { ok: false, message: "Push not supported" };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await notificationApi.unsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** True if this browser currently has an active push subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
