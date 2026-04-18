import { Router, type Request, type Response } from "express";
import { PrismaClient, RiskLevel } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import {
  isLiveSyncConfigured,
  pushStrategyToLive,
  LiveSyncDisabledError,
  LiveSyncRequestError,
} from "../services/live-sync.service.js";

const router = Router();
const prisma = new PrismaClient();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
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

// List all available strategies (system templates)
router.get("/", async (_req: Request, res: Response) => {
  try {
    const strategies = await prisma.strategy.findMany({
      where: { isSystem: true, isVisible: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: strategies });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get single strategy
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const strategy = await prisma.strategy.findUnique({ where: { id } });
    if (!strategy) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }
    res.json({ success: true, data: strategy });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/strategies/:id/featured-backtests — public. Returns all featured
// backtest runs for this strategy, grouped by coin + period so the strategy
// detail page can render tabs.
router.get("/:id/featured-backtests", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const runs = await prisma.backtestRun.findMany({
      where: { featuredStrategyId: id, isFeatured: true, status: "COMPLETED" },
      orderBy: [{ coin: "asc" }, { periodLabel: "asc" }],
      select: {
        id: true,
        coin: true,
        periodLabel: true,
        startDate: true,
        endDate: true,
        strategyName: true,
        strategyConfig: true,
        initialCapital: true,
        finalEquity: true,
        totalPnl: true,
        grossPnl: true,
        totalFees: true,
        makerFee: true,
        slippage: true,
        totalTrades: true,
        winTrades: true,
        lossTrades: true,
        winRate: true,
        maxDrawdown: true,
        sharpeRatio: true,
        profitFactor: true,
        avgWin: true,
        avgLoss: true,
        bestTrade: true,
        worstTrade: true,
        equityCurve: true,
        extendedMetrics: true,
        status: true,
        duration: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: runs });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/strategies/:id/featured-backtests/:runId/trades — public.
// Returns all trades for a featured backtest run (same payload shape as the
// authenticated /backtest/runs/:id/trades endpoint).
router.get("/:id/featured-backtests/:runId/trades", async (req: Request, res: Response) => {
  try {
    const strategyId = req.params.id as string;
    const runId = req.params.runId as string;

    // Only expose trades for runs that are actually featured on this strategy
    const run = await prisma.backtestRun.findFirst({
      where: { id: runId, featuredStrategyId: strategyId, isFeatured: true },
      select: { id: true },
    });
    if (!run) {
      res.status(404).json({ success: false, error: "Featured run not found" });
      return;
    }

    const trades = await prisma.backtestTrade.findMany({
      where: { backtestRunId: run.id },
      orderBy: { entryTime: "asc" },
    });

    res.json({ success: true, data: { trades, total: trades.length } });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/strategies/:id/push-to-live — admin. Pushes a local strategy row
// to the live DB so the strategy shows up on algopulse.in's strategy page.
router.post("/:id/push-to-live", authenticate, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }
    if (!isLiveSyncConfigured()) {
      res.status(400).json({
        success: false,
        error: "Live sync not configured. Set LIVE_API_URL / LIVE_ADMIN_EMAIL / LIVE_ADMIN_PASSWORD in backend/.env",
      });
      return;
    }

    const strategy = await prisma.strategy.findUnique({ where: { id } });
    if (!strategy) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }

    await prisma.strategy.update({
      where: { id },
      data: { liveSyncStatus: "pushing" },
    });

    try {
      await pushStrategyToLive({
        strategy: {
          id: strategy.id,
          name: strategy.name,
          description: strategy.description,
          category: strategy.category,
          riskLevel: strategy.riskLevel,
          config: strategy.config,
          isSystem: strategy.isSystem,
          isVisible: strategy.isVisible,
        },
      });

      const updated = await prisma.strategy.update({
        where: { id },
        data: { liveSyncStatus: "synced", liveSyncAt: new Date() },
        select: { id: true, liveSyncStatus: true, liveSyncAt: true },
      });

      res.json({ success: true, data: updated });
    } catch (syncErr) {
      await prisma.strategy.update({
        where: { id },
        data: { liveSyncStatus: "error" },
      });
      if (syncErr instanceof LiveSyncDisabledError) {
        res.status(400).json({ success: false, error: syncErr.message });
        return;
      }
      if (syncErr instanceof LiveSyncRequestError) {
        res.status(502).json({ success: false, error: syncErr.message });
        return;
      }
      throw syncErr;
    }
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/strategies/import — admin. Called by LOCAL backend's push-to-live
// endpoint to upsert a strategy row on this (live) DB.
router.post("/import", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }

    const body = req.body as {
      strategy?: {
        id?: string;
        name?: string;
        description?: string;
        category?: string;
        riskLevel?: RiskLevel;
        config?: Record<string, unknown>;
        isSystem?: boolean;
        isVisible?: boolean;
      };
    };
    const s = body.strategy;
    if (!s?.id || !s.name || !s.description || !s.category || !s.riskLevel) {
      res.status(400).json({
        success: false,
        error: "strategy.id, name, description, category, riskLevel are required",
      });
      return;
    }

    const upserted = await prisma.strategy.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        riskLevel: s.riskLevel,
        config: (s.config ?? {}) as object,
        isSystem: s.isSystem ?? true,
        isVisible: s.isVisible ?? true,
      },
      update: {
        name: s.name,
        description: s.description,
        category: s.category,
        riskLevel: s.riskLevel,
        config: (s.config ?? {}) as object,
        isSystem: s.isSystem ?? true,
        isVisible: s.isVisible ?? true,
      },
      select: { id: true, name: true },
    });

    res.json({ success: true, data: { strategyId: upserted.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/strategies/admin/sync-status — admin. Returns all system strategies
// with their liveSyncStatus so the admin UI can show badges.
router.get("/admin/sync-status", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }

    const strategies = await prisma.strategy.findMany({
      where: { isSystem: true },
      select: {
        id: true,
        name: true,
        isVisible: true,
        liveSyncStatus: true,
        liveSyncAt: true,
      },
    });
    res.json({ success: true, data: strategies });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
