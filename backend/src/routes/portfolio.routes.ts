import { Router, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";

const router = Router();
const prisma = new PrismaClient();

// Portfolio overview stats
router.get("/stats", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const deployed = await prisma.deployedStrategy.findMany({
      where: { userId },
      include: { trades: { where: { status: "CLOSED" } } },
    });

    const totalInvested = deployed.reduce((s, d) => s + d.investedAmount, 0);
    const totalCurrentValue = deployed.reduce((s, d) => s + d.currentValue, 0);
    const totalPnl = totalCurrentValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    const allClosedTrades = deployed.flatMap((d) => d.trades);
    const winRate = allClosedTrades.length > 0
      ? (allClosedTrades.filter((t) => t.pnl > 0).length / allClosedTrades.length) * 100
      : 0;

    const activeStrategies = deployed.filter((d) => d.status === "ACTIVE").length;

    res.json({
      success: true,
      data: {
        totalValue: Math.round(totalCurrentValue * 100) / 100,
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
        activeStrategies,
        totalTrades: allClosedTrades.length,
        winRate: Math.round(winRate * 10) / 10,
      },
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Recent trades across all strategies
router.get("/trades", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const trades = await prisma.trade.findMany({
      where: {
        deployedStrategy: { userId: req.user!.userId },
      },
      include: {
        deployedStrategy: {
          select: { strategy: { select: { name: true } }, broker: { select: { name: true } } },
        },
      },
      orderBy: { openedAt: "desc" },
      take: limit,
    });

    res.json({ success: true, data: trades });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// PnL history (daily aggregated)
router.get("/pnl-history", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const trades = await prisma.trade.findMany({
      where: {
        deployedStrategy: { userId: req.user!.userId },
        status: "CLOSED",
        closedAt: { gte: since },
      },
      select: { pnl: true, closedAt: true },
      orderBy: { closedAt: "asc" },
    });

    // Aggregate by day
    const dailyPnl = new Map<string, number>();
    let cumulative = 0;
    for (const t of trades) {
      if (!t.closedAt) continue;
      const day = t.closedAt.toISOString().split("T")[0];
      cumulative += t.pnl;
      dailyPnl.set(day, cumulative);
    }

    const data = Array.from(dailyPnl.entries()).map(([date, pnl]) => ({
      date,
      pnl: Math.round(pnl * 100) / 100,
    }));

    res.json({ success: true, data });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
