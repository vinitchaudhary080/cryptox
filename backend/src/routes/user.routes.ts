import { Router, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";

const router = Router();
const prisma = new PrismaClient();

const profileSelect = {
  id: true,
  email: true,
  name: true,
  displayName: true,
  phone: true,
  bio: true,
  timezone: true,
  country: true,
  avatarUrl: true,
  plan: true,
  googleId: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      brokers: true,
      deployedStrategies: true,
    },
  },
};

// GET /api/user/profile — full profile with stats
router.get("/profile", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: profileSelect,
    });

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Get trading stats
    const trades = await prisma.trade.findMany({
      where: { deployedStrategy: { userId: req.user!.userId }, status: "CLOSED" },
      select: { pnl: true },
    });

    const totalTrades = trades.length;
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const activeStrategies = await prisma.deployedStrategy.count({
      where: { userId: req.user!.userId, status: "ACTIVE" },
    });

    res.json({
      success: true,
      data: {
        ...user,
        hasPassword: !!await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { passwordHash: true } }).then(u => u?.passwordHash),
        hasGoogle: !!user.googleId,
        stats: {
          totalTrades,
          totalPnl: Math.round(totalPnl * 100) / 100,
          winRate: Math.round(winRate * 10) / 10,
          activeBrokers: user._count.brokers,
          activeStrategies,
          memberSince: user.createdAt,
        },
      },
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /api/user/profile — update profile fields
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  displayName: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  bio: z.string().max(500).optional(),
  timezone: z.string().max(30).optional(),
  country: z.string().max(60).optional(),
  avatarUrl: z.string().url().optional(),
});

router.patch("/profile", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    // Remove undefined fields
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = value;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ success: false, error: "No fields to update" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: updateData,
      select: profileSelect,
    });

    res.json({ success: true, data: updated, message: "Profile updated" });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0].message });
      return;
    }
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// PATCH /api/user/password — change password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

router.patch("/password", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !user.passwordHash) {
      res.status(400).json({ success: false, error: "No password set — you signed up with Google" });
      return;
    }

    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: "Current password is incorrect" });
      return;
    }

    const newHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { passwordHash: newHash },
    });

    res.json({ success: true, message: "Password updated" });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0].message });
      return;
    }
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

export default router;
