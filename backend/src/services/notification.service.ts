import { PrismaClient, type Prisma } from "@prisma/client";
import { getIO } from "../websocket/socket.js";
import { sendPushToUser } from "./push.service.js";

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

  const io = getIO();
  if (io) {
    io.to(`user:${params.userId}`).emit("notification:new", notification);
  }

  // Web push (site closed case) — fire and forget, don't block DB response
  sendPushToUser(params.userId, {
    title: params.title,
    body: params.message,
    tag: params.type,
    url: params.url ?? urlFromType(params.type, params.data),
    data: { notificationId: notification.id, type: params.type, ...(params.data ?? {}) },
  }).catch((e) => console.error("[notification] push failed:", e));

  return notification;
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
