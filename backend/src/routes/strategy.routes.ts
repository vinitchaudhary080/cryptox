import { Router, type Request, type Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// List all available strategies (system templates)
router.get("/", async (_req: Request, res: Response) => {
  try {
    const strategies = await prisma.strategy.findMany({
      where: { isSystem: true },
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

export default router;
