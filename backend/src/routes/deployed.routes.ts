import { Router, type Response } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { strategyWorker } from "../workers/strategy-executor.js";
import type { AuthRequest } from "../types/index.js";

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

    const where: Prisma.DeployedStrategyWhereInput = { userId: req.user!.userId };
    if (brokerId && brokerId !== "all") where.brokerId = brokerId;
    if (status && status !== "all") where.status = status.toUpperCase() as "ACTIVE" | "PAUSED" | "STOPPED";

    const deployed = await prisma.deployedStrategy.findMany({
      where,
      include: {
        strategy: { select: { name: true, category: true } },
        broker: { select: { name: true, exchangeId: true } },
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
        broker: { select: { name: true, exchangeId: true } },
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

    await strategyWorker.startStrategy(deployed.id);

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

// Update status (pause / resume / stop)
router.patch("/:id/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!["ACTIVE", "PAUSED", "STOPPED"].includes(status)) {
      res.status(400).json({ success: false, error: "Invalid status" });
      return;
    }

    const deployed = await prisma.deployedStrategy.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!deployed) {
      res.status(404).json({ success: false, error: "Deployed strategy not found" });
      return;
    }

    const updated = await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status, stoppedAt: status === "STOPPED" ? new Date() : null },
    });

    if (status === "ACTIVE") {
      await strategyWorker.startStrategy(deployed.id);
    } else {
      strategyWorker.stopStrategy(deployed.id);
    }

    res.json({ success: true, data: updated });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
