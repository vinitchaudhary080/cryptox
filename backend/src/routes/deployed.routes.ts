import { Router, type Response } from "express";
import { z } from "zod";
import { PrismaClient, type Prisma } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { workerClient } from "../services/worker-client.js";
import type { AuthRequest } from "../types/index.js";
import { createNotification } from "../services/notification.service.js";
import {
  buildStrategyDeployedNotification,
  buildStrategyPausedNotification,
  buildStrategyResumedNotification,
  buildStrategyStoppedNotification,
} from "../services/notification-templates.js";

const router = Router();
const prisma = new PrismaClient();

// Admin-only feature gate — mirrors the pattern used in notification.routes.ts
// and backtest.routes.ts. Paper-mode deployments are restricted to admins.
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

/**
 * Stop the worker for a deployment and close all its open trades — but
 * never block the calling handler on worker failures. Both calls hit the
 * worker process over HTTP; if the worker is down, unreachable, broker
 * keys are invalid, or the exchange rejects the close order, we still
 * want to be able to PAUSE / STOP / DELETE the deployment row in the DB.
 *
 * Previously these were two unguarded `await`s inline in each handler.
 * One worker failure aborted the whole request — DB row stayed ACTIVE,
 * user got a 500, retry hit the same failure. Loop until manual SQL.
 *
 * Returns whatever the worker said about closed positions, or zeros if
 * the worker couldn't be reached. Logs a warning (not an error) on
 * worker failure so a missing worker doesn't pollute the error feed.
 */
async function tryStopAndClose(
  deployedId: string,
  context: string,
): Promise<{ closed: number; totalPnl: number; workerOk: boolean }> {
  let workerOk = true;
  try {
    await workerClient.stopStrategy(deployedId);
  } catch (err) {
    workerOk = false;
    console.warn(
      `[${context}] worker stopStrategy failed for ${deployedId}, continuing: ${(err as Error).message}`,
    );
  }
  try {
    const result = await workerClient.closeAllOpenTrades(deployedId);
    return { ...result, workerOk };
  } catch (err) {
    console.warn(
      `[${context}] worker closeAllOpenTrades failed for ${deployedId}, continuing: ${(err as Error).message}`,
    );
    return { closed: 0, totalPnl: 0, workerOk: false };
  }
}

const deploySchema = z.object({
  strategyId: z.string(),
  brokerId: z.string(),
  pair: z.string().min(1),
  investedAmount: z.number().positive(),
  config: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(["LIVE", "PAPER"]).optional(),
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

    // "Today" is computed from UTC midnight — crypto is 24×7 and exchanges
    // use UTC for daily settlement boundaries, so users see consistent
    // today-PnL regardless of which timezone they're viewing from.
    const todayStartUTC = new Date();
    todayStartUTC.setUTCHours(0, 0, 0, 0);

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

    // Sum today's realized PnL per deployed strategy in one round-trip
    // (Prisma groupBy aggregates server-side). Only CLOSED trades count
    // toward today's realized number — open positions remain unrealized.
    const todayPnlAgg = await prisma.trade.groupBy({
      by: ["deployedStrategyId"],
      where: {
        deployedStrategyId: { in: deployed.map((d) => d.id) },
        status: "CLOSED",
        closedAt: { gte: todayStartUTC },
      },
      _sum: { pnl: true },
    });
    const todayPnlMap = new Map<string, number>(
      todayPnlAgg.map((t) => [t.deployedStrategyId, t._sum.pnl ?? 0]),
    );

    const data = deployed.map((d) => {
      const totalPnl = d.currentValue - d.investedAmount;
      const totalPnlPercent = d.investedAmount > 0 ? (totalPnl / d.investedAmount) * 100 : 0;
      const closedTrades = d.trades.filter((t) => t.status === "CLOSED");
      const winRate = closedTrades.length > 0
        ? (closedTrades.filter((t) => t.pnl > 0).length / closedTrades.length) * 100
        : 0;
      const todayPnl = todayPnlMap.get(d.id) ?? 0;

      return {
        id: d.id,
        strategyName: d.strategy.name,
        strategyType: d.strategy.category,
        brokerName: d.broker.name,
        brokerUid: d.broker.uid,
        brokerId: d.brokerId,
        pair: d.pair,
        status: d.status,
        mode: d.mode,
        deployedAt: d.deployedAt,
        investedAmount: d.investedAmount,
        currentValue: d.currentValue,
        totalPnl: Math.round(totalPnl * 100) / 100,
        totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
        todayPnl: Math.round(todayPnl * 100) / 100,
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
    const mode = data.mode ?? "LIVE";

    // Paper-mode deployments are admin-only — enforced at the API boundary
    // so a non-admin can't bypass the UI gate by crafting a request.
    if (mode === "PAPER" && !(await isAdmin(req.user!.userId))) {
      res.status(403).json({ success: false, error: "Paper mode is admin-only" });
      return;
    }

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
        mode,
      },
      include: {
        strategy: { select: { name: true, category: true } },
        broker: { select: { name: true } },
      },
    });

    {
      const cfg = (deployed.config ?? {}) as Record<string, unknown>;
      const leverage = Math.max(1, Number(cfg.leverage ?? 1));
      const deployContent = buildStrategyDeployedNotification({
        strategyName: deployed.strategy.name,
        pair: deployed.pair,
        capital: data.investedAmount,
        leverage,
        mode: mode === "LIVE" ? "Live" : "Paper",
      });
      createNotification({
        userId: req.user!.userId,
        type: "strategy_deploy",
        title: deployContent.title,
        message: deployContent.message,
        telegramHtml: deployContent.telegramHtml,
        data: { pair: data.pair, strategyName: deployed.strategy.name, amount: data.investedAmount, deployedId: deployed.id },
      }).catch((e) => console.error("[deploy] notification failed:", e));
    }

    // Worker start is non-fatal — DB row is ACTIVE, worker.resumeAll() picks it up on next boot.
    try {
      await workerClient.startStrategy(deployed.id);
    } catch (err) {
      console.warn(
        `[deploy] worker start failed for ${deployed.id} — strategy saved as ACTIVE, will resume on worker boot. Error: ${(err as Error).message}`,
      );
    }

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

    // Stop worker + close trades (best-effort — worker failures don't block
    // the DB state change).
    const result = await tryStopAndClose(deployed.id, "pause");

    // Update status
    const updated = await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "PAUSED" },
      include: { strategy: { select: { name: true } } },
    });

    {
      const pauseContent = buildStrategyPausedNotification({
        strategyName: updated.strategy.name,
        pair: updated.pair,
        closedCount: result.closed,
        closedPnl: result.totalPnl,
      });
      createNotification({
        userId: req.user!.userId,
        type: "strategy_pause",
        title: pauseContent.title,
        message: pauseContent.message,
        telegramHtml: pauseContent.telegramHtml,
        data: {
          deployedId: updated.id,
          pair: updated.pair,
          strategyName: updated.strategy.name,
          closedCount: result.closed,
          closedPnl: result.totalPnl,
        },
      }).catch(() => {});
    }

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

    {
      const resumeContent = buildStrategyResumedNotification({
        strategyName: updated.strategy.name,
        pair: updated.pair,
      });
      createNotification({
        userId: req.user!.userId,
        type: "strategy_resume",
        title: resumeContent.title,
        message: resumeContent.message,
        telegramHtml: resumeContent.telegramHtml,
        data: {
          deployedId: updated.id,
          pair: updated.pair,
          strategyName: updated.strategy.name,
        },
      }).catch(() => {});
    }

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

    // Stop worker + close trades (best-effort — worker failures don't block
    // the DB state change).
    const result = await tryStopAndClose(deployed.id, "stop");

    // Mark as stopped
    const updated = await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "STOPPED", stoppedAt: new Date() },
      include: { strategy: { select: { name: true } } },
    });

    const reason = (req.body?.reason as string | undefined) ?? "user stopped";

    {
      const stopContent = buildStrategyStoppedNotification({
        strategyName: updated.strategy.name,
        pair: updated.pair,
        reason,
        closedCount: result.closed,
        closedPnl: result.totalPnl,
      });
      createNotification({
        userId: req.user!.userId,
        type: "strategy_stop",
        title: stopContent.title,
        message: stopContent.message,
        telegramHtml: stopContent.telegramHtml,
        data: {
          deployedId: updated.id,
          pair: updated.pair,
          strategyName: updated.strategy.name,
          closedCount: result.closed,
          closedPnl: result.totalPnl,
          reason,
        },
      }).catch(() => {});
    }

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

// Delete strategy — closes all trades + marks as DELETED (keeps data for reports).
// Soft delete: worker failures NEVER block the DB state change. Even if the
// worker is offline / broker keys are bad / exchange is down, the user can
// still remove the deployment from their view. Any open trades remain in
// the trades table but won't tick further (parent status != ACTIVE).
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

    // Already deleted? Treat as success (idempotent) — the user clicked the
    // trash icon, they want it gone. Returning 400 here is what was breaking
    // retry-after-failed-delete loops.
    if (deployed.status === "DELETED") {
      res.json({
        success: true,
        message: "Already removed.",
      });
      return;
    }

    // Best-effort worker cleanup. Always continue to DB update.
    const result = await tryStopAndClose(deployed.id, "delete");

    // Mark as DELETED (soft delete — keeps trades for reports)
    await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { status: "DELETED", stoppedAt: new Date() },
    });

    const cleanupNote = result.workerOk
      ? `Closed ${result.closed} positions (PnL: $${result.totalPnl}).`
      : `Worker was unreachable — deployment removed from view, any open trades frozen in history.`;

    res.json({
      success: true,
      message: `Removed. ${cleanupNote} Trade history preserved in reports.`,
    });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
