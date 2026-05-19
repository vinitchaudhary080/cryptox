import { Router, type Request, type Response } from "express";
import { PrismaClient, RiskLevel } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate } from "../middleware/auth.js";
import { env } from "../config/env.js";
import {
  isLiveSyncConfigured,
  pushStrategyToLive,
  LiveSyncDisabledError,
  LiveSyncRequestError,
} from "../services/live-sync.service.js";
import { getStrategyByName } from "../backtest/strategies/strategy-runner.js";

// Resolve path to the builtin/ folder relative to THIS file. Used by the
// pre-flight validator to confirm a strategy's `.ts` file is on disk
// before letting its DB row be pushed to live. Keeps backtest = live.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.resolve(__dirname, "../backtest/strategies/builtin");

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

    // Surface aggregate stats from each strategy's featured backtest runs
    // so the strategy-list cards render real 30D Return / Win Rate / Total
    // Trades instead of 0/0/0. Picks the highest-PnL featured run as the
    // headline number — same logic as a "best-coin highlight" badge would
    // do. Without this, the frontend falls back to a hardcoded mock-data
    // lookup that only knows about pre-2026 legacy strategy names.
    const ids = strategies.map((s) => s.id);
    const featured = await prisma.backtestRun.findMany({
      where: {
        featuredStrategyId: { in: ids },
        isFeatured: true,
        status: "COMPLETED",
      },
      select: {
        featuredStrategyId: true,
        coin: true,
        totalPnl: true,
        initialCapital: true,
        winRate: true,
        totalTrades: true,
      },
    });

    // Group featured runs by strategy → keep best run per coin (so duplicate
    // coin entries don't crowd the AlgoPulse Picks badges), then sort top 5
    // overall by return %.
    const runsByStrategy = new Map<string, (typeof featured)[number][]>();
    for (const run of featured) {
      const key = run.featuredStrategyId ?? "";
      if (!runsByStrategy.has(key)) runsByStrategy.set(key, []);
      runsByStrategy.get(key)!.push(run);
    }

    const enriched = strategies.map((s) => {
      const runs = runsByStrategy.get(s.id) ?? [];
      // Best run per coin (highest PnL when the same coin has multiple runs)
      const bestPerCoin = new Map<string, (typeof featured)[number]>();
      for (const r of runs) {
        const existing = bestPerCoin.get(r.coin);
        if (!existing || (r.totalPnl ?? 0) > (existing.totalPnl ?? -Infinity)) {
          bestPerCoin.set(r.coin, r);
        }
      }
      // Convert to coin-stat objects, sort by return % desc, take top 5
      const topCoins = Array.from(bestPerCoin.values())
        .map((r) => ({
          coin: r.coin,
          returnRate: r.initialCapital > 0
            ? Math.round((r.totalPnl / r.initialCapital) * 100 * 10) / 10
            : 0,
          winRate: Math.round((r.winRate ?? 0) * 10) / 10,
          totalTrades: r.totalTrades ?? 0,
        }))
        .sort((a, b) => b.returnRate - a.returnRate)
        .slice(0, 5);

      // Card headline stats — use top-1 from topCoins for backward compat.
      const headline = topCoins[0];
      return {
        ...s,
        returnRate: headline?.returnRate ?? 0,
        winRate: headline?.winRate ?? 0,
        totalTrades: headline?.totalTrades ?? 0,
        featuredCoin: headline?.coin ?? null,
        topCoins,
      };
    });

    res.json({ success: true, data: enriched });
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

    // ── PRE-FLIGHT VALIDATOR ─────────────────────────────────────
    // Push-to-live is meaningless if the strategy's algorithm code
    // doesn't exist + isn't registered. The DB row would land on prod
    // but the live worker couldn't execute it — falls back to generic
    // category handler (the bug from May 18 that caused backtest ≠ live
    // PnL divergence). Block the push at the source instead.
    //
    // Two checks:
    //   1. `getStrategyByName(id)` returns non-null  →  registered in
    //      BUILTIN_STRATEGIES (strategy-runner.ts)
    //   2. The .ts file physically exists on disk  →  git-committed
    //      and ready to be deployed to prod via `git push + npm build`
    const registered = getStrategyByName(id);
    const filePath = path.join(BUILTIN_DIR, `${id}.ts`);
    const fileExists = existsSync(filePath);
    if (!registered || !fileExists) {
      const problems: string[] = [];
      if (!registered) {
        problems.push(
          `'${id}' is not registered in BUILTIN_STRATEGIES (strategy-runner.ts). Import + register first.`,
        );
      }
      if (!fileExists) {
        problems.push(
          `Strategy file missing on disk: backend/src/backtest/strategies/builtin/${id}.ts`,
        );
      }
      res.status(400).json({
        success: false,
        error:
          "Strategy code is not ready for live deployment. " +
          problems.join(" ") +
          " Push-to-live blocked because the prod worker has no algorithm to execute — would fall back to generic category handler (backtest ≠ live).",
      });
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

// DELETE /api/strategies/:id — local-dev only. Cascade-deletes the strategy
// along with every dependent row (deployedStrategies, their trades, and any
// featured-backtest references). Designed to clean up test data on a local
// machine; permanently disabled in production.
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  if (env.nodeEnv === "production") {
    res.status(404).json({ success: false, error: "Not found" });
    return;
  }
  try {
    const id = req.params.id as string;

    const strategy = await prisma.strategy.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!strategy) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }

    const deployed = await prisma.deployedStrategy.findMany({
      where: { strategyId: id },
      select: { id: true },
    });
    const deployedIds = deployed.map((d) => d.id);

    await prisma.$transaction([
      // 1. Trades attached to this strategy's deployments
      prisma.trade.deleteMany({ where: { deployedStrategyId: { in: deployedIds } } }),
      // 2. Deployments themselves
      prisma.deployedStrategy.deleteMany({ where: { strategyId: id } }),
      // 3. Featured-backtest pointer (column is nullable on BacktestRun)
      prisma.backtestRun.updateMany({
        where: { featuredStrategyId: id },
        data: { featuredStrategyId: null, isFeatured: false, periodLabel: null },
      }),
      // 4. The strategy row itself
      prisma.strategy.delete({ where: { id } }),
    ]);

    res.json({
      success: true,
      data: {
        id,
        name: strategy.name,
        deletedDeployments: deployedIds.length,
      },
    });
  } catch (err) {
    console.error("[strategy:delete]", err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
