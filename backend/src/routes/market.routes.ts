import { Router, type Request, type Response } from "express";
import ccxt, { type Exchange, type Ticker } from "ccxt";

const router = Router();

// Delta Exchange India instance (public data, no auth needed)
let delta: Exchange | null = null;

function getDelta(): Exchange {
  if (!delta) {
    delta = new (ccxt as unknown as Record<string, new (c: Record<string, unknown>) => Exchange>)["delta"]({
      enableRateLimit: true,
    });
    (delta.urls as Record<string, unknown>)["api"] = {
      public: "https://api.india.delta.exchange",
      private: "https://api.india.delta.exchange",
    };
  }
  return delta;
}

// Top 5 coins — fast loading
const MARKET_COINS = [
  { symbol: "BTC/USD:USD", name: "Bitcoin", short: "BTC", icon: "btc" },
  { symbol: "ETH/USD:USD", name: "Ethereum", short: "ETH", icon: "eth" },
  { symbol: "SOL/USD:USD", name: "Solana", short: "SOL", icon: "sol" },
  { symbol: "XRP/USD:USD", name: "XRP", short: "XRP", icon: "xrp" },
  { symbol: "DOGE/USD:USD", name: "Dogecoin", short: "DOGE", icon: "doge" },
];

// Cache to avoid hammering the API
let tickerCache: { data: unknown[]; timestamp: number } | null = null;
const CACHE_TTL = 15_000; // 15 seconds

// GET /api/market/overview — public endpoint, no auth needed
router.get("/overview", async (_req: Request, res: Response) => {
  try {
    // Return cache if fresh
    if (tickerCache && Date.now() - tickerCache.timestamp < CACHE_TTL) {
      res.json({ success: true, data: tickerCache.data });
      return;
    }

    const exchange = getDelta();
    await exchange.loadMarkets();

    // Fetch all 10 tickers in parallel — fast
    const tickers = await Promise.allSettled(
      MARKET_COINS.map((coin) => exchange.fetchTicker(coin.symbol)),
    );

    const results: unknown[] = [];
    tickers.forEach((result, idx) => {
      const coin = MARKET_COINS[idx];
      if (result.status === "fulfilled") {
        const t = result.value;
        results.push({
          symbol: coin.short,
          name: coin.name,
          icon: coin.icon,
          price: t.last ?? 0,
          change24h: t.percentage ?? 0,
          high24h: t.high ?? 0,
          low24h: t.low ?? 0,
          volume24h: t.baseVolume ?? 0,
          bid: t.bid ?? 0,
          ask: t.ask ?? 0,
          timestamp: t.timestamp,
        });
      }
    });

    // Sort by volume (most traded first)
    results.sort((a: unknown, b: unknown) => {
      const av = (a as Record<string, number>).volume24h ?? 0;
      const bv = (b as Record<string, number>).volume24h ?? 0;
      return bv - av;
    });

    tickerCache = { data: results, timestamp: Date.now() };
    res.json({ success: true, data: results });
  } catch (err: unknown) {
    const e = err as { message: string };
    console.error("[Market] Overview error:", e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/market/candles/:symbol — OHLCV history
router.get("/candles/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase() + "/USD:USD";
    const timeframe = (req.query.timeframe as string) || "1d";
    const limit = parseInt(req.query.limit as string) || 90;

    const exchange = getDelta();
    await exchange.loadMarkets();

    const candles = await exchange.fetchOHLCV(symbol, timeframe, undefined, Math.min(limit, 500));

    const data = candles.map((c) => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    res.json({ success: true, data });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
