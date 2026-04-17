// AlgoPulse service worker — handles web-push notifications.
// Version: 2026-04-17-v3 — bump this comment to force iOS PWA to update SW.

const SW_VERSION = "2026-04-17-v3";

self.addEventListener("install", (event) => {
  console.log("[SW] install", SW_VERSION);
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  console.log("[SW] activate", SW_VERSION);
  event.waitUntil(self.clients.claim());
});

// Allowed route prefixes — anything else falls back to "/" to avoid 404s.
const KNOWN_ROUTES = [
  "/dashboard",
  "/deployed",
  "/strategies",
  "/brokers",
  "/reports",
  "/settings",
  "/billing",
  "/backtest",
  "/login",
  "/signup",
];

function sanitizeUrl(raw) {
  if (!raw || typeof raw !== "string") return "/";
  try {
    const parsed = new URL(raw, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    const path = parsed.pathname;
    if (path === "/" || KNOWN_ROUTES.some((r) => path === r || path.startsWith(r + "/"))) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    return "/dashboard";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "AlgoPulse", body: event.data.text() };
  }

  const title = payload.title || "AlgoPulse";
  const url = sanitizeUrl(payload.url);
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon",
    badge: payload.badge || "/icon",
    tag: payload.tag,
    data: { url, ...(payload.data || {}) },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const raw = event.notification.data && event.notification.data.url;
  const path = sanitizeUrl(raw);
  const fullUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Try to focus an existing window and navigate it.
      for (const client of clientList) {
        try {
          const clientOrigin = new URL(client.url).origin;
          if (clientOrigin === self.location.origin && "focus" in client) {
            if ("navigate" in client) {
              try {
                await client.navigate(fullUrl);
              } catch {
                // Some iOS PWAs reject navigate across scope — fall back.
              }
            }
            return client.focus();
          }
        } catch {
          // continue
        }
      }

      // No existing window — open a new one (works on iOS PWA + Android).
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })(),
  );
});
