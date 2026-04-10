import { PrismaClient, type Prisma } from "@prisma/client";
import { getIO } from "../websocket/socket.js";

const prisma = new PrismaClient();

type NotificationType = "trade_open" | "trade_close" | "trade_error" | "strategy_deploy" | "strategy_pause" | "strategy_stop" | "strategy_resume";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/** Create notification in DB and push via WebSocket in real-time */
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

  // Push real-time via Socket.io
  const io = getIO();
  if (io) {
    io.to(`user:${params.userId}`).emit("notification:new", notification);
  }

  return notification;
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
