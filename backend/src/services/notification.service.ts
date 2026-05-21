import { PrismaClient, type Prisma } from "@prisma/client";
import { emitToUser } from "../websocket/socket.js";
import { sendPushToUser } from "./push.service.js";
import { sendTelegramMessage } from "./telegram.service.js";

const prisma = new PrismaClient();

export type NotificationType =
  | "trade_open"
  | "trade_close"
  | "trade_error"
  | "strategy_deploy"
  | "strategy_pause"
  | "strategy_stop"
  | "strategy_resume"
  | "admin_broadcast"
  | "margin_call";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Optional deep-link URL opened when user clicks the push notification. */
  url?: string;
  /**
   * Optional pre-formatted Telegram HTML body. When provided, replaces the
   * default title+message text for the Telegram channel ONLY — in-app
   * notification list + web/mobile push still use plain title/message.
   * Lets call sites ship the rich templates from `notification-templates.ts`
   * without affecting other delivery surfaces.
   */
  telegramHtml?: string;
}

/** Create notification: DB save + Socket.io realtime + Web Push (if subscribed) */
export async function createNotification(params: CreateNotificationParams) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: (params.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  // Realtime push — works from both web (in-memory io) and worker (Redis
  // emitter). Never throws: if no transport is available the user picks the
  // notification up on their next REST fetch.
  emitToUser(params.userId, "notification:new", notification);

  // Web push (site closed case) — fire and forget, don't block DB response
  sendPushToUser(params.userId, {
    title: params.title,
    body: params.message,
    tag: params.type,
    url: params.url ?? urlFromType(params.type, params.data),
    data: { notificationId: notification.id, type: params.type, ...(params.data ?? {}) },
  }).catch((e) => console.error("[notification] push failed:", e));

  // Telegram (most reliable channel for iOS PWAs where Apple silently drops
  // pushes). Same fire-and-forget pattern — Telegram outages or unlinked
  // users never block the in-app flow. Only fires for users who have
  // opted in (linked their chat via Settings).
  const appUrl = process.env.APP_PUBLIC_URL ?? "https://algopulse.in";
  const deepLink = `${appUrl}${params.url ?? urlFromType(params.type, params.data)}`;
  sendTelegramMessage(params.userId, {
    // Prefer rich HTML template when caller provided one; fall back to the
    // legacy title+body MarkdownV2 path so older call sites keep working
    // verbatim during the rollout.
    ...(params.telegramHtml
      ? { html: params.telegramHtml }
      : {
          title: titleWithEmoji(params.type, params.title),
          body: params.message,
        }),
    link: { url: deepLink, label: "Open AlgoPulse" },
  }).catch((e) => console.error("[notification] telegram failed:", e));

  return notification;
}

/** Type-aware emoji prefix for nicer Telegram message titles. The DB
 *  title is preserved untouched; this is purely a presentation upgrade
 *  for the Telegram channel. */
function titleWithEmoji(type: NotificationType, title: string): string {
  const emoji: Record<NotificationType, string> = {
    trade_open: "📈",
    trade_close: "📉",
    trade_error: "⚠️",
    strategy_deploy: "🚀",
    strategy_pause: "⏸",
    strategy_stop: "🛑",
    strategy_resume: "▶️",
    admin_broadcast: "📣",
    margin_call: "💰",
  };
  const e = emoji[type] ?? "🔔";
  return `${e} ${title}`;
}

function urlFromType(type: NotificationType, _data?: Record<string, unknown>): string {
  switch (type) {
    case "trade_open":
    case "trade_close":
    case "trade_error":
    case "strategy_deploy":
    case "strategy_pause":
    case "strategy_stop":
    case "strategy_resume":
    case "margin_call":
      return "/deployed";
    case "admin_broadcast":
      return "/dashboard";
    default:
      return "/";
  }
}

/** Get notifications for a user */
export async function getNotifications(userId: string, limit = 30, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Mark single notification as read */
export async function markAsRead(notificationId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

/** Mark all as read for a user */
export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

/** Get unread count */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}
