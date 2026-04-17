import { Router, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  createNotification,
} from "../services/notification.service.js";
import { env } from "../config/env.js";

const router = Router();
const prisma = new PrismaClient();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "vinitchaudhary080@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function isAdmin(userId: string): Promise<boolean> {
  if (ADMIN_USER_IDS.includes(userId)) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return !!user && ADMIN_EMAILS.includes(user.email.toLowerCase());
}

// Get notifications
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 30;
    const unreadOnly = req.query.unread === "true";
    const notifications = await getNotifications(req.user!.userId, limit, unreadOnly);
    const unreadCount = await getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Get unread count only
router.get("/unread-count", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await getUnreadCount(req.user!.userId);
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Mark one as read
router.patch("/:id/read", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await markAsRead(req.params.id as string, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Mark all as read
router.patch("/read-all", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await markAllAsRead(req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Get VAPID public key (frontend uses it to subscribe)
router.get("/vapid-public-key", (_req, res) => {
  res.json({ success: true, data: { publicKey: env.vapid.publicKey } });
});

// Is current user an admin? (used to show/hide admin UI)
router.get("/admin-check", authenticate, async (req: AuthRequest, res: Response) => {
  const admin = await isAdmin(req.user!.userId);
  res.json({ success: true, data: { isAdmin: admin } });
});

// Subscribe this browser to web push
router.post("/subscribe", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint, keys, userAgent } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ success: false, error: "Invalid subscription payload" });
      return;
    }

    const sub = await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: req.user!.userId, endpoint } },
      update: { p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null },
      create: {
        userId: req.user!.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
    });

    res.json({ success: true, data: { id: sub.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Unsubscribe this browser from web push
router.post("/unsubscribe", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ success: false, error: "endpoint required" });
      return;
    }
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.user!.userId, endpoint },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Admin broadcast — send a notification to a specific user or everyone
router.post("/admin-send", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isAdmin(req.user!.userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }

    const { title, message, userId, url, data } = req.body as {
      title?: string;
      message?: string;
      userId?: string;
      url?: string;
      data?: Record<string, unknown>;
    };
    if (!title || !message) {
      res.status(400).json({ success: false, error: "title and message required" });
      return;
    }

    const targets: string[] = userId
      ? [userId]
      : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

    await Promise.all(
      targets.map((uid) =>
        createNotification({
          userId: uid,
          type: "admin_broadcast",
          title,
          message,
          url,
          data,
        }),
      ),
    );

    res.json({ success: true, data: { sentTo: targets.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
