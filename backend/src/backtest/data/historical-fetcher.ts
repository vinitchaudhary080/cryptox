import ccxt, { type Exchange } from "ccxt";
import { BACKTEST_COINS, type CoinConfig } from "../types.js";
import { ohlcvToCandles, appendCandles, getLastTimestamp, initCsvFile } from "./csv-manager.js";

// ── Binance for historical data (much deeper history than Delta) ──
// Binance public OHLCV = no API key needed
// Binance limit = 1000 candles/request, but very fast and reliable
// Symbol format: "BTC/USDT" (spot pairs)

const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: "BTC/USDT",
  ETH: "ETH/USDT",
  SOL: "SOL/USDT",
  XRP: "XRP/USDT",
  DOGE: "DOGE/USDT",
  ADA: "ADA/USDT",
  DOT: "DOT/USDT",
  SUI: "SUI/USDT",
  LINK: "LINK/USDT",
  AVAX: "AVAX/USDT",
  BNB: "BNB/USDT",
  PAXG: "PAXG/USDT",
  LTC: "LTC/USDT",
  UNI: "UNI/USDT",
  NEAR: "NEAR/USDT",
  INJ: "INJ/USDT",
  WIF: "WIF/USDT",
  AAVE: "AAVE/USDT",
};

// Earliest available data on Binance per coin (tested)
// Option B: 3 years of data (from 2023)
const COIN_START_DATES: Record<string, string> = {
  BTC: "2023-01-01",
  ETH: "2023-01-01",
  SOL: "2023-01-01",
  XRP: "2023-01-01",
  DOGE: "2023-01-01",
  ADA: "2023-01-01",
  DOT: "2023-01-01",
  SUI: "2023-05-03",  // SUI listed May 2023
  LINK: "2023-01-01",
  AVAX: "2023-01-01",
  BNB: "2023-01-01",
  PAXG: "2023-01-01",
  LTC: "2023-01-01",
  UNI: "2023-01-01",
  NEAR: "2023-01-01",
  INJ: "2023-01-01",
  WIF: "2024-03-05",  // WIF listed on Binance March 2024
  AAVE: "2023-01-01",
};

const CANDLES_PER_REQUEST = 1000; // Binance limit
const REQUEST_DELAY_MS = 100;     // 10 req/sec (Binance allows up to 20)
const ONE_MINUTE_MS = 60_000;

let binanceInstance: Exchange | null = null;

function getBinance(): Exchange {
  if (!binanceInstance) {
    binanceInstance = new ccxt.binance({
      enableRateLimit: true,
      timeout: 30000,
    });
  }
  return binanceInstance;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ProgressCallback = (info: {
  coin: string;
  fetched: number;
  totalEstimate: number;
  lastDate: string;
  status: "fetching" | "done" | "error";
  error?: string;
}) => void;

/** Fetch all available 1m historical data for a coin from Binance */
export async function fetchHistoricalData(
  coin: CoinConfig,
  onProgress?: ProgressCallback,
  sinceOverride?: number,
): Promise<{ totalCandles: number; error?: string }> {
  const exchange = getBinance();
  const binanceSymbol = BINANCE_SYMBOLS[coin.short];

  if (!binanceSymbol) {
    return { totalCandles: 0, error: `No Binance symbol mapping for ${coin.short}` };
  }

  try {
    await exchange.loadMarkets();
  } catch (err) {
    const msg = `Failed to load Binance markets: ${(err as Error).message}`;
    onProgress?.({ coin: coin.short, fetched: 0, totalEstimate: 0, lastDate: "", status: "error", error: msg });
    return { totalCandles: 0, error: msg };
  }

  initCsvFile(coin.short);

  // Determine start point
  let since = sinceOverride ?? null;
  if (!since) {
    const lastTs = await getLastTimestamp(coin.short);
    if (lastTs) {
      since = lastTs + ONE_MINUTE_MS;
    } else {
      const startDate = COIN_START_DATES[coin.short] ?? "2022-01-01";
      since = new Date(`${startDate}T00:00:00Z`).getTime();
    }
  }

  const now = Date.now();
  const totalMinutes = Math.floor((now - since) / ONE_MINUTE_MS);
  let totalFetched = 0;
  let emptyStreak = 0;
  const MAX_EMPTY_STREAK = 10; // give up after 10 consecutive empty responses

  console.log(`[Fetcher] ${coin.short}: Starting from ${new Date(since).toISOString().slice(0, 10)} via Binance (${binanceSymbol}), ~${totalMinutes.toLocaleString()} candles to fetch`);

  while (since < now) {
    try {
      const ohlcv = await exchange.fetchOHLCV(binanceSymbol, "1m", since, CANDLES_PER_REQUEST);

      if (!ohlcv || ohlcv.length === 0) {
        emptyStreak++;
        if (emptyStreak >= MAX_EMPTY_STREAK) {
          console.log(`[Fetcher] ${coin.short}: ${MAX_EMPTY_STREAK} consecutive empty responses, stopping.`);
          break;
        }
        since += 1440 * ONE_MINUTE_MS; // skip 1 day
        if (since >= now) break;
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      emptyStreak = 0; // reset on success
      const candles = ohlcvToCandles(ohlcv as (number | undefined)[][]);
      const appended = appendCandles(coin.short, candles);
      totalFetched += appended;

      const lastCandleTs = Number(ohlcv[ohlcv.length - 1][0] ?? 0);
      since = lastCandleTs + ONE_MINUTE_MS;

      const lastDate = new Date(lastCandleTs).toISOString().slice(0, 10);

      // Log progress every 100K candles
      if (totalFetched % 100000 < CANDLES_PER_REQUEST) {
        console.log(`[Fetcher] ${coin.short}: ${totalFetched.toLocaleString()} candles fetched, last date: ${lastDate}`);
      }

      onProgress?.({
        coin: coin.short,
        fetched: totalFetched,
        totalEstimate: totalMinutes,
        lastDate,
        status: "fetching",
      });

      if (ohlcv.length < CANDLES_PER_REQUEST) {
        break; // caught up to present
      }

      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[Fetcher] ${coin.short}: Error at ${new Date(since).toISOString()} — ${msg}`);

      if (msg.includes("429") || msg.includes("rate") || msg.includes("banned")) {
        console.log(`[Fetcher] ${coin.short}: Rate limited, waiting 60s...`);
        await sleep(60_000);
        continue;
      }

      if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
        console.log(`[Fetcher] ${coin.short}: Timeout, retrying in 5s...`);
        await sleep(5000);
        continue;
      }

      // Other error — skip this chunk
      since += CANDLES_PER_REQUEST * ONE_MINUTE_MS;
      await sleep(1000);
    }
  }

  console.log(`[Fetcher] ${coin.short}: Done. Total candles fetched: ${totalFetched.toLocaleString()}`);
  onProgress?.({
    coin: coin.short,
    fetched: totalFetched,
    totalEstimate: totalMinutes,
    lastDate: new Date().toISOString().slice(0, 10),
    status: "done",
  });

  return { totalCandles: totalFetched };
}

/** Fetch historical data for all coins sequentially */
export async function fetchAllCoins(onProgress?: ProgressCallback): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  for (const coin of BACKTEST_COINS) {
    const { totalCandles } = await fetchHistoricalData(coin, onProgress);
    results[coin.short] = totalCandles;
  }

  return results;
}

/** Sync a single coin (fetch only new data since last stored candle) */
export async function syncCoin(coinShort: string, onProgress?: ProgressCallback): Promise<number> {
  const coin = BACKTEST_COINS.find((c) => c.short === coinShort.toUpperCase());
  if (!coin) throw new Error(`Unknown coin: ${coinShort}`);

  const { totalCandles } = await fetchHistoricalData(coin, onProgress);
  return totalCandles;
}

/** Sync all coins (fetch only new data) */
export async function syncAllCoins(onProgress?: ProgressCallback): Promise<Record<string, number>> {
  return fetchAllCoins(onProgress);
}
