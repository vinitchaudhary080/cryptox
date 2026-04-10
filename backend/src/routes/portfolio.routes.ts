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

// Full report — overall + per strategy breakdown
router.get("/report", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const deployed = await prisma.deployedStrategy.findMany({
      where: { userId },
      include: {
        strategy: { select: { name: true, category: true } },
        broker: { select: { name: true, uid: true } },
        trades: { orderBy: { openedAt: "asc" } },
      },
      orderBy: { deployedAt: "desc" },
    });

    // ── Overall stats ──
    const totalInvested = deployed.reduce((s, d) => s + d.investedAmount, 0);
    const totalCurrentValue = deployed.reduce((s, d) => s + d.currentValue, 0);
    const totalPnl = totalCurrentValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    const allTrades = deployed.flatMap((d) => d.trades);
    const closedTrades = allTrades.filter((t) => t.status === "CLOSED");
    const openTrades = allTrades.filter((t) => t.status === "OPEN");
    const winTrades = closedTrades.filter((t) => t.pnl > 0);
    const lossTrades = closedTrades.filter((t) => t.pnl <= 0);
    const winRate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;

    const totalFees = closedTrades.reduce((s, t) => s + t.fee, 0);
    const avgWin = winTrades.length > 0 ? winTrades.reduce((s, t) => s + t.pnl, 0) / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0)) / lossTrades.length : 0;
    const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map((t) => t.pnl)) : 0;
    const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map((t) => t.pnl)) : 0;
    const profitFactor = lossTrades.length > 0
      ? winTrades.reduce((s, t) => s + t.pnl, 0) / Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0))
      : winTrades.length > 0 ? Infinity : 0;

    // ── Daily PnL for chart (all time) ──
    const dailyPnlMap = new Map<string, number>();
    let cumPnl = 0;
    for (const t of closedTrades.sort((a, b) => (a.closedAt?.getTime() ?? 0) - (b.closedAt?.getTime() ?? 0))) {
      if (!t.closedAt) continue;
      const day = t.closedAt.toISOString().split("T")[0];
      cumPnl += t.pnl;
      dailyPnlMap.set(day, Math.round(cumPnl * 100) / 100);
    }
    const pnlHistory = Array.from(dailyPnlMap.entries()).map(([date, pnl]) => ({ date, pnl }));

    // ── Monthly returns ──
    const monthlyMap = new Map<string, number>();
    for (const t of closedTrades) {
      if (!t.closedAt) continue;
      const month = t.closedAt.toISOString().slice(0, 7); // YYYY-MM
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + t.pnl);
    }
    const monthlyReturns = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, pnl]) => ({ month, pnl: Math.round(pnl * 100) / 100 }));

    // ── Per-strategy breakdown ──
    const strategyBreakdown = deployed.map((d) => {
      const sTrades = d.trades.filter((t) => t.status === "CLOSED");
      const sWins = sTrades.filter((t) => t.pnl > 0);
      const sPnl = d.currentValue - d.investedAmount;
      const sWinRate = sTrades.length > 0 ? (sWins.length / sTrades.length) * 100 : 0;

      return {
        id: d.id,
        strategyName: d.strategy.name,
        category: d.strategy.category,
        brokerName: d.broker.name,
        brokerUid: d.broker.uid,
        pair: d.pair,
        status: d.status,
        deployedAt: d.deployedAt,
        investedAmount: d.investedAmount,
        currentValue: d.currentValue,
        pnl: Math.round(sPnl * 100) / 100,
        pnlPercent: d.investedAmount > 0 ? Math.round((sPnl / d.investedAmount) * 10000) / 100 : 0,
        totalTrades: sTrades.length,
        openTrades: d.trades.filter((t) => t.status === "OPEN").length,
        winTrades: sWins.length,
        lossTrades: sTrades.length - sWins.length,
        winRate: Math.round(sWinRate * 10) / 10,
        totalFees: Math.round(sTrades.reduce((s, t) => s + t.fee, 0) * 100) / 100,
        bestTrade: sTrades.length > 0 ? Math.round(Math.max(...sTrades.map((t) => t.pnl)) * 100) / 100 : 0,
        worstTrade: sTrades.length > 0 ? Math.round(Math.min(...sTrades.map((t) => t.pnl)) * 100) / 100 : 0,
        recentTrades: d.trades.slice(-10).reverse().map((t) => ({
          id: t.id,
          pair: t.pair,
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          pnl: Math.round(t.pnl * 100) / 100,
          fee: t.fee,
          status: t.status,
          openedAt: t.openedAt,
          closedAt: t.closedAt,
        })),
      };
    });

    res.json({
      success: true,
      data: {
        overall: {
          totalInvested: Math.round(totalInvested * 100) / 100,
          totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
          totalPnl: Math.round(totalPnl * 100) / 100,
          totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
          activeStrategies: deployed.filter((d) => d.status === "ACTIVE").length,
          totalStrategies: deployed.length,
          totalTrades: closedTrades.length,
          openPositions: openTrades.length,
          winTrades: winTrades.length,
          lossTrades: lossTrades.length,
          winRate: Math.round(winRate * 10) / 10,
          totalFees: Math.round(totalFees * 100) / 100,
          avgWin: Math.round(avgWin * 100) / 100,
          avgLoss: Math.round(avgLoss * 100) / 100,
          bestTrade: Math.round(bestTrade * 100) / 100,
          worstTrade: Math.round(worstTrade * 100) / 100,
          profitFactor: profitFactor === Infinity ? -1 : Math.round(profitFactor * 100) / 100, // -1 = infinity
          pnlHistory,
          monthlyReturns,
        },
        strategies: strategyBreakdown,
      },
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
