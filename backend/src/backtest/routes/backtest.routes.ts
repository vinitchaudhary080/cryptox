import { Router, type Request, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../../middleware/auth.js";
import { runBacktest } from "../engine/backtest-engine.js";
import { listBuiltinStrategies } from "../strategies/strategy-runner.js";
import { BACKTEST_COINS, type BacktestConfig } from "../types.js";
import {
  isLiveSyncConfigured,
  pushFeaturedBacktestToLive,
  LiveSyncDisabledError,
  LiveSyncRequestError,
} from "../../services/live-sync.service.js";

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

// GET /api/backtest/strategies — list built-in strategies that are also
// marked visible in the DB. This lets us hide candidates from the dropdown
// without removing them from the code registry (so existing backtest runs
// and deployments referencing those keys still resolve correctly).
router.get("/strategies", async (_req: Request, res: Response) => {
  const all = listBuiltinStrategies();
  // Pull human-readable name + createdAt for ordering. Returning the
  // DB `name` (e.g. "Z-Score Mean Reversion 15m") instead of the slug
  // (e.g. "07-zscore-mean-reversion-15m") makes the strategy dropdown
  // readable. Order newest-first so the most recently added strategy
  // sits at the top.
  const visibleRows = await prisma.strategy.findMany({
    where: { isVisible: true },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const metaById = new Map(visibleRows.map((r) => [r.id, r]));
  const enriched = all
    .filter((s) => metaById.has(s.name))
    .map((s) => ({
      name: s.name, // slug — kept for backwards compat (used as the API value)
      displayName: metaById.get(s.name)!.name,
      createdAt: metaById.get(s.name)!.createdAt,
      description: s.description,
      defaultConfig: s.defaultConfig,
    }));
  // Sort by createdAt DESC (newest first) — newly-added strategies surface
  // first without forcing the user to scroll.
  enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ success: true, data: enriched });
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

    // Validate TradingView-style sizing mode + value.
    //   contracts        → sizingValue > 0 (raw qty)
    //   fixed_cash       → sizingValue > 0 (dollars)
    //   percent_equity   → 1 ≤ sizingValue ≤ 100
    const validModes: readonly string[] = ["contracts", "fixed_cash", "percent_equity"];
    const sizingMode = typeof body.sizingMode === "string" && validModes.includes(body.sizingMode)
      ? (body.sizingMode as "contracts" | "fixed_cash" | "percent_equity")
      : undefined;
    const sizingValue = sizingMode ? Number(body.sizingValue) : undefined;
    const enforceMinMargin = body.enforceMinMargin === false ? false : true;

    if (sizingMode && !(Number.isFinite(sizingValue) && (sizingValue as number) > 0)) {
      res.status(400).json({ success: false, error: "sizingValue must be a positive number" });
      return;
    }
    if (sizingMode === "percent_equity" && (sizingValue as number) > 100) {
      res.status(400).json({ success: false, error: "percent_equity: sizingValue must be between 1 and 100" });
      return;
    }

    const capital = Number(body.initialCapital ?? 10000);

    const config: BacktestConfig = {
      coin: body.coin.toUpperCase(),
      startDate: body.startDate,
      endDate: body.endDate,
      strategyType: body.strategyType ?? "code",
      strategyName: body.strategyName,
      strategyConfig: body.strategyConfig ?? {},
      initialCapital: capital,
      makerFee: body.makerFee ?? 0.0005,
      slippage: body.slippage ?? 0.0001,
      sizingMode,
      sizingValue,
      enforceMinMargin,
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
        // Persist sizing metadata inside strategyConfig so it round-trips on
        // the report page without needing a DB migration.
        strategyConfig: {
          ...(config.strategyConfig as Record<string, unknown>),
          ...(config.sizingMode ? { _sizingMode: config.sizingMode } : {}),
          ...(config.sizingValue != null ? { _sizingValue: config.sizingValue } : {}),
          ...(config.enforceMinMargin === false ? { _enforceMinMargin: false } : {}),
        } as object,
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
              status: t.status,
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
              marginCallCount: result.metrics.marginCallCount,
              marginCallTopUpTo50Total: result.metrics.marginCallTopUpTo50Total,
              marginCallTopUpToInitialTotal: result.metrics.marginCallTopUpToInitialTotal,
              marginCallLowestEquity: result.metrics.marginCallLowestEquity,
              liquidationCount: result.metrics.liquidationCount,
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

/**
 * GET /api/backtest/runs/:id/sanity-check
 *
 * Validates that a backtest run's trades are mathematically + logically
 * consistent — same checks that exposed the inverted-SL bug in z-score MR.
 * Used by the batch-backtest flow to filter out simulations that look
 * profitable on paper but are actually engine artifacts.
 *
 * Returns `ok: true` only when ALL these hold:
 *   1) No "SL" exit ended in profit (BUY: exit < entry, SELL: exit > entry).
 *      Stop-losses by definition lose money.
 *   2) No "TP" exit ended in loss (mirror of #1).
 *   3) Sum of per-trade pnl matches run.totalPnl within $0.10 tolerance.
 *   4) No NaN / Infinity in headline metrics.
 *   5) At least one closed trade exists.
 *
 * `issues` is a human-readable list — empty array when ok.
 */
router.get("/runs/:id/sanity-check", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    const runId = req.params.id as string;

    const run = await prisma.backtestRun.findFirst({
      where: { id: runId, userId },
      select: {
        id: true,
        coin: true,
        status: true,
        totalPnl: true,
        totalTrades: true,
        winRate: true,
        maxDrawdown: true,
        initialCapital: true,
        profitFactor: true,
        avgWin: true,
        avgLoss: true,
      },
    });
    if (!run) {
      res.status(404).json({ success: false, error: "Run not found" });
      return;
    }

    const issues: string[] = [];
    const stats = { slWithProfit: 0, tpWithLoss: 0, invertedSls: 0, pnlSumDiff: 0 };

    if (run.status !== "COMPLETED") {
      issues.push(`status is ${run.status}, not COMPLETED`);
    }

    if (!Number.isFinite(run.totalPnl) || !Number.isFinite(run.maxDrawdown)
        || !Number.isFinite(run.profitFactor) || !Number.isFinite(run.winRate)) {
      issues.push("headline metrics contain NaN/Infinity");
    }

    // Trade-level checks
    const trades = await prisma.backtestTrade.findMany({
      where: { backtestRunId: runId },
      select: { side: true, entryPrice: true, exitPrice: true, pnl: true, exitReason: true, status: true },
    });

    if (run.status === "COMPLETED" && trades.length === 0) {
      issues.push("no trades recorded");
    }

    let pnlSum = 0;
    for (const t of trades) {
      if (t.status !== "CLOSED" || t.exitPrice == null) continue;
      pnlSum += t.pnl;

      const isBuy = t.side === "BUY";
      const priceMovedFavorably = isBuy ? t.exitPrice > t.entryPrice : t.exitPrice < t.entryPrice;

      if (t.exitReason === "SL" && t.pnl > 0) {
        stats.slWithProfit++;
        if (priceMovedFavorably) stats.invertedSls++;
      }
      if (t.exitReason === "TP" && t.pnl < 0) {
        stats.tpWithLoss++;
      }
    }

    if (stats.slWithProfit > 0) {
      issues.push(`${stats.slWithProfit} "SL" exits ended in profit (engine artifact, e.g. inverted-SL bug)`);
    }
    if (stats.tpWithLoss > 0) {
      issues.push(`${stats.tpWithLoss} "TP" exits ended in loss`);
    }

    stats.pnlSumDiff = Math.abs(pnlSum - run.totalPnl);
    if (stats.pnlSumDiff > 0.1) {
      issues.push(`pnl sum mismatch: trades=$${pnlSum.toFixed(2)}, run=$${run.totalPnl.toFixed(2)}`);
    }

    res.json({ success: true, data: { ok: issues.length === 0, issues, stats } });
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

// GET /api/backtest/live-sync-config — admin, returns whether live-sync env
// vars are set. Frontend hides the 'Push to Live' button if this is false.
router.get("/live-sync-config", async (req: Request, res: Response) => {
  const userId = (req as unknown as { user: { userId: string } }).user.userId;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ success: false, error: "Admin only" });
    return;
  }
  res.json({ success: true, data: { enabled: isLiveSyncConfigured() } });
});

// POST /api/backtest/runs/:id/push-to-live — admin. Pushes a featured run +
// trades to the live DB via the prod API. Updates local liveSyncStatus.
router.post("/runs/:id/push-to-live", async (req: Request, res: Response) => {
  const runId = req.params.id as string;
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

    const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
    if (!run) {
      res.status(404).json({ success: false, error: "Run not found" });
      return;
    }
    if (!run.isFeatured || !run.featuredStrategyId || !run.periodLabel) {
      res.status(400).json({
        success: false,
        error: "Only featured runs can be pushed (run must have isFeatured + periodLabel + featuredStrategyId)",
      });
      return;
    }

    // Mark pushing so UI can reflect the in-flight state
    await prisma.backtestRun.update({
      where: { id: run.id },
      data: { liveSyncStatus: "pushing" },
    });

    const trades = await prisma.backtestTrade.findMany({
      where: { backtestRunId: run.id },
      orderBy: { entryTime: "asc" },
    });

    try {
      const { runId: liveRunId } = await pushFeaturedBacktestToLive({
        run: {
          id: run.id,
          coin: run.coin,
          startDate: run.startDate,
          endDate: run.endDate,
          strategyType: run.strategyType,
          strategyName: run.strategyName,
          strategyConfig: run.strategyConfig,
          initialCapital: run.initialCapital,
          finalEquity: run.finalEquity,
          totalPnl: run.totalPnl,
          grossPnl: run.grossPnl,
          totalFees: run.totalFees,
          makerFee: run.makerFee,
          slippage: run.slippage,
          totalTrades: run.totalTrades,
          winTrades: run.winTrades,
          lossTrades: run.lossTrades,
          winRate: run.winRate,
          maxDrawdown: run.maxDrawdown,
          sharpeRatio: run.sharpeRatio,
          profitFactor: run.profitFactor,
          avgWin: run.avgWin,
          avgLoss: run.avgLoss,
          bestTrade: run.bestTrade,
          worstTrade: run.worstTrade,
          equityCurve: run.equityCurve,
          extendedMetrics: run.extendedMetrics,
          status: run.status,
          duration: run.duration,
          periodLabel: run.periodLabel,
          featuredStrategyId: run.featuredStrategyId,
        },
        trades: trades.map((t) => ({
          entryTime: t.entryTime,
          entryPrice: t.entryPrice,
          qty: t.qty,
          side: t.side,
          leverage: t.leverage,
          sl: t.sl,
          tp: t.tp,
          exitTime: t.exitTime,
          exitPrice: t.exitPrice,
          pnl: t.pnl,
          fee: t.fee,
          exitReason: t.exitReason,
          status: t.status,
        })),
      });

      await prisma.backtestRun.update({
        where: { id: run.id },
        data: { liveSyncStatus: "synced", liveSyncAt: new Date() },
      });

      res.json({ success: true, data: { liveRunId, syncedAt: new Date() } });
    } catch (syncErr) {
      await prisma.backtestRun.update({
        where: { id: run.id },
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

// POST /api/backtest/featured/import — admin. Called by LOCAL backend's push
// endpoint to land a featured run on this (live) DB. Idempotent:
// (featuredStrategyId, coin, periodLabel) is a unique slot, re-import replaces.
router.post("/featured/import", async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { userId: string } }).user.userId;
    if (!(await isAdmin(userId))) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }

    const body = req.body as {
      run?: Record<string, unknown> & {
        coin?: string;
        periodLabel?: string;
        featuredStrategyId?: string;
      };
      trades?: Array<Record<string, unknown>>;
    };

    const run = body.run;
    if (!run || !run.coin || !run.periodLabel || !run.featuredStrategyId) {
      res.status(400).json({ success: false, error: "run.coin, run.periodLabel, run.featuredStrategyId required" });
      return;
    }

    // Verify target strategy exists on this DB
    const strategy = await prisma.strategy.findUnique({
      where: { id: run.featuredStrategyId },
      select: { id: true },
    });
    if (!strategy) {
      res.status(404).json({
        success: false,
        error: `Strategy "${run.featuredStrategyId}" does not exist on live — push the strategy first, then retry`,
      });
      return;
    }

    // Clear any existing featured run for this slot, then insert fresh
    const existing = await prisma.backtestRun.findMany({
      where: {
        featuredStrategyId: run.featuredStrategyId,
        coin: run.coin,
        periodLabel: run.periodLabel,
        isFeatured: true,
      },
      select: { id: true },
    });
    const existingIds = existing.map((r) => r.id);

    const inserted = await prisma.$transaction(async (tx) => {
      if (existingIds.length > 0) {
        await tx.backtestTrade.deleteMany({ where: { backtestRunId: { in: existingIds } } });
        await tx.backtestRun.deleteMany({ where: { id: { in: existingIds } } });
      }

      const created = await tx.backtestRun.create({
        data: {
          userId, // owner on live = the admin who pushed
          coin: String(run.coin),
          startDate: new Date(run.startDate as string),
          endDate: new Date(run.endDate as string),
          strategyType: String(run.strategyType ?? "code"),
          strategyName: String(run.strategyName ?? ""),
          strategyConfig: (run.strategyConfig ?? {}) as object,
          initialCapital: Number(run.initialCapital ?? 0),
          finalEquity: Number(run.finalEquity ?? 0),
          totalPnl: Number(run.totalPnl ?? 0),
          grossPnl: Number(run.grossPnl ?? 0),
          totalFees: Number(run.totalFees ?? 0),
          makerFee: Number(run.makerFee ?? 0.0005),
          slippage: Number(run.slippage ?? 0.0001),
          totalTrades: Number(run.totalTrades ?? 0),
          winTrades: Number(run.winTrades ?? 0),
          lossTrades: Number(run.lossTrades ?? 0),
          winRate: Number(run.winRate ?? 0),
          maxDrawdown: Number(run.maxDrawdown ?? 0),
          sharpeRatio: Number(run.sharpeRatio ?? 0),
          profitFactor: Number(run.profitFactor ?? 0),
          avgWin: Number(run.avgWin ?? 0),
          avgLoss: Number(run.avgLoss ?? 0),
          bestTrade: Number(run.bestTrade ?? 0),
          worstTrade: Number(run.worstTrade ?? 0),
          equityCurve: (run.equityCurve ?? []) as object[],
          extendedMetrics: run.extendedMetrics
            ? (run.extendedMetrics as object)
            : undefined,
          status: "COMPLETED",
          duration: run.duration != null ? Number(run.duration) : null,
          isFeatured: true,
          periodLabel: String(run.periodLabel),
          featuredStrategyId: String(run.featuredStrategyId),
        },
      });

      if (body.trades && body.trades.length > 0) {
        await tx.backtestTrade.createMany({
          data: body.trades.map((t) => ({
            backtestRunId: created.id,
            entryTime: new Date(t.entryTime as string),
            entryPrice: Number(t.entryPrice),
            qty: Number(t.qty),
            side: String(t.side),
            leverage: Number(t.leverage ?? 1),
            sl: t.sl != null ? Number(t.sl) : null,
            tp: t.tp != null ? Number(t.tp) : null,
            exitTime: t.exitTime ? new Date(t.exitTime as string) : null,
            exitPrice: t.exitPrice != null ? Number(t.exitPrice) : null,
            pnl: Number(t.pnl ?? 0),
            fee: Number(t.fee ?? 0),
            exitReason: (t.exitReason as string | null) ?? null,
            status: String(t.status ?? "CLOSED"),
          })),
        });
      }

      return created;
    }, { timeout: 60_000 });

    res.json({ success: true, data: { runId: inserted.id } });
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
