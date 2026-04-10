import { syncAllCoins, syncCoin, type ProgressCallback } from "./historical-fetcher.js";
import { BACKTEST_COINS } from "../types.js";

type SyncStatus = {
  isRunning: boolean;
  currentCoin: string | null;
  progress: Record<string, { fetched: number; totalEstimate: number; lastDate: string; status: string }>;
  startedAt: number | null;
};

const syncStatus: SyncStatus = {
  isRunning: false,
  currentCoin: null,
  progress: {},
  startedAt: null,
};

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

const progressCallback: ProgressCallback = (info) => {
  syncStatus.currentCoin = info.coin;
  syncStatus.progress[info.coin] = {
    fetched: info.fetched,
    totalEstimate: info.totalEstimate,
    lastDate: info.lastDate,
    status: info.status,
  };
};

/** Trigger sync for a single coin */
export async function triggerSync(coin: string): Promise<void> {
  if (syncStatus.isRunning) {
    throw new Error("Sync is already running");
  }

  syncStatus.isRunning = true;
  syncStatus.startedAt = Date.now();
  syncStatus.progress = {};

  try {
    await syncCoin(coin, progressCallback);
  } finally {
    syncStatus.isRunning = false;
    syncStatus.currentCoin = null;
  }
}

/** Trigger sync for all coins */
export async function triggerSyncAll(): Promise<void> {
  if (syncStatus.isRunning) {
    throw new Error("Sync is already running");
  }

  syncStatus.isRunning = true;
  syncStatus.startedAt = Date.now();
  syncStatus.progress = {};

  try {
    await syncAllCoins(progressCallback);
  } finally {
    syncStatus.isRunning = false;
    syncStatus.currentCoin = null;
  }
}

/** Schedule daily sync — call this on server startup */
export function scheduleDailySync(): void {
  // Run sync at 1:00 AM UTC daily
  const runDailySync = () => {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setUTCHours(1, 0, 0, 0);

    // If 1 AM already passed today, schedule for tomorrow
    if (nextRun.getTime() <= now.getTime()) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const delay = nextRun.getTime() - now.getTime();
    console.log(`[DailySync] Next sync scheduled at ${nextRun.toISOString()} (in ${Math.round(delay / 60000)}m)`);

    setTimeout(async () => {
      console.log("[DailySync] Starting daily sync...");
      try {
        await triggerSyncAll();
        console.log("[DailySync] Daily sync completed");
      } catch (err) {
        console.error("[DailySync] Error:", (err as Error).message);
      }
      // Schedule next run
      runDailySync();
    }, delay);
  };

  runDailySync();
}

export { BACKTEST_COINS };
