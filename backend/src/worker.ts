/**
 * cryptox-worker — separate process that owns:
 *   - strategy executor (in-memory setInterval loops)
 *   - market broadcaster (every 10s)
 *   - subscription expiry sweep (every hour)
 *
 * The web process talks to this worker over a localhost-only HTTP API.
 * Socket.IO emissions are forwarded to web clients via the Redis adapter.
 */

import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import ccxt, { type Exchange } from "ccxt";
import { env } from "./config/env.js";
import { initEmitter, emitMarketOverview } from "./websocket/socket.js";
import { strategyWorker } from "./workers/strategy-executor.js";
import { expireOldSubscriptions } from "./services/subscription.service.js";
import { scheduleDailySync } from "./backtest/data/sync-job.js";

const WORKER_PORT = Number(process.env.WORKER_PORT || 4001);

// Initialize Redis-backed socket emitter (no socket.io server in this process)
initEmitter();

const app = express();
app.use(express.json());

// Bind to localhost only — never expose this to the public internet
app.get("/health", (_req, res) => {
  res.json({ status: "ok", role: "worker", timestamp: new Date().toISOString() });
});

app.post("/start", async (req, res) => {
  const { deployedId } = req.body as { deployedId?: string };
  if (!deployedId) return res.status(400).json({ error: "deployedId required" });
  try {
    await strategyWorker.startStrategy(deployedId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Worker /start]", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/stop", (req, res) => {
  const { deployedId } = req.body as { deployedId?: string };
  if (!deployedId) return res.status(400).json({ error: "deployedId required" });
  try {
    strategyWorker.stopStrategy(deployedId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Worker /stop]", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/close-all-trades", async (req, res) => {
  const { deployedId } = req.body as { deployedId?: string };
  if (!deployedId) return res.status(400).json({ error: "deployedId required" });
  try {
    const result = await strategyWorker.closeAllOpenTrades(deployedId);
    res.json(result);
  } catch (err) {
    console.error("[Worker /close-all-trades]", (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(WORKER_PORT, "127.0.0.1", async () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         CryptoX Worker Process            ║
╠═══════════════════════════════════════════╣
║  IPC:   http://127.0.0.1:${WORKER_PORT}            ║
║  Env:   ${env.nodeEnv.padEnd(32)}║
╚═══════════════════════════════════════════╝
  `);

  try {
    await strategyWorker.resumeAll();
  } catch (err) {
    console.error("[Worker] Failed to resume strategies:", (err as Error).message);
  }

  startMarketBroadcaster();
  scheduleDailySync();
  expireOldSubscriptions().catch(() => {});
  setInterval(() => expireOldSubscriptions().catch(() => {}), 60 * 60 * 1000);
});

// ── Market broadcaster ─────────────────────────────────────────
const MARKET_COINS = [
  { symbol: "BTC/USD:USD", short: "BTC", name: "Bitcoin", icon: "btc" },
  { symbol: "ETH/USD:USD", short: "ETH", name: "Ethereum", icon: "eth" },
  { symbol: "SOL/USD:USD", short: "SOL", name: "Solana", icon: "sol" },
  { symbol: "XRP/USD:USD", short: "XRP", name: "XRP", icon: "xrp" },
  { symbol: "DOGE/USD:USD", short: "DOGE", name: "Dogecoin", icon: "doge" },
];

function startMarketBroadcaster() {
  const delta = new (ccxt as unknown as Record<string, new (c: Record<string, unknown>) => Exchange>)["delta"]({
    enableRateLimit: true,
  });
  (delta.urls as Record<string, unknown>)["api"] = {
    public: "https://api.india.delta.exchange",
    private: "https://api.india.delta.exchange",
  };

  let marketsLoaded = false;

  const broadcast = async () => {
    try {
      if (!marketsLoaded) {
        await delta.loadMarkets();
        marketsLoaded = true;
      }

      const tickers = await Promise.allSettled(
        MARKET_COINS.map((c) => delta.fetchTicker(c.symbol)),
      );

      const data = tickers
        .map((r, i) => {
          if (r.status !== "fulfilled") return null;
          const t = r.value;
          return {
            symbol: MARKET_COINS[i].short,
            name: MARKET_COINS[i].name,
            icon: MARKET_COINS[i].icon,
            price: t.last ?? 0,
            change24h: t.percentage ?? 0,
            high24h: t.high ?? 0,
            low24h: t.low ?? 0,
            volume24h: t.baseVolume ?? 0,
            timestamp: t.timestamp,
          };
        })
        .filter(Boolean);

      emitMarketOverview(data);
    } catch (err) {
      console.error("[MarketBroadcast] Error:", (err as Error).message);
    }
  };

  setTimeout(broadcast, 2000);
  setInterval(broadcast, 10_000);
  console.log("[MarketBroadcast] Started — pushing every 10s from worker process");
}
