import webpush from "web-push";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const prisma = new PrismaClient();

let vapidReady = false;

function initVapid() {
  if (vapidReady) return true;
  if (!env.vapid.publicKey || !env.vapid.privateKey) {
    console.warn("[push] VAPID keys missing — web-push disabled");
    return false;
  }
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
  vapidReady = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!initVapid()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-192.png",
    url: payload.url ?? "/",
    tag: payload.tag,
    data: payload.data ?? {},
  });

  const stale: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 404 || e.statusCode === 410) {
          stale.push(sub.id);
        } else {
          console.error("[push] send failed", sub.endpoint, e.statusCode);
        }
      }
    }),
  );

  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }
}
