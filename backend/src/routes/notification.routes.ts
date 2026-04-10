import { Router, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { getNotifications, markAsRead, markAllAsRead, getUnreadCount } from "../services/notification.service.js";

const router = Router();

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

export default router;
