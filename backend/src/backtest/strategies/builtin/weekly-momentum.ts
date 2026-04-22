import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Weekly Momentum Swing (Weekly, long-only)
 *
 * The highest expectancy, lowest frequency strategy in the book. Fires on
 * WEEKLY candle closes only — maybe 3–10 trades across three years — but
 * each trade is aimed at catching a major cyclic bull run from the base.
 *
 * The idea: institutions rotate capital on weekly/monthly timescales. If
 * a weekly breakout above the 8-week high occurs while the weekly trend
 * stack is bullish (EMA10 > EMA30), you're joining a rotation that
 * typically lasts weeks to months.
 *
 * Exit is simple: close < 10-week EMA. No fixed TP — cycle tops take time.
 *
 * Timeframe
 *   Weekly execution (10080-minute resample)
 *
 * Indicators
 *   EMA(10)  weekly — dynamic trend line + exit rail
 *   EMA(30)  weekly — regime confirmation
 *   ATR(14)  weekly — initial SL distance
 *   Rolling 8-week high of closes — breakout level
 *
 * Entry — LONG (all conditions true on signal weekly bar)
 *   1. EMA(10) > EMA(30)
 *   2. Close > EMA(10)
 *   3. Close >= rolling 8-week high of CLOSES (prior 8 weeks, exclusive)
 *
 * Exits
 *   1. Close < EMA(10)   → close long
 *   2. Initial SL: entry − 2 × ATR (disaster stop only)
 *
 * Execution
 *   Entry at NEXT weekly bar's open. Soft exit at signal bar's close.
 */

const EMA_FAST = 10;
const EMA_SLOW = 30;
const ATR_PERIOD = 14;
const BREAKOUT_LOOKBACK = 8;
const INITIAL_SL_ATR_MULT = 2;
const TF_MINUTES = 60 * 24 * 7; // 10080

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

/** Rolling max of closes over the previous `period` bars (not including current). */
function rollingMaxClose(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period; i < candles.length; i++) {
    let mx = -Infinity;
    for (let j = i - period; j < i; j++) if (candles[j].close > mx) mx = candles[j].close;
    out[i] = mx;
  }
  return out;
}

interface Precomputed {
  mapHtf: Int32Array;
  candlesHtf: Candle[];
  ema10: number[];
  ema30: number[];
  atr: number[];
  breakoutLevel: number[];
}

let precomputed: Precomputed | null = null;

export function resetWeeklyMomentumCache(): void {
  precomputed = null;
}

export function precomputeWeeklyMomentum(allCandles: Candle[]): void {
  if (allCandles.length === 0) {
    precomputed = null;
    return;
  }
  const candlesHtf = resampleCandles(allCandles, TF_MINUTES);
  const ind = computeIndicators(candlesHtf, [
    { name: "EMA", period: EMA_FAST },
    { name: "EMA", period: EMA_SLOW },
  ]);
  const atr = computeATR(candlesHtf, ATR_PERIOD);
  const breakoutLevel = rollingMaxClose(candlesHtf, BREAKOUT_LOOKBACK);

  const mapHtf = new Int32Array(allCandles.length);
  let j = 0;
  for (let i = 0; i < allCandles.length; i++) {
    while (
      j + 1 < candlesHtf.length &&
      candlesHtf[j + 1].timestamp <= allCandles[i].timestamp
    ) {
      j++;
    }
    mapHtf[i] = j;
  }

  precomputed = {
    mapHtf,
    candlesHtf,
    ema10: ind.ema?.[EMA_FAST] ?? [],
    ema30: ind.ema?.[EMA_SLOW] ?? [],
    atr,
    breakoutLevel,
  };
}

export const weeklyMomentumStrategy: BacktestStrategy = {
  name: "Weekly Momentum Swing",
  description:
    "Weekly long-only breakout swing. Enters when weekly close prints a fresh 8-week high of closes AND weekly EMA10>EMA30 trend stack is bullish. Exits on first weekly close below EMA10 (soft) or -2x ATR disaster stop. No fixed TP - designed to catch the full cyclic bull wave (weeks to months). Typically 3-10 trades across 3 years of BTC data.",
  defaultConfig: {
    leverage: 1,
    positionSizePercent: 80,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];
    const { index, positions, equity, config } = ctx;
    const { mapHtf, candlesHtf, ema10, ema30, atr, breakoutLevel } = precomputed;

    const signals: Signal[] = [];

    if (index === 0 || mapHtf[index] === mapHtf[index - 1]) return signals;

    const idxHtf = mapHtf[index];
    const signalIdx = idxHtf - 1;

    if (signalIdx < Math.max(EMA_SLOW, BREAKOUT_LOOKBACK, ATR_PERIOD) + 2) return signals;

    const signalBar = candlesHtf[signalIdx];
    const nextBarOpen = candlesHtf[idxHtf]?.open ?? signalBar.close;

    const e10 = ema10[signalIdx];
    const e30 = ema30[signalIdx];
    const a = atr[signalIdx];
    const bl = breakoutLevel[signalIdx];

    if ([e10, e30, a, bl].some((v) => v === undefined || !Number.isFinite(v)))
      return signals;

    const hasLong = positions.some((p) => p.side === "BUY");

    // Exit: weekly close below EMA10
    if (hasLong && signalBar.close < e10) {
      signals.push({
        action: "CLOSE_LONG",
        entryPrice: signalBar.close,
        reason: `Weekly close below EMA10 (${e10.toFixed(2)})`,
      });
      return signals;
    }

    if (hasLong) return signals;

    // Entry
    const bullRegime = e10 > e30 && signalBar.close > e10;
    const breakout = signalBar.close >= bl;

    if (bullRegime && breakout) {
      const leverage = Number(config.leverage ?? 1);
      const sizePct =
        Math.max(1, Math.min(100, Number(config.positionSizePercent ?? 80))) / 100;
      const qty = (equity * sizePct) / nextBarOpen;
      const sl = nextBarOpen - INITIAL_SL_ATR_MULT * a;
      signals.push({
        action: "BUY",
        qty,
        leverage,
        entryPrice: nextBarOpen,
        sl,
        tp: undefined,
        reason: `Weekly 8-week breakout ${signalBar.close.toFixed(2)} >= ${bl.toFixed(2)}, EMA10>EMA30`,
      });
    }

    return signals;
  },
};
