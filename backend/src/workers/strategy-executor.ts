import { PrismaClient, type DeployedStrategy, type Strategy, type Broker, type Trade, type User } from "@prisma/client";
import { exchangeService } from "../services/exchange.service.js";
import { emitTradeUpdate, emitPortfolioUpdate } from "../websocket/socket.js";
import { createNotification } from "../services/notification.service.js";
import type { Exchange, Ticker, OHLCV } from "ccxt";
import { computeIndicators } from "../backtest/indicators/index.js";
import { resampleCandles } from "../backtest/indicators/resample.js";
import type { Candle, IndicatorConfig, IndicatorValues } from "../backtest/types.js";

const prisma = new PrismaClient();

const PAPER_TRADE_EMAIL = "test@cryptox.com";
const CANDLE_LOOKBACK = 100; // fetch last 100 candles for indicator computation

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

    const isPaperTrade = deployed.user.email === PAPER_TRADE_EMAIL;
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
  ): Promise<Trade | null> {
    const mode = isPaperTrade ? "PAPER" : "LIVE";

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

        const fillPrice = Number(order.average ?? order.price ?? price);
        const fee = Number(order.fee?.cost ?? 0);

        const trade = await prisma.trade.create({
          data: {
            deployedStrategyId: deployed.id,
            pair: deployed.pair,
            side,
            entryPrice: fillPrice,
            quantity: Number(order.filled ?? quantity),
            fee,
            status: "OPEN",
            exchangeOrderId: order.id,
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

        createNotification({
          userId: deployed.userId,
          type: "trade_open",
          title: `${side} ${deployed.pair}`,
          message: `${deployed.strategy.name} opened ${side} at $${fillPrice.toFixed(2)} (${reason})`,
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

    createNotification({
      userId: deployed.userId,
      type: "trade_open",
      title: `${side} ${deployed.pair}`,
      message: `${deployed.strategy.name} opened ${side} at $${price.toFixed(2)} (${reason})`,
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

        actualExitPrice = Number(order.average ?? order.price ?? exitPrice);
        fee = Number(order.fee?.cost ?? 0);
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

    createNotification({
      userId: deployed.userId,
      type: "trade_close",
      title: `Closed ${trade.side} ${deployed.pair}`,
      message: `${deployed.strategy.name} closed at $${actualExitPrice.toFixed(2)} — ${roundedPnl >= 0 ? "+" : ""}$${roundedPnl.toFixed(2)} (${reason})`,
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

    const takeProfit = config.takeProfit ?? 5;
    const stopLoss = config.stopLoss ?? -3;

    for (const trade of deployed.trades.filter((t) => t.status === "OPEN")) {
      const pnlPercent = trade.side === "BUY"
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      if (pnlPercent >= takeProfit) {
        await this.closeTrade(exchange, deployed, isPaperTrade, trade, currentPrice, `TAKE PROFIT (${pnlPercent.toFixed(2)}%)`);
      } else if (pnlPercent <= stopLoss) {
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
    const config = (deployed.config as Record<string, number>) || {};
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);
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
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);

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
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);
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

      const stDir = ind15m.supertrend?.direction[len15 - 1];
      const prevStDir = ind15m.supertrend?.direction[len15 - 2];
      const stValue = ind15m.supertrend?.value[len15 - 1];
      const adx = ind15m.adx?.[len15 - 1];
      const ema50 = ind15m.ema?.[50]?.[len15 - 1];
      const rsi = ind15m.rsi?.[len15 - 1];
      const stDir1h = ind1h.supertrend?.direction[len1h - 1];

      if ([stDir, prevStDir, stValue, adx, ema50, rsi, stDir1h].some((v) => v === undefined || isNaN(v as number))) return;

      const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
      const hasLong = openTrades.some((t) => t.side === "BUY");
      const hasShort = openTrades.some((t) => t.side === "SELL");
      const quantity = await this.calculateQuantity(exchange, deployed.pair, positionSize, 1, currentPrice);

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
      const quantity = await this.calculateQuantity(exchange, deployed.pair, deployed.investedAmount, leverage, currentPrice);

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

    const isPaperTrade = deployed.user.email === PAPER_TRADE_EMAIL;
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
