import { Router, type Request, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../middleware/auth.js";
import { runBacktest } from "../engine/backtest-engine.js";
import { listBuiltinStrategies } from "../strategies/strategy-runner.js";
import { BACKTEST_COINS, type BacktestConfig } from "../types.js";

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

const VALID_PERIODS = ["1Y", "2Y", "3Y"] as const;
type PeriodLabel = (typeof VALID_PERIODS)[number];

// All backtest routes require auth
router.use(authenticate);

// GET /api/backtest/strategies — list built-in strategies
router.get("/strategies", (_req: Request, res: Response) => {
  const strategies = listBuiltinStrategies();
  res.json({ success: true, data: strategies });
});

// GET /api/backtest/coins — list available coins
router.get("/coins", (_req: Request, res: Response) => {
  res.json({ success: true, data: BACKTEST_COINS });
});

// POST /api/backtest/run — start a backtest
router.post("/run", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const body = req.body as BacktestConfig;

    // Validate
    if (!body.coin || !body.startDate || !body.endDate || !body.strategyName) {
      res.status(400).json({ success: false, error: "Missing required fields: coin, startDate, endDate, strategyName" });
      return;
    }

    const validCoin = BACKTEST_COINS.find((c) => c.short === body.coin.toUpperCase());
    if (!validCoin) {
      res.status(400).json({ success: false, error: `Invalid coin: ${body.coin}` });
      return;
    }

    const config: BacktestConfig = {
      coin: body.coin.toUpperCase(),
      startDate: body.startDate,
      endDate: body.endDate,
      strategyType: body.strategyType ?? "code",
      strategyName: body.strategyName,
      strategyConfig: body.strategyConfig ?? {},
      initialCapital: body.initialCapital ?? 10000,
      makerFee: body.makerFee ?? 0.0005,
      slippage: body.slippage ?? 0.0001,
    };

    // Create a pending backtest run
    const run = await prisma.backtestRun.create({
      data: {
        userId,
        coin: config.coin,
        startDate: new Date(config.startDate),
        endDate: new Date(config.endDate),
        strategyType: config.strategyType,
        strategyName: config.strategyName,
        strategyConfig: config.strategyConfig as object,
        initialCapital: config.initialCapital,
        status: "RUNNING",
        // Placeholder values — updated after backtest completes
        finalEquity: 0,
        totalPnl: 0,
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: 0,
        worstTrade: 0,
        equityCurve: [],
      },
    });

    // Run backtest asynchronously
    runBacktest(config)
      .then(async (result) => {
        // Save trades
        if (result.trades.length > 0) {
          await prisma.backtestTrade.createMany({
            data: result.trades.map((t) => ({
              backtestRunId: run.id,
              entryTime: new Date(t.entry_time),
              entryPrice: t.entry_price,
              qty: t.qty,
              side: t.side,
              leverage: t.leverage,
              sl: t.sl,
              tp: t.tp,
              exitTime: new Date(t.exit_time),
              exitPrice: t.exit_price,
              pnl: t.pnl,
              fee: t.fee,
              exitReason: t.exit_reason,
              status: "CLOSED",
            })),
          });
        }

        // Update run with results
        await prisma.backtestRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            finalEquity: result.finalEquity,
            totalPnl: result.metrics.totalPnl,
            grossPnl: result.metrics.grossPnl,
            totalFees: result.metrics.totalFees,
            makerFee: config.makerFee ?? 0.0005,
            slippage: config.slippage ?? 0.0001,
            totalTrades: result.metrics.totalTrades,
            winTrades: result.metrics.winTrades,
            lossTrades: result.metrics.lossTrades,
            winRate: result.metrics.winRate,
            maxDrawdown: result.metrics.maxDrawdown,
            sharpeRatio: result.metrics.sharpeRatio,
            profitFactor: result.metrics.profitFactor,
            avgWin: result.metrics.avgWin,
            avgLoss: result.metrics.avgLoss,
            bestTrade: result.metrics.bestTrade,
            worstTrade: result.metrics.worstTrade,
            equityCurve: result.equityCurve as unknown as object[],
            extendedMetrics: {
              largestWinTrades: result.metrics.largestWinTrades,
              largestLossTrades: result.metrics.largestLossTrades,
              avgBarsWinning: result.metrics.avgBarsWinning,
              avgBarsLosing: result.metrics.avgBarsLosing,
              avgDaysWinning: result.metrics.avgDaysWinning,
              avgDaysLosing: result.metrics.avgDaysLosing,
              drawdownCurve: result.metrics.drawdownCurve,
              cumulativePnlCurve: result.metrics.cumulativePnlCurve,
              mddRecoveryDays: result.metrics.mddRecoveryDays,
              tradeBlowoutCount: result.metrics.tradeBlowoutCount,
              tradeDoubleCount: result.metrics.tradeDoubleCount,
              equityBlowoutCount: result.metrics.equityBlowoutCount,
              equityDoubleCount: result.metrics.equityDoubleCount,
              peakEquity: result.metrics.peakEquity,
              lowestEquity: result.metrics.lowestEquity,
              maxDrawdownPercent: result.metrics.maxDrawdownPercent,
            } as unknown as object,
            duration: result.duration,
          },
        });

        console.log(`[Backtest] Run ${run.id} completed in ${result.duration}ms — ${result.metrics.totalTrades} trades, PnL: ${result.metrics.totalPnl.toFixed(2)}`);
      })
      .catch(async (err) => {
        console.error(`[Backtest] Run ${run.id} failed:`, (err as Error).message);
        await prisma.backtestRun.update({
          where: { id: run.id },
          data: { status: "FAILED" },
        });
      });

    res.json({ success: true, data: { id: run.id, status: "RUNNING" } });
  } catch (err) {
    console.error("[Backtest] Error:", (err as Error).message);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/backtest/runs — list user's backtest runs
router.get("/runs", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [runs, total] = await Promise.all([
      prisma.backtestRun.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          coin: true,
          startDate: true,
          endDate: true,
          strategyType: true,
          strategyName: true,
          initialCapital: true,
          finalEquity: true,
          totalPnl: true,
          totalTrades: true,
          winRate: true,
          maxDrawdown: true,
          status: true,
          duration: true,
          createdAt: true,
        },
      }),
      prisma.backtestRun.count({ where: { userId } }),
    ]);

    res.json({ success: true, data: { runs, total, page, limit } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/backtest/runs/:id — get backtest result
router.get("/runs/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const run = await prisma.backtestRun.findFirst({
      where: { id: req.params.id as string, userId },
    });

    if (!run) {
      res.status(404).json({ success: false, error: "Backtest run not found" });
      return;
    }

    res.json({ success: true, data: run });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/backtest/runs/:id/trades — get trades for a backtest
router.get("/runs/:id/trades", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verify ownership
    const run = await prisma.backtestRun.findFirst({
      where: { id: req.params.id as string, userId },
      select: { id: true },
    });

    if (!run) {
      res.status(404).json({ success: false, error: "Backtest run not found" });
      return;
    }

    const [trades, total] = await Promise.all([
      prisma.backtestTrade.findMany({
        where: { backtestRunId: run.id },
        orderBy: { entryTime: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.backtestTrade.count({ where: { backtestRunId: run.id } }),
    ]);

    res.json({ success: true, data: { trades, total, page, limit } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/backtest/runs/:id/equity — get equity curve
router.get("/runs/:id/equity", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const run = await prisma.backtestRun.findFirst({
      where: { id: req.params.id as string, userId },
      select: { equityCurve: true },
    });

    if (!run) {
      res.status(404).json({ success: false, error: "Backtest run not found" });
      return;
    }

    res.json({ success: true, data: run.equityCurve });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/backtest/runs/:id
router.delete("/runs/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const run = await prisma.backtestRun.findFirst({
      where: { id: req.params.id as string, userId },
      select: { id: true, isFeatured: true },
    });

    if (!run) {
      res.status(404).json({ success: false, error: "Backtest run not found" });
      return;
    }

    if (run.isFeatured) {
      res.status(400).json({
        success: false,
        error: "Run is featured. Unfeature it first before deleting.",
      });
      return;
    }

    // Delete trades first (cascade doesn't always work with deleteMany)
    await prisma.backtestTrade.deleteMany({ where: { backtestRunId: run.id } });
    await prisma.backtestRun.delete({ where: { id: run.id } });

    res.json({ success: true, message: "Backtest run deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/backtest/admin-check — is current user an admin?
router.get("/admin-check", async (req: Request, res: Response) => {
  const userId = (req as unknown as { user: { userId: string } }).user.userId;
  const admin = await isAdmin(userId);
  res.json({ success: true, data: { isAdmin: admin } });
});

// POST /api/backtest/runs/:id/feature — mark run as featured (admin only).
// Body: { strategyId, periodLabel }. Enforces uniqueness: only one featured run
// per (strategyId, coin, periodLabel) — replaces the old one if present.
router.post("/runs/:id/feature", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }

    const runId = req.params.id as string;
    const { strategyId, periodLabel } = req.body as {
      strategyId?: string;
      periodLabel?: PeriodLabel;
    };

    if (!strategyId || !periodLabel) {
      res.status(400).json({ success: false, error: "strategyId and periodLabel required" });
      return;
    }
    if (!VALID_PERIODS.includes(periodLabel)) {
      res.status(400).json({ success: false, error: `periodLabel must be one of ${VALID_PERIODS.join(", ")}` });
      return;
    }

    const run = await prisma.backtestRun.findUnique({
      where: { id: runId },
      select: { id: true, coin: true, status: true },
    });
    if (!run) {
      res.status(404).json({ success: false, error: "Run not found" });
      return;
    }
    if (run.status !== "COMPLETED") {
      res.status(400).json({ success: false, error: "Only COMPLETED runs can be featured" });
      return;
    }

    const strategy = await prisma.strategy.findUnique({ where: { id: strategyId }, select: { id: true } });
    if (!strategy) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }

    // Unfeature any existing run for this (strategy, coin, period) slot — we
    // only keep one featured run per slot so the public page has a single
    // answer to "show me BTC / 2Y for Meri Strategy".
    await prisma.backtestRun.updateMany({
      where: {
        featuredStrategyId: strategyId,
        coin: run.coin,
        periodLabel,
        isFeatured: true,
        id: { not: runId },
      },
      data: { isFeatured: false, featuredStrategyId: null, periodLabel: null },
    });

    const updated = await prisma.backtestRun.update({
      where: { id: runId },
      data: { isFeatured: true, featuredStrategyId: strategyId, periodLabel },
      select: { id: true, coin: true, periodLabel: true, featuredStrategyId: true, isFeatured: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/backtest/runs/:id/feature — unmark a run as featured (admin only)
router.delete("/runs/:id/feature", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }

    const runId = req.params.id as string;
    const run = await prisma.backtestRun.findUnique({ where: { id: runId }, select: { id: true } });
    if (!run) {
      res.status(404).json({ success: false, error: "Run not found" });
      return;
    }

    const updated = await prisma.backtestRun.update({
      where: { id: runId },
      data: { isFeatured: false, featuredStrategyId: null, periodLabel: null },
      select: { id: true, isFeatured: true },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
