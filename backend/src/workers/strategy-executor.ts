import { PrismaClient, type DeployedStrategy, type Strategy, type Broker, type Trade, type User } from "@prisma/client";
import { exchangeService } from "../services/exchange.service.js";
import { emitTradeUpdate, emitPortfolioUpdate } from "../websocket/socket.js";
import { createNotification } from "../services/notification.service.js";
import {
  buildTradeOpenedNotification,
  buildTradeClosedNotification,
  buildTradeErrorNotification,
  buildMarginCallNotification,
} from "../services/notification-templates.js";
import type { Exchange, Ticker, OHLCV } from "ccxt";
import { computeIndicators } from "../backtest/indicators/index.js";
import { resampleCandles } from "../backtest/indicators/resample.js";
import type { Candle, CandleContext, IndicatorConfig, IndicatorValues, Position, Signal } from "../backtest/types.js";
import { getStrategyByName } from "../backtest/strategies/strategy-runner.js";
import { getPrecomputeFn } from "../backtest/strategies/precompute-registry.js";

const prisma = new PrismaClient();

// Legacy: email-based paper-trade flag — kept ONLY as fallback for
// deployments created before the `mode` column existed. New deployments
// set `mode` explicitly on the DeployedStrategy row.
const LEGACY_PAPER_TRADE_EMAIL = "test@cryptox.com";
const CANDLE_LOOKBACK = 100; // legacy category-based handlers — last 100 1m candles
// Registered-strategy path: strategy files resample to 1H/4H and need
// EMA200, ADX14, rolling-100 stdev — 100 1m candles ≈ 1.7 hours, too few.
// 2000 1m candles ≈ 33 hours of base, enough for 5m strategies.
const REGISTERED_LOOKBACK = 2000;

// ── 1H-heavy strategy fetch path ────────────────────────────────
//
// Strategies that resample to 1H and rely on long-period indicators (EMA200,
// rolling-100 stdev, ADX(14) on 4H) need ≥200 1H bars = 12,000 1m candles.
// Delta India's `/v2/history/candles` caps at ~4000 candles per request, so
// pagination on 1m is fragile. Instead, fetch 1H directly (360 bars in one
// call) and EXPAND each 1H bar into 60 fake 1m candles preserving OHLC. When
// the strategy then resamples 1m → 1H internally, it recovers the original
// 1H series; 1m → 4H aggregates 4 consecutive 1H bars correctly.
//
// Maintenance: add a slug here when deploying a new 1H/4H strategy live.
const HEAVY_HTF_SLUGS = new Set<string>([
  "supertrend-1h-swing",
  "supertrend-strategy",                    // 15m + 1H (needs 1H history too)
  "07-zscore-mean-reversion-1h",
  "07-v2-zscore-mr-funding-filter-1h",
  "07-v3-zscore-mr-slope-gated-1h",
  "07-v3-zscore-mr-btc-tuned-1h",
  "07-v3-zscore-mr-loose-1h",
  "07-v3-zscore-mr-tight-1h",
  "07-v3-zscore-mr-slow-anchor-1h",
  "07-v3-zscore-mr-funding-loose",
  "07-v3-zscore-mr-funding-extreme",
  "07-v3-zscore-mr-funding-multicoin",
  "07-v3-zscore-mr-funding-proxy",
  "01-v3-htf-pullback-confluence",
  "v7-chop-trend-transition-1h",
  "v10-zscore-mr-adaptive-stops-1h",
  "v10-zscore-mr-adaptive-link-only",
  "v10-zscore-mr-adaptive-bnb-only",
  "v10-chop-trend-adaptive-1h",
  "v10-chop-trend-adaptive-sol-avax",
  "v10-funding-filter-adaptive-1h",
]);

// ── Funding-rate injection ──────────────────────────────────────
//
// Backtest reads `candle.funding` from `_extras.csv` (Binance funding rate
// history merged in by csv-manager). Live worker fetches plain OHLCV; the
// `funding` field is always undefined unless we inject it. For these
// strategies, take the current funding rate from the exchange ticker
// (Delta India returns it on `ticker.info.funding_rate`) and forward-fill it
// onto every candle in the array. The strategy reads the just-closed 1H bar's
// funding for the entry gate — that bar now carries the current rate, which
// is the actionable value for a decision being made NOW.
const FUNDING_INJECT_SLUGS = new Set<string>([
  "07-v2-zscore-mr-funding-filter-1h",
  "07-v3-zscore-mr-funding-loose",
  "07-v3-zscore-mr-funding-extreme",
  "07-v3-zscore-mr-funding-multicoin",
  "07-v3-zscore-mr-funding-proxy",
  "v7-funding-flip-trend-15m",
  "v10-funding-filter-adaptive-1h",
  "funding-squeeze-reversal",
  "12-funding-carry-trend",
  "12-v2-negative-funding-carry-long",
]);

/** Expand 1H OHLCV bars into 60 fake 1m candles per bar with OHLC preserved.
 *  Resampling these back to 1H reconstructs the input series exactly; 1m → 4H
 *  groups 4 consecutive 1H bars. */
function expandHourlyToMinute(ohlcv: OHLCV[]): Candle[] {
  const out: Candle[] = [];
  for (const row of ohlcv) {
    const ts = Number(row[0] ?? 0);
    const open = Number(row[1] ?? 0);
    const high = Number(row[2] ?? 0);
    const low = Number(row[3] ?? 0);
    const close = Number(row[4] ?? 0);
    const volumePerMin = Number(row[5] ?? 0) / 60;
    for (let m = 0; m < 60; m++) {
      const minTs = ts + m * 60_000;
      const d = new Date(minTs);
      out.push({
        timestamp: minTs,
        date: d.toISOString().slice(0, 10),
        time: d.toISOString().slice(11, 19),
        open: m === 0 ? open : close,
        high,
        low,
        close,
        volume: volumePerMin,
      });
    }
  }
  return out;
}

/** Convert a display name ("Supertrend 5m Fast") to its registry slug
 *  ("supertrend-5m-fast"). The DB row's `id` field is the slug. */
function strategySlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function log(strategyName: string, pair: string, msg: string) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [Worker] [${strategyName}] ${pair} — ${msg}`);
}

function readLeverage(config: unknown): number {
  if (config && typeof config === "object") {
    const lev = (config as { leverage?: unknown }).leverage;
    const n = Number(lev);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  }
  return 1;
}

/**
 * Resolve the effective position-size PERCENT for a deployment, honouring:
 *   1. Strategy-level lock (if positionSizeLocked, user override is ignored)
 *   2. User override in deployed.config.positionSizePercent (0–100)
 *   3. Legacy config.positionSize (0–1 ratio — tolerated for old deployments)
 *   4. Strategy.defaultPositionSize from the DB
 *   5. Final fallback: 10%
 */
function readPositionSizePercent(deployed: {
  config: unknown;
  strategy: { positionSizeLocked?: boolean; defaultPositionSize?: number | null };
}): number {
  const locked = deployed.strategy.positionSizeLocked === true;
  const def = Number(deployed.strategy.defaultPositionSize ?? 10);
  if (locked) return def;

  const config = (deployed.config && typeof deployed.config === "object"
    ? (deployed.config as Record<string, unknown>)
    : {});
  const pct = Number(config.positionSizePercent);
  if (Number.isFinite(pct) && pct > 0) return pct;

  const ratio = Number(config.positionSize);
  if (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) return ratio * 100;

  return def;
}

/** Dollar amount of margin deployed per entry. */
function perTradeCapital(deployed: DeployedStrategy & {
  strategy: { positionSizeLocked?: boolean; defaultPositionSize?: number | null };
}): number {
  const pct = readPositionSizePercent(deployed);
  return deployed.investedAmount * (pct / 100);
}

// ── OHLCV → Candle conversion ───────────────────────────────────

function ohlcvToCandles(ohlcv: OHLCV[]): Candle[] {
  return ohlcv.map((row) => {
    const ts = Number(row[0] ?? 0);
    const d = new Date(ts);
    return {
      timestamp: ts,
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 19),
      open: Number(row[1] ?? 0),
      high: Number(row[2] ?? 0),
      low: Number(row[3] ?? 0),
      close: Number(row[4] ?? 0),
      volume: Number(row[5] ?? 0),
    };
  });
}

// ── Types ───────────────────────────────────────────────────────

type DeployedWithRelations = DeployedStrategy & {
  strategy: Strategy;
  broker: Broker;
  user: Pick<User, "email">;
  trades: Trade[];
};

// ── Strategy Worker ─────────────────────────────────────────────

class StrategyWorker {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly TICK_INTERVAL = 60_000; // 1 minute
  // Last-processed candle timestamp per deployed strategy — used by strategies
  // that act only on candle close (Ravi) so intra-candle ticks get skipped.
  private lastCandleTs = new Map<string, number>();

  /**
   * Get contract size for a pair on an exchange.
   * For contract exchanges: 1 BTC/USD contract on Delta = 0.001 BTC
   * For spot: returns 1 (quantity = actual amount)
   */
  private async getContractSize(exchange: Exchange, pair: string): Promise<number> {
    try {
      await exchange.loadMarkets();
      const market = exchange.markets[pair];
      if (market && market.contractSize) return Number(market.contractSize);
    } catch { /* fallback */ }
    return 1; // spot or unknown
  }

  /**
   * Calculate correct order quantity based on amount, leverage, and exchange contract size.
   * On contract exchanges (Delta), 1 contract ≠ $1. We must divide by per-contract value.
   */
  private async calculateQuantity(
    exchange: Exchange,
    pair: string,
    investedAmount: number,
    leverage: number,
    currentPrice: number,
  ): Promise<number> {
    const effectiveAmount = investedAmount * leverage;

    try {
      await exchange.loadMarkets();
      const market = exchange.markets[pair];

      if (market && market.contractSize) {
        // Contract-based exchange (Delta India). The adapter expects
        // base-currency amount and converts internally to contracts.
        // Return the raw base-currency amount; the adapter handles rounding.
        return effectiveAmount / currentPrice;
      }
    } catch { /* fallback below */ }

    // Linear perp (CoinDCX, Pi42, Bybit) — qty in base currency.
    // Return EXACT computed amount; adapters round to instrument step and
    // the deploy dialog already validated min_notional/min_qty upfront.
    return effectiveAmount / currentPrice;
  }

  async startStrategy(deployedId: string): Promise<void> {
    if (this.intervals.has(deployedId)) return;

    console.log(`[Worker] Starting strategy: ${deployedId}`);
    await this.tick(deployedId);

    const interval = setInterval(async () => {
      try {
        await this.tick(deployedId);
      } catch (err) {
        console.error(`[Worker] Error in strategy ${deployedId}:`, (err as Error).message);
      }
    }, this.TICK_INTERVAL);

    this.intervals.set(deployedId, interval);
  }

  stopStrategy(deployedId: string): void {
    const interval = this.intervals.get(deployedId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(deployedId);
      this.lastCandleTs.delete(deployedId);
      console.log(`[Worker] Stopped worker: ${deployedId}`);
    }
  }

  async resumeAll(): Promise<void> {
    const active = await prisma.deployedStrategy.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    console.log(`[Worker] Resuming ${active.length} active strategies`);
    for (const d of active) {
      await this.startStrategy(d.id);
    }
  }

  // ── Core Tick ───────────────────────────────────────────────

  private async tick(deployedId: string): Promise<void> {
    const deployed = await prisma.deployedStrategy.findUnique({
      where: { id: deployedId },
      include: {
        strategy: true,
        broker: true,
        user: { select: { email: true } },
        trades: { where: { status: "OPEN" }, orderBy: { openedAt: "desc" } },
      },
    });

    if (!deployed || deployed.status !== "ACTIVE") {
      this.stopStrategy(deployedId);
      return;
    }

    // Paper-trade flag: `mode === "PAPER"` on the deployment row is the
    // authoritative source. Email fallback kept for any pre-mode rows.
    const isPaperTrade =
      deployed.mode === "PAPER" || deployed.user.email === LEGACY_PAPER_TRADE_EMAIL;
    const exchange = exchangeService.getExchange(
      deployed.brokerId,
      deployed.broker.exchangeId,
      deployed.broker.apiKey,
      deployed.broker.apiSecret,
      deployed.broker.passphrase || undefined,
    );

    try {
      const ticker = await exchangeService.getTicker(exchange, deployed.pair);
      const price = ticker.last ?? 0;
      if (!price) return;

      const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const mode = isPaperTrade ? "PAPER" : "LIVE";

      log(deployed.strategy.name, deployed.pair, `[${mode}] Price: $${price} | Open: ${openTrades.length}`);

      // Check SL/TP on open positions first (all strategies)
      await this.checkStopLossAndTakeProfit(exchange, deployed, isPaperTrade, ticker);

      // PRIMARY ROUTING — if the deployed strategy's name slug matches a
      // file in BUILTIN_STRATEGIES, execute it via the actual .ts file
      // (same code the backtest engine calls). This is the parity path:
      // backtest logic = live logic. Falls back to category-based legacy
      // handlers below only when no registered file exists.
      const handledByRegistry = await this.executeRegisteredStrategy(
        exchange,
        deployed,
        isPaperTrade,
        ticker,
      );
      if (handledByRegistry) {
        // Registry path handled it. Skip legacy routing, jump to portfolio
        // value update below.
      } else {

      // Route to strategy logic
      const category = deployed.strategy.category.toLowerCase();

      if (category === "meri strategy") {
        await this.executeMeriStrategy(exchange, deployed, isPaperTrade, ticker);
      } else if (category === "supertrend") {
        await this.executeSupertrendStrategy(exchange, deployed, isPaperTrade, ticker);
      } else if (category === "cpr pivot") {
        await this.executeCPRStrategy(exchange, deployed, isPaperTrade, ticker);
      } else if (category === "quick test") {
        await this.executeQuickTest(exchange, deployed, isPaperTrade, ticker);
      } else if (category === "ravi strategy") {
        await this.executeRaviStrategy(exchange, deployed, isPaperTrade, ticker);
      } else if (["trend", "mean reversion", "scalping"].includes(category)) {
        // Indicator-based strategies: fetch candles + compute indicators
        const indicators = await this.fetchAndComputeIndicators(exchange, deployed, category);
        if (!indicators) return;

        switch (category) {
          case "trend":
            await this.executeTrend(exchange, deployed, isPaperTrade, ticker, indicators);
            break;
          case "mean reversion":
            await this.executeMeanReversion(exchange, deployed, isPaperTrade, ticker, indicators);
            break;
          case "scalping":
            await this.executeScalping(exchange, deployed, isPaperTrade, ticker, indicators);
            break;
        }
      } else {
        // Non-indicator strategies
        switch (category) {
          case "grid":
            await this.executeGrid(exchange, deployed, isPaperTrade, ticker);
            break;
          case "dca":
            await this.executeDCA(exchange, deployed, isPaperTrade, ticker);
            break;
          default:
            log(deployed.strategy.name, deployed.pair, `No handler for category: ${category}`);
        }
      }
      } // end of `else` branch paired with `if (handledByRegistry)` above

      // Update portfolio value
      await this.updatePortfolioValue(deployed, ticker);

      emitPortfolioUpdate(deployed.userId, {
        deployedId: deployed.id,
        pair: deployed.pair,
        price,
        currentValue: deployed.currentValue,
      });
    } catch (err) {
      log(deployed.strategy.name, deployed.pair, `ERROR: ${(err as Error).message}`);
    }
  }

  // ── Registry-based execution (parity path) ──────────────────
  //
  // Looks up the deployed strategy by slug in `BUILTIN_STRATEGIES`. If
  // a file exists for that slug, executes its actual `onCandle()` —
  // same function the backtest engine calls. Converts returned `Signal[]`
  // into live trades via `openTrade()` / `closeTrade()` with proper
  // percent-equity sizing.
  //
  // Returns true when handled (caller skips category-based handlers);
  // false when no registered code exists (caller falls back).
  private async executeRegisteredStrategy(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<boolean> {
    // Use deployed.strategy.id (the canonical slug in DB) — NOT a slug
    // derived from the display name. Display names like "Z-Score Mean
    // Reversion 15m" slugify to "z-score-mean-reversion-15m" but the
    // actual id is "07-zscore-mean-reversion-15m" (with a 07- prefix
    // and no dash in zscore). That mismatch silently routed Z-Score
    // 15m to the legacy mean-reversion handler instead of its real
    // .ts strategy (May 2026 AVAX incident — qty stuck at un-leveraged
    // $100-equity base). Falling back to the display-name slug as a
    // safety net for any deployment where strategy.id might be empty.
    const slug = deployed.strategy.id || strategySlug(deployed.strategy.name);
    const strategy = getStrategyByName(slug);
    if (!strategy) return false;

    const price = ticker.last ?? 0;
    if (!price) return true;

    try {
      let candles: Candle[];
      const useHtfPath = HEAVY_HTF_SLUGS.has(slug);

      if (useHtfPath) {
        // Fetch 1H candles directly (Delta caps 1m fetches at ~4k → need
        // pagination for 12k+; instead just pull 1H natively, then expand
        // each bar into 60 fake 1m candles. Strategy's internal resample
        // recovers the original 1H series — and 4H aggregates 4 1H bars.
        const ohlcv1h = await exchangeService.getCandles(
          exchange,
          deployed.pair,
          "1h",
          360, // 360 1H ≈ 15 days; covers EMA200 + std100 + 4H ADX warmup
        );
        if (!ohlcv1h || ohlcv1h.length < 220) {
          log(
            deployed.strategy.name,
            deployed.pair,
            `[registry:${slug}] insufficient 1H candles (${ohlcv1h?.length ?? 0}) — need ≥220 — skipping`,
          );
          return true;
        }
        candles = expandHourlyToMinute(ohlcv1h);
      } else {
        const ohlcv = await exchangeService.getCandles(
          exchange,
          deployed.pair,
          "1m",
          REGISTERED_LOOKBACK,
        );
        if (!ohlcv || ohlcv.length < 200) {
          log(
            deployed.strategy.name,
            deployed.pair,
            `[registry:${slug}] insufficient candles (${ohlcv?.length ?? 0}) — skipping`,
          );
          return true;
        }
        candles = ohlcvToCandles(ohlcv);
      }

      // Funding-rate injection — backtest reads funding from _extras.csv;
      // live needs it on the candle to clear the strategy's funding gate.
      // Forward-fill the current funding rate onto every candle. The strategy
      // only inspects the just-closed 1H bar's funding for the entry gate,
      // which after this becomes the current rate — i.e. the actionable value
      // for a decision being made now.
      if (FUNDING_INJECT_SLUGS.has(slug)) {
        const fundingRaw = (ticker.info as { funding_rate?: unknown } | undefined)?.funding_rate;
        const fundingRate = Number(fundingRaw);
        if (Number.isFinite(fundingRate)) {
          for (const c of candles) c.funding = fundingRate;
          log(
            deployed.strategy.name,
            deployed.pair,
            `[registry:${slug}] funding injected: ${(fundingRate * 100).toFixed(4)}% / 8h`,
          );
        } else {
          log(
            deployed.strategy.name,
            deployed.pair,
            `[registry:${slug}] ticker has no funding_rate field — entry gate will fail closed`,
          );
        }
      }

      const precompute = getPrecomputeFn(slug);
      if (precompute) precompute(candles);

      const lastIdx = candles.length - 1;
      const lastCandle = candles[lastIdx];

      const equity =
        Number.isFinite(deployed.currentValue) && deployed.currentValue > 0
          ? deployed.currentValue
          : deployed.investedAmount;

      const mergedConfig: Record<string, number | string> = {
        ...strategy.defaultConfig,
        ...((deployed.config ?? {}) as Record<string, number | string>),
      };

      // Convert open trades → backtest-shape Position[] so onCandle sees
      // what's open and can emit CLOSE_* signals correctly.
      const positions: Position[] = deployed.trades
        .filter((t) => t.status === "OPEN")
        .map((t) => ({
          id: t.id,
          entryTime: t.openedAt.getTime(),
          entryPrice: t.entryPrice,
          qty: t.quantity,
          side: t.side as "BUY" | "SELL",
          leverage: readLeverage(deployed.config),
          sl: null,
          tp: null,
        }));

      const ctx: CandleContext = {
        candle: lastCandle,
        index: lastIdx,
        indicators: {} as IndicatorValues,
        positions,
        equity,
        config: mergedConfig,
      };
      // Multi-TF strategies inspect `_allCandles` (backtest engine does
      // the same injection).
      (ctx as unknown as { _allCandles: Candle[] })._allCandles = candles;

      const signals = strategy.onCandle(ctx);

      log(
        deployed.strategy.name,
        deployed.pair,
        `[registry:${slug}] price=${price} candles=${candles.length} open=${positions.length} signals=${signals.length}`,
      );

      for (const sig of signals) {
        await this.executeRegisteredSignal(
          exchange,
          deployed,
          isPaperTrade,
          sig,
          lastCandle,
          equity,
          mergedConfig,
        );
      }

      return true;
    } catch (err) {
      log(
        deployed.strategy.name,
        deployed.pair,
        `[registry:${slug}] ERROR: ${(err as Error).message}`,
      );
      return true;
    }
  }

  /** Translate a backtest `Signal` into a live trade. Sizing uses
   *  percent-equity formula matching the backtest engine. */
  private async executeRegisteredSignal(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    signal: Signal,
    candle: Candle,
    equity: number,
    config: Record<string, number | string>,
  ): Promise<void> {
    const execPrice =
      signal.entryPrice != null && Number.isFinite(signal.entryPrice)
        ? signal.entryPrice
        : candle.close;

    switch (signal.action) {
      case "BUY":
      case "SELL": {
        const positionSizePct = Number(config.positionSizePercent ?? 10);
        const leverage = Math.max(1, Number(config.leverage ?? 1));
        const sizeFraction = Math.max(0, Math.min(100, positionSizePct)) / 100;
        // Strategy files emit BASE qty (margin / price) — codebase convention
        // shared across all 50+ builtin strategies. The backtest engine scales
        // it up by leverage (see backtest-engine.ts:704). The live executor
        // must do the same, otherwise leveraged strategies trade 1/leverage
        // smaller on live than in backtest (May 2026 DOGE supertrend-5m-fast
        // incident — backtest qty 2410, live qty 484 with leverage=5x).
        const baseQty =
          signal.qty != null && Number.isFinite(signal.qty)
            ? signal.qty
            : (equity * sizeFraction) / execPrice;
        const qty = baseQty * leverage;
        await this.openTrade(
          exchange,
          deployed,
          isPaperTrade,
          signal.action,
          execPrice,
          qty,
          signal.reason ?? `registry signal ${signal.action}`,
          signal.sl,
          signal.tp,
          signal.leverage ?? leverage,
        );
        break;
      }
      case "CLOSE_LONG": {
        for (const t of deployed.trades.filter(
          (t) => t.status === "OPEN" && t.side === "BUY",
        )) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, execPrice,
            signal.reason ?? "registry CLOSE_LONG");
        }
        break;
      }
      case "CLOSE_SHORT": {
        for (const t of deployed.trades.filter(
          (t) => t.status === "OPEN" && t.side === "SELL",
        )) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, execPrice,
            signal.reason ?? "registry CLOSE_SHORT");
        }
        break;
      }
      case "CLOSE_ALL": {
        for (const t of deployed.trades.filter((t) => t.status === "OPEN")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, execPrice,
            signal.reason ?? "registry CLOSE_ALL");
        }
        break;
      }
    }
  }

  // ── Indicator Fetching ──────────────────────────────────────

  private async fetchAndComputeIndicators(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    category: string,
  ): Promise<{ indicators: IndicatorValues; candles: Candle[] } | null> {
    try {
      const ohlcv = await exchangeService.getCandles(exchange, deployed.pair, "1m", CANDLE_LOOKBACK);
      if (!ohlcv || ohlcv.length < 30) {
        log(deployed.strategy.name, deployed.pair, `Insufficient candle data (${ohlcv?.length ?? 0} candles)`);
        return null;
      }

      const candles = ohlcvToCandles(ohlcv);
      const configs = this.getIndicatorConfigs(category);
      const indicators = computeIndicators(candles, configs);

      return { indicators, candles };
    } catch (err) {
      log(deployed.strategy.name, deployed.pair, `Failed to fetch candles: ${(err as Error).message}`);
      return null;
    }
  }

  private getIndicatorConfigs(category: string): IndicatorConfig[] {
    switch (category) {
      case "trend":
        return [
          { name: "EMA", period: 9 },
          { name: "EMA", period: 21 },
          { name: "MACD" },
        ];
      case "mean reversion":
        return [
          { name: "RSI", period: 14 },
          { name: "BB", period: 20, params: { stdDev: 2 } },
        ];
      case "scalping":
        return [
          { name: "RSI", period: 7 },
          { name: "EMA", period: 9 },
          { name: "EMA", period: 21 },
        ];
      default:
        return [];
    }
  }

  // ── Trade Execution (Paper / Real) ──────────────────────────

  private async openTrade(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    side: "BUY" | "SELL",
    price: number,
    quantity: number,
    reason: string,
    // Optional strategy-emitted risk levels — passed through from the
    // registry path (`signal.sl`/`signal.tp`). Legacy strategy paths that
    // don't compute these pass undefined and the template just omits the
    // SL/TP rows.
    slOverride?: number,
    tpOverride?: number,
    leverageOverride?: number,
  ): Promise<Trade | null> {
    const mode = isPaperTrade ? "PAPER" : "LIVE";

    // ── Platform rule: per-trade margin (qty × entry) must be ≥ $50 ──
    // If equity has drained below the minimum viable position size for this
    // strategy's sizing %, don't place the order. Instead surface a notification
    // so the user can top up their invested amount.
    const MIN_MARGIN_USD = 50;
    const margin = price * quantity;
    if (margin < MIN_MARGIN_USD) {
      log(deployed.strategy.name, deployed.pair,
        `[${mode}] MARGIN CALL: attempted ${side} with $${margin.toFixed(2)} margin < $${MIN_MARGIN_USD} min — trade skipped`);

      // Rate-limit: only notify once per 6h per deployment to avoid spam on
      // every signal bar while capital stays low.
      try {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const recent = await prisma.notification.findFirst({
          where: {
            userId: deployed.userId,
            type: "margin_call",
            createdAt: { gte: sixHoursAgo },
            data: { path: ["deployedId"], equals: deployed.id } as never,
          },
          select: { id: true },
        });
        if (!recent) {
          const content = buildMarginCallNotification({
            strategyName: deployed.strategy.name,
            pair: deployed.pair,
            attemptedMargin: margin,
            minMargin: MIN_MARGIN_USD,
          });
          await createNotification({
            userId: deployed.userId,
            type: "margin_call",
            title: content.title,
            message: content.message,
            telegramHtml: content.telegramHtml,
            data: {
              pair: deployed.pair,
              side,
              margin,
              strategyName: deployed.strategy.name,
              deployedId: deployed.id,
            },
          });
        }
      } catch (notifErr) {
        console.error("[margin_call notification] failed:", notifErr);
      }

      emitTradeUpdate(deployed.userId, {
        type: "ERROR",
        error: `Skipped ${side}: margin $${margin.toFixed(2)} below $${MIN_MARGIN_USD} minimum. Add capital.`,
        strategyName: deployed.strategy.name,
        pair: deployed.pair,
      });
      return null;
    }

    if (!isPaperTrade) {
      // ── Real trade: place order on exchange ──
      try {
        const leverage = readLeverage(deployed.config);
        const order = await exchangeService.placeMarketOrder(
          exchange,
          deployed.pair,
          side.toLowerCase() as "buy" | "sell",
          quantity,
          { leverage },
        );

        // Use || (not ??) because adapters may return 0/NaN for unknown
        // fields and we want to fall back to the signal price/qty in that case.
        const fillPrice = Number(order.average) || Number(order.price) || price;
        const fillQty = Number(order.filled) || Number(order.amount) || quantity;
        const fee = Number(order.fee?.cost) || 0;

        const trade = await prisma.trade.create({
          data: {
            deployedStrategyId: deployed.id,
            pair: deployed.pair,
            side,
            entryPrice: fillPrice,
            quantity: fillQty,
            fee,
            status: "OPEN",
            exchangeOrderId: order.id,
            sl: slOverride ?? null,
            tp: tpOverride ?? null,
          },
        });

        log(deployed.strategy.name, deployed.pair,
          `[${mode}] OPENED ${side} | Qty: ${trade.quantity.toFixed(6)} | Fill: $${fillPrice} | Fee: $${fee.toFixed(4)} | OrderID: ${order.id} | ${reason}`);

        emitTradeUpdate(deployed.userId, {
          type: "OPEN",
          trade,
          strategyName: deployed.strategy.name,
          pair: deployed.pair,
        });

        const liveOpenContent = buildTradeOpenedNotification({
          side,
          strategyName: deployed.strategy.name,
          pair: deployed.pair,
          entry: fillPrice,
          quantity: trade.quantity,
          sl: slOverride,
          tp: tpOverride,
          leverage: leverageOverride ?? readLeverage(deployed.config),
          trigger: reason,
        });
        createNotification({
          userId: deployed.userId,
          type: "trade_open",
          title: liveOpenContent.title,
          message: liveOpenContent.message,
          telegramHtml: liveOpenContent.telegramHtml,
          data: { pair: deployed.pair, side, price: fillPrice, strategyName: deployed.strategy.name, deployedId: deployed.id },
        }).catch(() => {});

        return trade;
      } catch (err) {
        console.error("[ORDER ERROR RAW]", err);
        const msg = (err as Error).message || String(err);
        log(deployed.strategy.name, deployed.pair, `[${mode}] ORDER FAILED: ${msg}`);

        emitTradeUpdate(deployed.userId, {
          type: "ERROR",
          error: `Failed to place ${side} order: ${msg}`,
          strategyName: deployed.strategy.name,
          pair: deployed.pair,
        });

        {
          const errContent = buildTradeErrorNotification({
            strategyName: deployed.strategy.name,
            pair: deployed.pair,
            side,
            error: msg,
          });
          createNotification({
            userId: deployed.userId,
            type: "trade_error",
            title: errContent.title,
            message: errContent.message,
            telegramHtml: errContent.telegramHtml,
            data: { pair: deployed.pair, side, strategyName: deployed.strategy.name, deployedId: deployed.id, error: msg },
          }).catch(() => {});
        }

        return null;
      }
    }

    // ── Paper trade: DB only ──
    const trade = await prisma.trade.create({
      data: {
        deployedStrategyId: deployed.id,
        pair: deployed.pair,
        side,
        entryPrice: price,
        quantity,
        status: "OPEN",
        sl: slOverride ?? null,
        tp: tpOverride ?? null,
      },
    });

    log(deployed.strategy.name, deployed.pair,
      `[${mode}] OPENED ${side} | Qty: ${quantity.toFixed(6)} | Entry: $${price} | ${reason}`);

    emitTradeUpdate(deployed.userId, {
      type: "OPEN",
      trade,
      strategyName: deployed.strategy.name,
      pair: deployed.pair,
    });

    const paperOpenContent = buildTradeOpenedNotification({
      side,
      strategyName: deployed.strategy.name,
      pair: deployed.pair,
      entry: price,
      quantity,
      sl: slOverride,
      tp: tpOverride,
      leverage: leverageOverride ?? readLeverage(deployed.config),
      trigger: reason,
    });
    createNotification({
      userId: deployed.userId,
      type: "trade_open",
      title: paperOpenContent.title,
      message: paperOpenContent.message,
      telegramHtml: paperOpenContent.telegramHtml,
      data: { pair: deployed.pair, side, price, strategyName: deployed.strategy.name, deployedId: deployed.id },
    }).catch(() => {});

    return trade;
  }

  private async closeTrade(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    trade: Trade,
    exitPrice: number,
    reason: string,
  ): Promise<void> {
    const mode = isPaperTrade ? "PAPER" : "LIVE";
    let actualExitPrice = exitPrice;
    let fee = 0;
    let closeOrderId: string | undefined;

    if (!isPaperTrade) {
      // ── Real trade: place closing order ──
      try {
        const closeSide = trade.side === "BUY" ? "sell" : "buy";
        const leverage = readLeverage(deployed.config);
        const order = await exchangeService.placeMarketOrder(
          exchange,
          deployed.pair,
          closeSide as "buy" | "sell",
          trade.quantity,
          { leverage },
        );

        actualExitPrice = Number(order.average) || Number(order.price) || exitPrice;
        fee = Number(order.fee?.cost) || 0;
        closeOrderId = String(order.id);
      } catch (err) {
        // Don't close in DB if exchange order failed — retry next tick
        log(deployed.strategy.name, deployed.pair,
          `[${mode}] CLOSE FAILED for ${trade.side}: ${(err as Error).message} — will retry`);
        return;
      }
    }

    const direction = trade.side === "BUY" ? 1 : -1;
    const contractSize = await this.getContractSize(exchange, deployed.pair);
    const pnl = (actualExitPrice - trade.entryPrice) * trade.quantity * contractSize * direction - fee - trade.fee;
    const roundedPnl = Math.round(pnl * 10000) / 10000; // 4 decimal places for small PnL

    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        exitPrice: actualExitPrice,
        pnl: roundedPnl,
        fee: trade.fee + fee,
        status: "CLOSED",
        closedAt: new Date(),
        exchangeOrderId: closeOrderId
          ? `${trade.exchangeOrderId ?? ""}|${closeOrderId}`
          : trade.exchangeOrderId,
      },
    });

    log(deployed.strategy.name, deployed.pair,
      `[${mode}] CLOSED ${trade.side} | ${reason} | Exit: $${actualExitPrice} | PnL: $${roundedPnl.toFixed(2)}`);

    emitTradeUpdate(deployed.userId, {
      type: "CLOSE",
      reason,
      trade: { ...trade, exitPrice: actualExitPrice, pnl: roundedPnl, status: "CLOSED" },
      strategyName: deployed.strategy.name,
      pair: deployed.pair,
      pnl: roundedPnl,
    });

    const entryPriceNum = Number(trade.entryPrice);
    const pnlPct = entryPriceNum > 0
      ? ((actualExitPrice - entryPriceNum) / entryPriceNum) * 100 * (trade.side === "BUY" ? 1 : -1)
      : 0;
    const heldMs = trade.openedAt ? Date.now() - new Date(trade.openedAt).getTime() : 0;
    const closeContent = buildTradeClosedNotification({
      strategyName: deployed.strategy.name,
      pair: deployed.pair,
      side: trade.side as "BUY" | "SELL",
      entry: entryPriceNum,
      exit: actualExitPrice,
      pnl: roundedPnl,
      pnlPct,
      heldMs,
      reason,
    });
    createNotification({
      userId: deployed.userId,
      type: "trade_close",
      title: closeContent.title,
      message: closeContent.message,
      telegramHtml: closeContent.telegramHtml,
      data: { pair: deployed.pair, side: trade.side, exitPrice: actualExitPrice, pnl: roundedPnl, reason, strategyName: deployed.strategy.name, deployedId: deployed.id },
    }).catch(() => {});
  }

  // ── SL/TP Check (all strategies) ────────────────────────────

  private async checkStopLossAndTakeProfit(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const currentPrice = ticker.last ?? 0;
    if (!currentPrice) return;

    // Config-default percentage SL/TP (legacy / fallback when strategy
    // did not emit trade-level price levels).
    const takeProfitPct = config.takeProfit ?? 5;
    const stopLossPct = config.stopLoss ?? -3;

    for (const trade of deployed.trades.filter((t) => t.status === "OPEN")) {
      // Trade-level SL/TP (strategy-emitted, stored on the row) take priority.
      // Compared against currentPrice as absolute levels — same convention as
      // the backtest engine's position-manager check.
      if (trade.sl != null || trade.tp != null) {
        if (trade.sl != null) {
          const slHit = trade.side === "BUY"
            ? currentPrice <= trade.sl
            : currentPrice >= trade.sl;
          if (slHit) {
            await this.closeTrade(exchange, deployed, isPaperTrade, trade, currentPrice,
              `STOP LOSS at $${trade.sl.toFixed(4)}`);
            continue;
          }
        }
        if (trade.tp != null) {
          const tpHit = trade.side === "BUY"
            ? currentPrice >= trade.tp
            : currentPrice <= trade.tp;
          if (tpHit) {
            await this.closeTrade(exchange, deployed, isPaperTrade, trade, currentPrice,
              `TAKE PROFIT at $${trade.tp.toFixed(4)}`);
            continue;
          }
        }
        continue; // trade has explicit levels — never fall through to %-defaults
      }

      // Fallback: config-based percentage SL/TP for trades without explicit levels.
      const pnlPercent = trade.side === "BUY"
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      if (pnlPercent >= takeProfitPct) {
        await this.closeTrade(exchange, deployed, isPaperTrade, trade, currentPrice, `TAKE PROFIT (${pnlPercent.toFixed(2)}%)`);
      } else if (pnlPercent <= stopLossPct) {
        await this.closeTrade(exchange, deployed, isPaperTrade, trade, currentPrice, `STOP LOSS (${pnlPercent.toFixed(2)}%)`);
      }
    }
  }

  // ── Strategy: Meri Strategy (Multi-TF EMA + RSI) ─────────────

  private async executeMeriStrategy(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const positionSize = perTradeCapital(deployed);
    const leverage = readLeverage(deployed.config);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    try {
      // Fetch 1m candles (need enough for 15m resampling + EMA21 warmup)
      // 15m * 21 periods = 315 min, so ~400 1m candles is safe
      const ohlcv1m = await exchangeService.getCandles(exchange, deployed.pair, "1m", 400);
      if (!ohlcv1m || ohlcv1m.length < 200) {
        log(deployed.strategy.name, deployed.pair, `Insufficient 1m candle data (${ohlcv1m?.length ?? 0})`);
        return;
      }

      const candles1m = ohlcvToCandles(ohlcv1m);

      // Resample to 5m and 15m
      const candles5m = resampleCandles(candles1m, 5);
      const candles15m = resampleCandles(candles1m, 15);

      if (candles5m.length < 25 || candles15m.length < 25) return;

      // Compute indicators on each timeframe
      const ind5m = computeIndicators(candles5m, [
        { name: "EMA", period: 9 },
        { name: "EMA", period: 21 },
        { name: "RSI", period: 14 },
      ]);

      const ind15m = computeIndicators(candles15m, [
        { name: "EMA", period: 9 },
        { name: "EMA", period: 21 },
      ]);

      const ema9_5 = ind5m.ema?.[9];
      const ema21_5 = ind5m.ema?.[21];
      const rsi5 = ind5m.rsi;
      const ema9_15 = ind15m.ema?.[9];
      const ema21_15 = ind15m.ema?.[21];

      if (!ema9_5 || !ema21_5 || !rsi5 || !ema9_15 || !ema21_15) return;

      const len5 = ema9_5.length;
      const len15 = ema9_15.length;

      const currEma9_5 = ema9_5[len5 - 1];
      const currEma21_5 = ema21_5[len5 - 1];
      const prevEma9_5 = ema9_5[len5 - 2];
      const prevEma21_5 = ema21_5[len5 - 2];
      const currRsi = rsi5[len5 - 1];
      const currEma9_15 = ema9_15[len15 - 1];
      const currEma21_15 = ema21_15[len15 - 1];

      if ([currEma9_5, currEma21_5, prevEma9_5, prevEma21_5, currRsi, currEma9_15, currEma21_15].some(isNaN)) return;

      const goldenCross5m = prevEma9_5 <= prevEma21_5 && currEma9_5 > currEma21_5;
      const deathCross5m = prevEma9_5 >= prevEma21_5 && currEma9_5 < currEma21_5;
      const bullish15m = currEma9_15 > currEma21_15;
      const bearish15m = currEma9_15 < currEma21_15;

      const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const hasLong = openTrades.some((t) => t.side === "BUY");
      const hasShort = openTrades.some((t) => t.side === "SELL");
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, leverage, currentPrice);

      log(deployed.strategy.name, deployed.pair,
        `5m: EMA9=${currEma9_5.toFixed(2)} EMA21=${currEma21_5.toFixed(2)} RSI=${currRsi.toFixed(1)} | 15m: EMA9=${currEma9_15.toFixed(2)} EMA21=${currEma21_15.toFixed(2)} ${bullish15m ? "BULL" : "BEAR"}`);

      // ── EXIT: 5m crossover alone closes position (no RSI/15m needed) ──
      if (deathCross5m && hasLong) {
        for (const t of openTrades.filter((t) => t.side === "BUY")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice,
            `5m death cross — EMA9(${currEma9_5.toFixed(0)}) < EMA21(${currEma21_5.toFixed(0)})`);
        }
      }
      if (goldenCross5m && hasShort) {
        for (const t of openTrades.filter((t) => t.side === "SELL")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice,
            `5m golden cross — EMA9(${currEma9_5.toFixed(0)}) > EMA21(${currEma21_5.toFixed(0)})`);
        }
      }

      // ── ENTRY: Full confirmation needed (crossover + RSI + 15m) ──
      // Refresh open trades after exits
      const remainingTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const stillHasLong = remainingTrades.some((t) => t.side === "BUY");
      const stillHasShort = remainingTrades.some((t) => t.side === "SELL");

      if (goldenCross5m && currRsi > 60 && bullish15m && !stillHasLong) {
        await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
          `5m golden cross + RSI(${currRsi.toFixed(1)}) > 60 + 15m bullish`);
      }

      if (deathCross5m && currRsi < 40 && bearish15m && !stillHasShort) {
        await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
          `5m death cross + RSI(${currRsi.toFixed(1)}) < 40 + 15m bearish`);
      }
    } catch (err) {
      log(deployed.strategy.name, deployed.pair, `Meri Strategy error: ${(err as Error).message}`);
    }
  }

  // ── Strategy: Supertrend (15m + 1h) ──────────────────────────

  private async executeSupertrendStrategy(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = perTradeCapital(deployed);
    const leverage = readLeverage(deployed.config);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    try {
      // Need 1h data → 60 candles of 1h = 3600 1m candles
      const ohlcv1m = await exchangeService.getCandles(exchange, deployed.pair, "1m", 500);
      if (!ohlcv1m || ohlcv1m.length < 200) return;

      const candles1m = ohlcvToCandles(ohlcv1m);
      const candles15m = resampleCandles(candles1m, 15);
      const candles1h = resampleCandles(candles1m, 60);

      if (candles15m.length < 55 || candles1h.length < 15) return;

      const ind15m = computeIndicators(candles15m, [
        { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
        { name: "ADX", period: 14 },
        { name: "EMA", period: 50 },
        { name: "RSI", period: 14 },
      ]);
      const ind1h = computeIndicators(candles1h, [
        { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
      ]);

      const len15 = candles15m.length;
      const len1h = candles1h.length;

      // CLOSED-BAR ONLY (no look-ahead) — len-2 = just-closed bar; len-1 is
      // in-progress. Dedupe per 15m close so this fires exactly once per bar.
      const closedIdx15 = len15 - 2;
      const prevIdx15 = len15 - 3;
      const closedIdx1h = len1h - 2;
      if (closedIdx15 < 1 || closedIdx1h < 0) return;
      const closedBar15Ts = candles15m[closedIdx15].timestamp;
      const lastSeen = this.lastCandleTs.get(deployed.id) ?? 0;
      if (closedBar15Ts <= lastSeen) return;
      this.lastCandleTs.set(deployed.id, closedBar15Ts);

      const stDir = ind15m.supertrend?.direction[closedIdx15];
      const prevStDir = ind15m.supertrend?.direction[prevIdx15];
      const stValue = ind15m.supertrend?.value[closedIdx15];
      const adx = ind15m.adx?.[closedIdx15];
      const ema50 = ind15m.ema?.[50]?.[closedIdx15];
      const rsi = ind15m.rsi?.[closedIdx15];
      const stDir1h = ind1h.supertrend?.direction[closedIdx1h];

      if ([stDir, prevStDir, stValue, adx, ema50, rsi, stDir1h].some((v) => v === undefined || isNaN(v as number))) return;

      const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const hasLong = openTrades.some((t) => t.side === "BUY");
      const hasShort = openTrades.some((t) => t.side === "SELL");
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, leverage, currentPrice);

      const flipBullish = prevStDir === -1 && stDir === 1;
      const flipBearish = prevStDir === 1 && stDir === -1;

      log(deployed.strategy.name, deployed.pair,
        `15m: ST=${stDir === 1 ? "GREEN" : "RED"} ADX=${adx!.toFixed(1)} RSI=${rsi!.toFixed(1)} EMA50=${ema50!.toFixed(0)} | 1h: ST=${stDir1h === 1 ? "GREEN" : "RED"}`);

      // EXIT: SuperTrend flip against position
      if (flipBearish && hasLong) {
        for (const t of openTrades.filter((t) => t.side === "BUY")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, "SuperTrend flipped RED on 15m");
        }
      }
      if (flipBullish && hasShort) {
        for (const t of openTrades.filter((t) => t.side === "SELL")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, "SuperTrend flipped GREEN on 15m");
        }
      }

      // EXIT: ADX < 20
      if (adx! < 20) {
        for (const t of openTrades) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, `ADX fading (${adx!.toFixed(1)} < 20)`);
        }
        return;
      }

      // ENTRY: BUY
      if (flipBullish && adx! > 25 && currentPrice > ema50! && rsi! >= 40 && rsi! <= 70 && stDir1h === 1 && !hasLong) {
        const tpPct = Number(config.tpPercent ?? 6) / 100;
        await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
          `ST flip GREEN + ADX(${adx!.toFixed(1)}) + EMA50 + RSI(${rsi!.toFixed(1)}) + 1h GREEN | SL: $${stValue!.toFixed(2)}`);
      }

      // ENTRY: SELL
      if (flipBearish && adx! > 25 && currentPrice < ema50! && rsi! >= 30 && rsi! <= 60 && stDir1h === -1 && !hasShort) {
        const tpPct = Number(config.tpPercent ?? 6) / 100;
        await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
          `ST flip RED + ADX(${adx!.toFixed(1)}) + EMA50 + RSI(${rsi!.toFixed(1)}) + 1h RED | SL: $${stValue!.toFixed(2)}`);
      }
    } catch (err) {
      log(deployed.strategy.name, deployed.pair, `Supertrend error: ${(err as Error).message}`);
    }
  }

  // ── Strategy: Ravi Strategy (EMA15 on 1m) ────────────────────

  private async executeRaviStrategy(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = perTradeCapital(deployed);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    try {
      const TIMEFRAME_MS = 5 * 60 * 1000;
      const ohlcv = await exchangeService.getCandles(exchange, deployed.pair, "5m", 50);
      if (!ohlcv || ohlcv.length < 20) return;

      const candles = ohlcvToCandles(ohlcv);

      // Ravi acts on candle close only. The latest candle is usually the still-
      // forming one — the one before it is the most recently CLOSED 5m candle.
      // Skip this tick entirely if we've already processed that closed candle.
      const latestTs = candles[candles.length - 1].timestamp;
      const nowMs = Date.now();
      const latestIsClosed = nowMs - latestTs >= TIMEFRAME_MS;
      const closedIdx = latestIsClosed ? candles.length - 1 : candles.length - 2;
      if (closedIdx < 0) return;
      const closedTs = candles[closedIdx].timestamp;
      const lastSeen = this.lastCandleTs.get(deployed.id) ?? 0;
      if (closedTs <= lastSeen) return; // same 5m candle — nothing new to act on

      const indicators = computeIndicators(candles, [{ name: "EMA", period: 15 }]);
      const ema15 = indicators.ema?.[15];
      if (!ema15) return;

      const currEma = ema15[closedIdx];
      const currClose = candles[closedIdx].close;

      if (isNaN(currEma)) return;

      this.lastCandleTs.set(deployed.id, closedTs);

      const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const hasLong = openTrades.some((t) => t.side === "BUY");
      const hasShort = openTrades.some((t) => t.side === "SELL");

      const leverage = Number(config.leverage ?? 1);
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, leverage, currentPrice);

      const slPct = Number(config.slPercent ?? 1) / 100;
      const tpPct = Number(config.tpPercent ?? 2) / 100;

      const isAbove = currClose > currEma;
      const isBelow = currClose < currEma;

      log(deployed.strategy.name, deployed.pair,
        `Close=$${currClose.toFixed(2)} EMA15=$${currEma.toFixed(2)} ${isAbove ? "ABOVE" : "BELOW"} | Qty=${quantity}`);

      // Close above EMA → should be LONG
      if (isAbove) {
        if (hasShort) {
          for (const t of openTrades.filter((t) => t.side === "SELL")) {
            await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice,
              `Close ($${currClose.toFixed(2)}) > EMA15 ($${currEma.toFixed(2)}) — reversing`);
          }
        }
        if (!hasLong) {
          await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
            `Close ($${currClose.toFixed(2)}) > EMA15 ($${currEma.toFixed(2)})`);
        }
      }

      // Close below EMA → should be SHORT
      if (isBelow) {
        if (hasLong) {
          for (const t of openTrades.filter((t) => t.side === "BUY")) {
            await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice,
              `Close ($${currClose.toFixed(2)}) < EMA15 ($${currEma.toFixed(2)}) — reversing`);
          }
        }
        if (!hasShort) {
          await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
            `Close ($${currClose.toFixed(2)}) < EMA15 ($${currEma.toFixed(2)})`);
        }
      }
    } catch (err) {
      log(deployed.strategy.name, deployed.pair, `Ravi Strategy error: ${(err as Error).message}`);
    }
  }

  // ── Strategy: Quick Test (Broker Connection Test) ────────────

  private async executeQuickTest(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");

    // If no open trade → open one immediately
    if (openTrades.length === 0) {
      const leverage = Number(config.leverage ?? 1);
      const quantity = await this.calculateQuantity(exchange, deployed.pair, deployed.investedAmount, leverage, currentPrice);
      const slPct = Number(config.slPercent ?? 1) / 100;
      const tpPct = Number(config.tpPercent ?? 1) / 100;

      await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
        `Quick test — broker connection check at $${currentPrice.toFixed(2)}`);
    } else {
      // Close trade after 2 ticks (2 minutes)
      const oldest = openTrades[openTrades.length - 1];
      const ageMs = Date.now() - new Date(oldest.openedAt).getTime();
      if (ageMs > 2 * 60 * 1000) { // 2 minutes
        await this.closeTrade(exchange, deployed, isPaperTrade, oldest, currentPrice,
          `Quick test — auto-close after 2 min`);
      }
    }
  }

  // ── Strategy: CPR Pivot (Intraday) ───────────────────────────

  private async executeCPRStrategy(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    try {
      // Fetch 1-day worth of 1m candles for previous day OHLC + today's action
      const ohlcv1m = await exchangeService.getCandles(exchange, deployed.pair, "1m", 1440 * 2);
      if (!ohlcv1m || ohlcv1m.length < 1440) return;

      const candles = ohlcvToCandles(ohlcv1m);

      // Group by day (UTC)
      const dayMap = new Map<string, Candle[]>();
      for (const c of candles) {
        const day = new Date(c.timestamp).toISOString().slice(0, 10);
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push(c);
      }

      const days = Array.from(dayMap.keys()).sort();
      if (days.length < 2) return;

      const prevDay = days[days.length - 2];
      const prevCandles = dayMap.get(prevDay)!;

      const prevHigh = Math.max(...prevCandles.map((c) => c.high));
      const prevLow = Math.min(...prevCandles.map((c) => c.low));
      const prevClose = prevCandles[prevCandles.length - 1].close;

      const pivot = (prevHigh + prevLow + prevClose) / 3;
      const bc = (prevHigh + prevLow) / 2;
      const tcRaw = 2 * pivot - bc;
      const tc = Math.max(tcRaw, bc);
      const botCPR = Math.min(tcRaw, bc);
      const cprWidth = tc - botCPR;
      const cprPercent = (cprWidth / pivot) * 100;
      const isNarrow = cprPercent < 0.15;
      const isWide = cprPercent > 0.4;

      const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const hasLong = openTrades.some((t) => t.side === "BUY");
      const hasShort = openTrades.some((t) => t.side === "SELL");
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);
      const fadingSlPct = Number(config.fadingSlPercent ?? 0.3) / 100;

      log(deployed.strategy.name, deployed.pair,
        `CPR: TC=$${tc.toFixed(2)} BC=$${botCPR.toFixed(2)} Width=${cprPercent.toFixed(3)}% ${isNarrow ? "NARROW" : isWide ? "WIDE" : "NORMAL"} | PDH=$${prevHigh.toFixed(2)} PDL=$${prevLow.toFixed(2)}`);

      // EXIT logic
      if (hasLong && currentPrice < botCPR) {
        for (const t of openTrades.filter((t) => t.side === "BUY")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, `Price below BC ($${botCPR.toFixed(2)})`);
        }
      }
      if (hasShort && currentPrice > tc) {
        for (const t of openTrades.filter((t) => t.side === "SELL")) {
          await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, `Price above TC ($${tc.toFixed(2)})`);
        }
      }

      if (hasLong || hasShort) return;

      // ENTRY: Narrow CPR breakout
      if (isNarrow) {
        if (currentPrice > tc) {
          const sl = tc - cprWidth * 0.5;
          const tp = prevHigh > currentPrice ? prevHigh : currentPrice + cprWidth;
          await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
            `NARROW CPR (${cprPercent.toFixed(3)}%) breakout above TC ($${tc.toFixed(2)}) | SL: $${sl.toFixed(2)}`);
        }
        if (currentPrice < botCPR) {
          const sl = botCPR + cprWidth * 0.5;
          const tp = prevLow < currentPrice ? prevLow : currentPrice - cprWidth;
          await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
            `NARROW CPR (${cprPercent.toFixed(3)}%) breakout below BC ($${botCPR.toFixed(2)}) | SL: $${sl.toFixed(2)}`);
        }
      }

      // ENTRY: Wide CPR fade
      if (isWide) {
        const pdhProx = Math.abs(currentPrice - prevHigh) / prevHigh;
        const pdlProx = Math.abs(currentPrice - prevLow) / prevLow;

        if (pdhProx < 0.001 && currentPrice >= prevHigh * 0.999) {
          const sl = prevHigh * (1 + fadingSlPct);
          await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
            `WIDE CPR fade at PDH ($${prevHigh.toFixed(2)}) | SL: $${sl.toFixed(2)}`);
        }
        if (pdlProx < 0.001 && currentPrice <= prevLow * 1.001) {
          const sl = prevLow * (1 - fadingSlPct);
          await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
            `WIDE CPR fade at PDL ($${prevLow.toFixed(2)}) | SL: $${sl.toFixed(2)}`);
        }
      }
    } catch (err) {
      log(deployed.strategy.name, deployed.pair, `CPR error: ${(err as Error).message}`);
    }
  }

  // ── Close All (for pause/stop/delete) ───────────────────────

  async closeAllOpenTrades(deployedId: string): Promise<{ closed: number; totalPnl: number }> {
    const deployed = await prisma.deployedStrategy.findUnique({
      where: { id: deployedId },
      include: {
        strategy: true,
        broker: true,
        user: { select: { email: true } },
        trades: { where: { status: "OPEN" } },
      },
    });

    if (!deployed || deployed.trades.length === 0) {
      return { closed: 0, totalPnl: 0 };
    }

    const isPaperTrade =
      deployed.mode === "PAPER" || deployed.user.email === LEGACY_PAPER_TRADE_EMAIL;
    let currentPrice = 0;

    try {
      const exchange = exchangeService.getExchange(
        deployed.brokerId,
        deployed.broker.exchangeId,
        deployed.broker.apiKey,
        deployed.broker.apiSecret,
        deployed.broker.passphrase || undefined,
      );
      const ticker = await exchangeService.getTicker(exchange, deployed.pair);
      currentPrice = ticker.last ?? 0;

      if (!currentPrice) return { closed: 0, totalPnl: 0 };

      let totalPnl = 0;
      const contractSize = await this.getContractSize(exchange, deployed.pair);
      for (const trade of deployed.trades) {
        await this.closeTrade(exchange, deployed as DeployedWithRelations, isPaperTrade, trade, currentPrice, "FORCE CLOSED");
        const direction = trade.side === "BUY" ? 1 : -1;
        totalPnl += (currentPrice - trade.entryPrice) * trade.quantity * contractSize * direction;
      }

      // Update portfolio value
      const allClosed = await prisma.trade.findMany({
        where: { deployedStrategyId: deployedId, status: "CLOSED" },
        select: { pnl: true },
      });
      const realizedPnl = allClosed.reduce((s, t) => s + t.pnl, 0);
      await prisma.deployedStrategy.update({
        where: { id: deployedId },
        data: { currentValue: Math.round((deployed.investedAmount + realizedPnl) * 100) / 100 },
      });

      return { closed: deployed.trades.length, totalPnl: Math.round(totalPnl * 100) / 100 };
    } catch (err) {
      console.error(`[Worker] Failed to close trades:`, (err as Error).message);
      return { closed: 0, totalPnl: 0 };
    }
  }

  // ── Strategy: Grid ──────────────────────────────────────────

  private async executeGrid(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const gridSize = config.gridSize || 5;
    const gridSpacing = config.gridSpacing || 0.5;
    const positionSize = config.positionSize || (deployed.investedAmount / gridSize);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");

    if (openTrades.length < gridSize) {
      const lastTrade = openTrades[0];
      if (lastTrade) {
        const priceDiff = Math.abs(currentPrice - lastTrade.entryPrice) / lastTrade.entryPrice * 100;
        if (priceDiff < gridSpacing) return;
      }

      const side: "BUY" | "SELL" = !lastTrade || currentPrice < lastTrade.entryPrice ? "BUY" : "SELL";
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);

      await this.openTrade(exchange, deployed, isPaperTrade, side, currentPrice, quantity, `Grid level ${openTrades.length + 1}/${gridSize}`);
    }
  }

  // ── Strategy: DCA ───────────────────────────────────────────

  private async executeDCA(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const intervalHours = config.intervalHours || 24;
    const baseAmount = config.baseAmount || (deployed.investedAmount * 0.05);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    const lastTrade = deployed.trades[0];
    if (lastTrade) {
      const hoursSinceLast = (Date.now() - lastTrade.openedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < intervalHours) return;
    }

    const quantity = await this.calculateQuantity(exchange, deployed.pair, baseAmount, 1, currentPrice);
    await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity, `DCA buy (every ${intervalHours}h)`);
  }

  // ── Strategy: Trend (EMA Crossover + MACD) ──────────────────

  private async executeTrend(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
    { indicators }: { indicators: IndicatorValues; candles: Candle[] },
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    const ema9 = indicators.ema?.[9];
    const ema21 = indicators.ema?.[21];
    const histogram = indicators.macd?.histogram;

    if (!ema9 || !ema21 || !histogram) return;

    const len = ema9.length;
    if (len < 2) return;

    const currEma9 = ema9[len - 1];
    const currEma21 = ema21[len - 1];
    const prevEma9 = ema9[len - 2];
    const prevEma21 = ema21[len - 2];
    const currHist = histogram[len - 1];

    if (isNaN(currEma9) || isNaN(currEma21) || isNaN(prevEma9) || isNaN(prevEma21) || isNaN(currHist)) return;

    const goldenCross = prevEma9 <= prevEma21 && currEma9 > currEma21;
    const deathCross = prevEma9 >= prevEma21 && currEma9 < currEma21;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
    const hasLong = openTrades.some((t) => t.side === "BUY");
    const hasShort = openTrades.some((t) => t.side === "SELL");
    const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);

    // Golden cross + bullish MACD → BUY
    if (goldenCross && currHist > 0 && !hasLong) {
      // Close shorts first
      for (const t of openTrades.filter((t) => t.side === "SELL")) {
        await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, "Golden cross signal");
      }
      await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity, "EMA golden cross + MACD bullish");
    }

    // Death cross + bearish MACD → SELL
    if (deathCross && currHist < 0 && !hasShort) {
      for (const t of openTrades.filter((t) => t.side === "BUY")) {
        await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice, "Death cross signal");
      }
      await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity, "EMA death cross + MACD bearish");
    }
  }

  // ── Strategy: Mean Reversion (RSI + Bollinger Bands) ────────

  private async executeMeanReversion(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
    { indicators }: { indicators: IndicatorValues; candles: Candle[] },
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    const rsi = indicators.rsi;
    const bb = indicators.bb;

    if (!rsi || !bb) return;

    const len = rsi.length;
    const currRsi = rsi[len - 1];
    const lowerBB = bb.lower[len - 1];
    const upperBB = bb.upper[len - 1];
    const middleBB = bb.middle[len - 1];

    if (isNaN(currRsi) || isNaN(lowerBB) || isNaN(upperBB) || isNaN(middleBB)) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
    const hasLong = openTrades.some((t) => t.side === "BUY");
    const hasShort = openTrades.some((t) => t.side === "SELL");
    const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);

    // Oversold + price at lower BB → BUY
    if (currRsi < 30 && currentPrice <= lowerBB && !hasLong) {
      await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
        `RSI oversold (${currRsi.toFixed(1)}) + lower BB ($${lowerBB.toFixed(2)})`);
    }

    // Overbought + price at upper BB → SELL
    if (currRsi > 70 && currentPrice >= upperBB && !hasShort) {
      await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
        `RSI overbought (${currRsi.toFixed(1)}) + upper BB ($${upperBB.toFixed(2)})`);
    }

    // Exit long when RSI normalizes or price reaches middle BB
    if (hasLong && (currRsi > 50 || currentPrice >= middleBB)) {
      for (const t of openTrades.filter((t) => t.side === "BUY")) {
        await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice,
          `RSI normalized (${currRsi.toFixed(1)}) / middle BB reached`);
      }
    }

    // Exit short when RSI normalizes or price reaches middle BB
    if (hasShort && (currRsi < 50 || currentPrice <= middleBB)) {
      for (const t of openTrades.filter((t) => t.side === "SELL")) {
        await this.closeTrade(exchange, deployed, isPaperTrade, t, currentPrice,
          `RSI normalized (${currRsi.toFixed(1)}) / middle BB reached`);
      }
    }
  }

  // ── Strategy: Scalping (RSI + EMA) ──────────────────────────

  private async executeScalping(
    exchange: Exchange,
    deployed: DeployedWithRelations,
    isPaperTrade: boolean,
    ticker: Ticker,
    { indicators }: { indicators: IndicatorValues; candles: Candle[] },
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = config.positionSize || (deployed.investedAmount * 0.05); // smaller for scalping
    const currentPrice = ticker.last || 0;
    if (!currentPrice) return;

    const rsi = indicators.rsi;
    const ema9 = indicators.ema?.[9];
    const ema21 = indicators.ema?.[21];

    if (!rsi || !ema9 || !ema21) return;

    const len = rsi.length;
    const currRsi = rsi[len - 1];
    const currEma9 = ema9[len - 1];
    const currEma21 = ema21[len - 1];

    if (isNaN(currRsi) || isNaN(currEma9) || isNaN(currEma21)) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
    const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);

    // Max 1 position for scalping
    if (openTrades.length > 0) return;

    // Oversold in uptrend → quick BUY (dip buy)
    if (currRsi < 35 && currentPrice > currEma9 && currEma9 > currEma21) {
      await this.openTrade(exchange, deployed, isPaperTrade, "BUY", currentPrice, quantity,
        `Scalp BUY: RSI ${currRsi.toFixed(1)} < 35, uptrend (EMA9 > EMA21)`);
    }

    // Overbought in downtrend → quick SELL
    if (currRsi > 65 && currentPrice < currEma9 && currEma9 < currEma21) {
      await this.openTrade(exchange, deployed, isPaperTrade, "SELL", currentPrice, quantity,
        `Scalp SELL: RSI ${currRsi.toFixed(1)} > 65, downtrend (EMA9 < EMA21)`);
    }
  }

  // ── Portfolio Value Update ──────────────────────────────────

  private async updatePortfolioValue(deployed: DeployedWithRelations, ticker: Ticker): Promise<void> {
    const currentPrice = ticker.last || 0;

    // Get contract size for accurate PnL
    const exchange = exchangeService.getExchange(
      deployed.brokerId, deployed.broker.exchangeId,
      deployed.broker.apiKey, deployed.broker.apiSecret,
      deployed.broker.passphrase || undefined,
    );
    const contractSize = await this.getContractSize(exchange, deployed.pair);

    const closedTrades = await prisma.trade.findMany({
      where: { deployedStrategyId: deployed.id, status: "CLOSED" },
      select: { pnl: true },
    });
    const realizedPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
    const unrealizedPnl = openTrades.reduce((sum, t) => {
      const direction = t.side === "BUY" ? 1 : -1;
      return sum + (currentPrice - t.entryPrice) * t.quantity * contractSize * direction;
    }, 0);

    const currentValue = deployed.investedAmount + realizedPnl + unrealizedPnl;

    await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { currentValue: Math.round(currentValue * 10000) / 10000 },
    });
  }
}

export const strategyWorker = new StrategyWorker();
