import { Router, type Response } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { workerClient } from "../services/worker-client.js";
import type { AuthRequest } from "../types/index.js";
import { createNotification } from "../services/notification.service.js";

const router = Router();
const prisma = new PrismaClient();

const deploySchema = z.object({
  strategyId: z.string(),
  brokerId: z.string(),
  pair: z.string().min(1),
  investedAmount: z.number().positive(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// List user's deployed strategies
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const brokerId = req.query.brokerId as string | undefined;
    const status = req.query.status as string | undefined;

    const where: Prisma.DeployedStrategyWhereInput = {
      userId: req.user!.userId,
      status: { not: "DELETED" }, // hide deleted from deployed page
    };
    if (brokerId && brokerId !== "all") where.brokerId = brokerId;
    if (status && status !== "all") where.status = status.toUpperCase() as "ACTIVE" | "PAUSED" | "STOPPED";

    const deployed = await prisma.deployedStrategy.findMany({
      where,
      include: {
        strategy: { select: { name: true, category: true } },
        broker: { select: { name: true, uid: true, exchangeId: true } },
        trades: { orderBy: { openedAt: "desc" }, take: 10 },
        _count: { select: { trades: true } },
      },
      orderBy: { deployedAt: "desc" },
    });

    const data = deployed.map((d) => {
      const totalPnl = d.currentValue - d.investedAmount;
      const totalPnlPercent = d.investedAmount > 0 ? (totalPnl / d.investedAmount) * 100 : 0;
      const closedTrades = d.trades.filter((t) => t.status === "CLOSED");
      const winRate = closedTrades.length > 0
        ? (closedTrades.filter((t) => t.pnl > 0).length / closedTrades.length) * 100
        : 0;

      return {
        id: d.id,
        strategyName: d.strategy.name,
        strategyType: d.strategy.category,
        brokerName: d.broker.name,
        brokerUid: d.broker.uid,
        brokerId: d.brokerId,
        pair: d.pair,
        status: d.status,
        deployedAt: d.deployedAt,
        investedAmount: d.investedAmount,
        currentValue: d.currentValue,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
        totalTrades: d._count.trades,
        winRate: Math.round(winRate),
        openPositions: d.trades.filter((t) => t.status === "OPEN").length,
      };
    });

    res.json({ success: true, data });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get deployed strategy detail with all trades
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
      include: {
        strategy: true,
        broker: { select: { name: true, uid: true, exchangeId: true } },
        trades: { orderBy: { openedAt: "desc" } },
      },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Deployed strategy not found" });
      return;
    }
    res.json({ success: true, data: deployed });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get trades for a deployed strategy
router.get("/:id/trades", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const status = req.query.status as string | undefined;

    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
      select: { id: true },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }

    const where: Prisma.TradeWhereInput = { deployedStrategyId: id };
    if (status === "OPEN" || status === "CLOSED") where.status = status;

    const trades = await prisma.trade.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: 100,
    });

    res.json({ success: true, data: trades });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Deploy a strategy
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = deploySchema.parse(req.body);

    const [strategy, broker] = await Promise.all([
      prisma.strategy.findUnique({ where: { id: data.strategyId } }),
      prisma.broker.findFirst({ where: { id: data.brokerId, userId: req.user!.userId, status: "CONNECTED" } }),
    ]);

    if (!strategy) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }
    if (!broker) {
      res.status(404).json({ success: false, error: "Broker not found or not connected" });
      return;
    }

    const deployed = await prisma.deployedStrategy.create({
      data: {
        userId: req.user!.userId,
        strategyId: data.strategyId,
        brokerId: data.brokerId,
        pair: data.pair,
        investedAmount: data.investedAmount,
        currentValue: data.investedAmount,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
        status: "ACTIVE",
      },
      include: {
        strategy: { select: { name: true, category: true } },
        broker: { select: { name: true } },
      },
    });

    await workerClient.startStrategy(deployed.id);

    createNotification({
      userId: req.user!.userId,
      type: "strategy_deploy",
      title: `Strategy Deployed`,
      message: `${deployed.strategy.name} deployed on ${deployed.pair} with $${data.investedAmount}`,
      data: { pair: data.pair, strategyName: deployed.strategy.name, amount: data.investedAmount, deployedId: deployed.id },
    }).catch(() => {});

    res.status(201).json({ success: true, data: deployed });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0].message });
      return;
    }
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// Pause strategy — stops worker + closes all open trades
router.patch("/:id/pause", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Deployed strategy not found" });
      return;
    }
    if (deployed.status !== "ACTIVE") {
      res.status(400).json({ success: false, error: "Strategy is not active" });
      return;
    }

    // 1. Stop the worker
    await workerClient.stopStrategy(deployed.id);

    // 2. Close all open trades at current market price
    const result = await workerClient.closeAllOpenTrades(deployed.id);

    // 3. Update status
    const updated = await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "PAUSED" },
      include: { strategy: { select: { name: true } } },
    });

    createNotification({
      userId: req.user!.userId,
      type: "strategy_pause",
      title: "Strategy Paused",
      message: `${updated.strategy.name} on ${updated.pair} paused. Closed ${result.closed} position(s) at PnL $${result.totalPnl.toFixed(2)}`,
      data: {
        deployedId: updated.id,
        pair: updated.pair,
        strategyName: updated.strategy.name,
        closedCount: result.closed,
        closedPnl: result.totalPnl,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: updated,
      message: `Paused. Closed ${result.closed} positions (PnL: $${result.totalPnl})`,
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Resume strategy — restarts the worker
router.patch("/:id/resume", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Deployed strategy not found" });
      return;
    }
    if (deployed.status !== "PAUSED") {
      res.status(400).json({ success: false, error: "Strategy is not paused" });
      return;
    }

    const updated = await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "ACTIVE" },
      include: { strategy: { select: { name: true } } },
    });

    await workerClient.startStrategy(deployed.id);

    createNotification({
      userId: req.user!.userId,
      type: "strategy_resume",
      title: "Strategy Resumed",
      message: `${updated.strategy.name} on ${updated.pair} is active again`,
      data: {
        deployedId: updated.id,
        pair: updated.pair,
        strategyName: updated.strategy.name,
      },
    }).catch(() => {});

    res.json({ success: true, data: updated, message: "Strategy resumed" });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Stop strategy — stops worker + closes all trades + marks stopped permanently
router.patch("/:id/stop", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Deployed strategy not found" });
      return;
    }
    if (deployed.status === "STOPPED") {
      res.status(400).json({ success: false, error: "Strategy is already stopped" });
      return;
    }

    // 1. Stop worker
    await workerClient.stopStrategy(deployed.id);

    // 2. Close all open trades
    const result = await workerClient.closeAllOpenTrades(deployed.id);

    // 3. Mark as stopped
    const updated = await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "STOPPED", stoppedAt: new Date() },
      include: { strategy: { select: { name: true } } },
    });

    const reason = (req.body?.reason as string | undefined) ?? "user stopped";

    createNotification({
      userId: req.user!.userId,
      type: "strategy_stop",
      title: "Strategy Stopped",
      message: `${updated.strategy.name} on ${updated.pair} stopped (${reason}). Closed ${result.closed} position(s) at PnL $${result.totalPnl.toFixed(2)}`,
      data: {
        deployedId: updated.id,
        pair: updated.pair,
        strategyName: updated.strategy.name,
        closedCount: result.closed,
        closedPnl: result.totalPnl,
        reason,
      },
    }).catch(() => {});

    res.json({
      success: true,
      data: updated,
      message: `Stopped. Closed ${result.closed} positions (PnL: $${result.totalPnl})`,
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete strategy — closes all trades + marks as DELETED (keeps data for reports)
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Deployed strategy not found" });
      return;
    }

    // 1. Stop the worker if running
    await workerClient.stopStrategy(deployed.id);

    // 2. Close all open trades at market price
    const result = await workerClient.closeAllOpenTrades(deployed.id);

    // 3. Mark as DELETED (soft delete — keeps trades for reports)
    await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "DELETED", stoppedAt: new Date() },
    });

    res.json({
      success: true,
      message: `Removed. Closed ${result.closed} positions (PnL: $${result.totalPnl}). Trade history preserved in reports.`,
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
