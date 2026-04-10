import { Router, type Request, type Response } from "express";
import { BACKTEST_COINS } from "../types.js";
import { getCsvStats, getLastTimestamp } from "../data/csv-manager.js";
import { getSyncStatus, triggerSync, triggerSyncAll } from "../data/sync-job.js";

const router = Router();

// GET /api/historical/status — data status for all coins
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await Promise.all(
      BACKTEST_COINS.map(async (coin) => {
        const stats = getCsvStats(coin.short);
        const lastTs = await getLastTimestamp(coin.short);
        return {
          coin: coin.short,
          name: coin.name,
          exists: stats?.exists ?? false,
          fileSize: stats?.fileSize ?? 0,
          estimatedRows: stats?.rows ?? 0,
          lastTimestamp: lastTs,
          lastDate: lastTs ? new Date(lastTs).toISOString() : null,
        };
      }),
    );

    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/historical/sync/status — current sync progress
router.get("/sync/status", (_req: Request, res: Response) => {
  res.json({ success: true, data: getSyncStatus() });
});

// POST /api/historical/sync — trigger sync for one or all coins
router.post("/sync", async (req: Request, res: Response) => {
  try {
    const { coin, all } = req.body as { coin?: string; all?: boolean };

    if (getSyncStatus().isRunning) {
      res.status(409).json({ success: false, error: "Sync is already running" });
      return;
    }

    if (all) {
      // Run in background — don't await
      triggerSyncAll().catch((err) => {
        console.error("[HistoricalSync] Error:", (err as Error).message, (err as Error).stack);
      });
      res.json({ success: true, message: "Sync started for all coins" });
    } else if (coin) {
      const valid = BACKTEST_COINS.find((c) => c.short === coin.toUpperCase());
      if (!valid) {
        res.status(400).json({ success: false, error: `Unknown coin: ${coin}` });
        return;
      }
      // Run in background
      triggerSync(coin.toUpperCase()).catch((err) => {
        console.error(`[HistoricalSync] Error for ${coin}:`, (err as Error).message);
      });
      res.json({ success: true, message: `Sync started for ${coin.toUpperCase()}` });
    } else {
      res.status(400).json({ success: false, error: "Provide 'coin' or 'all: true'" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
