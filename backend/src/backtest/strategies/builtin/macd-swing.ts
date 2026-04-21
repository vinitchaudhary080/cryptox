import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * MACD Crossover Swing (15m)
 *
 * Rules (as specified by user):
 *   - Timeframe: 15m
 *   - Indicators: MACD(12,26,9), EMA(50), RSI(14), ATR(14)
 *
 *   BUY entry (ALL true):
 *     - MACD line crosses above signal line
 *       prev bar: MACD <= Signal, signal bar: MACD > Signal
 *     - Histogram momentum rising: hist[0] > hist[1] > hist[2]
 *     - Close > EMA(50)
 *     - RSI between 45 and 70
 *
 *   SELL entry (ALL true):
 *     - MACD line crosses below signal line
 *     - Histogram momentum falling: hist[0] < hist[1] < hist[2]
 *     - Close < EMA(50)
 *     - RSI between 30 and 55
 *
 *   SL:     BUY  = low of signal candle,  SELL = high of signal candle
 *   Target: BUY  = entry + 2·ATR,         SELL = entry - 2·ATR
 *   BE:     when unrealized profit >= 1·ATR, move SL to entry price
 *   Exit:   MACD reversal (priority) | SL hit | TP hit
 *
 * Execution follows the project-wide rule saved in memory:
 *   Entry = OPEN of bar AFTER the signal bar (next 15m bucket)
 *   Exit  = CLOSE of the signal bar (the bar whose close triggered the exit)
 *   Indicators only read from signalIdx15 and earlier — zero look-ahead.
 */

const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const EMA_PERIOD = 50;
const RSI_PERIOD = 14;
const ATR_PERIOD = 14;

/* Local ATR — same Wilder smoothing as sr-breakout does. */
function computeATR(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length === 0) return out;

  const tr: number[] = new Array(candles.length).fill(0);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
  }

  if (candles.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

interface Precomputed {
  map15m: Int32Array;
  candles15m: Candle[];
  macd: number[];
  signal: number[];
  hist: number[];
  ema50: number[];
  rsi: number[];
  atr: number[];
}

let precomputed: Precomputed | null = null;

/**
 * Per-position breakeven armed flag. Cleared whenever a fresh backtest
 * resets the cache (reset function below). Using a Map keyed by position
 * id lets us track each individual position without interfering with
 * other strategies.
 */
const breakevenArmed = new Map<string, boolean>();

export function resetMacdSwingCache(): void {
  precomputed = null;
  breakevenArmed.clear();
}

export function precomputeMacdSwing(allCandles: Candle[]): void {
  if (allCandles.length === 0) {
    precomputed = null;
    return;
  }

  const candles15m = resampleCandles(allCandles, 15);
  const ind = computeIndicators(candles15m, [
    { name: "MACD", params: { fastPeriod: MACD_FAST, slowPeriod: MACD_SLOW, signalPeriod: MACD_SIGNAL } },
    { name: "EMA", period: EMA_PERIOD },
    { name: "RSI", period: RSI_PERIOD },
  ]);

  const atr = computeATR(candles15m, ATR_PERIOD);

  // Map every 1m index to its containing 15m bucket index
  const map15m = new Int32Array(allCandles.length);
  let j = 0;
  for (let i = 0; i < allCandles.length; i++) {
    while (
      j + 1 < candles15m.length &&
      candles15m[j + 1].timestamp <= allCandles[i].timestamp
    ) {
      j++;
    }
    map15m[i] = j;
  }

  precomputed = {
    map15m,
    candles15m,
    macd: ind.macd?.macd ?? [],
    signal: ind.macd?.signal ?? [],
    hist: ind.macd?.histogram ?? [],
    ema50: ind.ema?.[EMA_PERIOD] ?? [],
    rsi: ind.rsi ?? [],
    atr,
  };
}

export const macdSwingStrategy: BacktestStrategy = {
  name: "MACD Crossover Swing",
  description:
    "15m MACD(12,26,9) crossover swing with rising/falling histogram confirmation, EMA(50) trend filter, and RSI(14) zone filter. SL at signal candle's low/high, 2x ATR target, and automatic breakeven stop move when unrealized profit reaches 1x ATR. Exits on MACD reversal, SL, or TP.",
  defaultConfig: {
    leverage: 1,
    positionSizePercent: 25,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];

    const { candle, index, positions, equity, config } = ctx;
    const {
      map15m,
      candles15m,
      macd,
      signal,
      hist,
      ema50,
      rsi,
      atr,
    } = precomputed;

    const signals: Signal[] = [];

    // ─── Breakeven SL management runs every 1m tick, not only on HTF
    //     boundaries — otherwise the breakeven move would be delayed by
    //     up to 15 minutes. Each open position is checked against the
    //     current 1m candle's high/low to see if it has moved 1·ATR in
    //     our favour at any point. Direct sl mutation is fine because
    //     positions are returned by reference (see PositionManager).
    for (const pos of positions) {
      if (breakevenArmed.get(pos.id)) continue;
      // Snapshot the ATR at the time of the position's entry bucket.
      // It's good enough to use the most recent closed 15m ATR.
      const idxAtEntry = map15m[index];
      const atrRef = atr[idxAtEntry - 1];
      if (!Number.isFinite(atrRef) || atrRef <= 0) continue;

      const favourableMove =
        pos.side === "BUY"
          ? candle.high - pos.entryPrice
          : pos.entryPrice - candle.low;

      if (favourableMove >= atrRef) {
        pos.sl = pos.entryPrice;
        breakevenArmed.set(pos.id, true);
      }
    }

    // ─── Signal evaluation only on 15m bucket transitions
    if (index === 0 || map15m[index] === map15m[index - 1]) return signals;

    const idx15 = map15m[index];
    const signalIdx15 = idx15 - 1;          // just-CLOSED bar = signal bar
    const prevSignalIdx15 = idx15 - 2;      // bar before signal bar
    const prev2SignalIdx15 = idx15 - 3;     // two bars before signal bar

    // Warmup: need enough history for all indicators + 3 hist bars back.
    const minIdx = Math.max(MACD_SLOW + MACD_SIGNAL, EMA_PERIOD, RSI_PERIOD, ATR_PERIOD) + 3;
    if (signalIdx15 < minIdx) return signals;

    const signalBar = candles15m[signalIdx15];
    const nextBar = candles15m[idx15];
    const nextBarOpen = nextBar?.open ?? signalBar.close;

    // Indicator snapshots at signal bar + previous bar + 2 bars back
    const curMacd = macd[signalIdx15];
    const prevMacd = macd[prevSignalIdx15];
    const curSig = signal[signalIdx15];
    const prevSig = signal[prevSignalIdx15];
    const hist0 = hist[signalIdx15];
    const hist1 = hist[prevSignalIdx15];
    const hist2 = hist[prev2SignalIdx15];
    const curEma = ema50[signalIdx15];
    const curRsi = rsi[signalIdx15];
    const curAtr = atr[signalIdx15];

    if (
      [
        curMacd,
        prevMacd,
        curSig,
        prevSig,
        hist0,
        hist1,
        hist2,
        curEma,
        curRsi,
        curAtr,
      ].some((v) => v === undefined || !Number.isFinite(v))
    ) {
      return signals;
    }

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // ─── MACD reversal — PRIORITY exit for open positions
    const macdCrossUp = prevMacd <= prevSig && curMacd > curSig;
    const macdCrossDown = prevMacd >= prevSig && curMacd < curSig;

    if (hasLong && macdCrossDown) {
      signals.push({
        action: "CLOSE_LONG",
        entryPrice: signalBar.close,
        reason: `MACD reversal (death cross) — exit long`,
      });
    }
    if (hasShort && macdCrossUp) {
      signals.push({
        action: "CLOSE_SHORT",
        entryPrice: signalBar.close,
        reason: `MACD reversal (golden cross) — exit short`,
      });
    }

    // ─── Entry logic — only one side at a time, skip if already positioned
    if (hasLong || hasShort) return signals;

    // Histogram momentum
    const histUp = hist0 > hist1 && hist1 > hist2;
    const histDown = hist0 < hist1 && hist1 < hist2;

    // Trend + RSI filters
    const trendBull = signalBar.close > curEma;
    const trendBear = signalBar.close < curEma;
    const rsiBull = curRsi >= 45 && curRsi <= 70;
    const rsiBear = curRsi >= 30 && curRsi <= 55;

    const leverage = Number(config.leverage ?? 1);
    const sizePct =
      Math.max(1, Math.min(100, Number(config.positionSizePercent ?? 25))) / 100;
    const qty = (equity * sizePct) / nextBarOpen;

    if (macdCrossUp && histUp && trendBull && rsiBull) {
      // BUY
      const sl = signalBar.low;           // Low of signal candle
      const tp = nextBarOpen + 2 * curAtr; // 2x ATR target
      signals.push({
        action: "BUY",
        qty,
        leverage,
        entryPrice: nextBarOpen,
        sl,
        tp,
        reason: `MACD ${curMacd.toFixed(2)}>Sig ${curSig.toFixed(2)}, hist rising, close>EMA50, RSI=${curRsi.toFixed(1)}`,
      });
    } else if (macdCrossDown && histDown && trendBear && rsiBear) {
      // SELL
      const sl = signalBar.high;          // High of signal candle
      const tp = nextBarOpen - 2 * curAtr;
      signals.push({
        action: "SELL",
        qty,
        leverage,
        entryPrice: nextBarOpen,
        sl,
        tp,
        reason: `MACD ${curMacd.toFixed(2)}<Sig ${curSig.toFixed(2)}, hist falling, close<EMA50, RSI=${curRsi.toFixed(1)}`,
      });
    }

    return signals;
  },
};
