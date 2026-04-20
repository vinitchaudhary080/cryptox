import type { BacktestStrategy, CandleContext, Signal, Candle, IndicatorValues } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Meri Strategy — Multi-Timeframe EMA + RSI
 *
 * BUY:  EMA(9) crosses above EMA(21) on 5m chart AND RSI(14) > 60
 *       + Confirmation: EMA(9) > EMA(21) on 15m chart (trend alignment)
 *
 * SELL: EMA(9) crosses below EMA(21) on 5m chart AND RSI(14) < 40
 *       + Confirmation: EMA(9) < EMA(21) on 15m chart (trend alignment)
 */

// Pre-computed multi-timeframe data — set once before backtest loop
let precomputed: {
  // Maps 1m candle index → corresponding 5m indicator index
  map5m: Int32Array;
  map15m: Int32Array;
  ind5m: IndicatorValues;
  ind15m: IndicatorValues;
  candles5m: Candle[];
} | null = null;

/** Call before backtest loop starts to pre-compute all multi-TF data */
export function precomputeMeriStrategy(allCandles: Candle[]): void {
  const candles5m = resampleCandles(allCandles, 5);
  const candles15m = resampleCandles(allCandles, 15);

  const ind5m = computeIndicators(candles5m, [
    { name: "EMA", period: 9 },
    { name: "EMA", period: 21 },
    { name: "RSI", period: 14 },
  ]);

  const ind15m = computeIndicators(candles15m, [
    { name: "EMA", period: 9 },
    { name: "EMA", period: 21 },
  ]);

  // Build mapping: for each 1m candle index, find the last completed 5m/15m candle index
  const map5m = new Int32Array(allCandles.length);
  const map15m = new Int32Array(allCandles.length);

  let j5 = 0;
  let j15 = 0;

  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;

    // Find the last 5m candle that started at or before this 1m candle
    while (j5 + 1 < candles5m.length && candles5m[j5 + 1].timestamp <= ts) j5++;
    map5m[i] = j5;

    while (j15 + 1 < candles15m.length && candles15m[j15 + 1].timestamp <= ts) j15++;
    map15m[i] = j15;
  }

  precomputed = { map5m, map15m, ind5m, ind15m, candles5m };
}

/** Reset pre-computed data */
export function resetMeriStrategyCache(): void {
  precomputed = null;
}

export const meriStrategy: BacktestStrategy = {
  name: "Meri Strategy",
  description: "Multi-timeframe EMA crossover + RSI. BUY when EMA(9) crosses above EMA(21) on 5m with RSI > 60, confirmed by 15m trend alignment. SELL on reverse crossover with RSI < 40.",
  defaultConfig: {
    slPercent: 2,
    tpPercent: 4,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [], // computed internally via precompute

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (!precomputed || index < 100) return signals;

    const { map5m, map15m, ind5m, ind15m, candles5m } = precomputed;

    // Get current and previous 5m indicator indices
    const idx5 = map5m[index];
    const prevIdx5 = idx5 > 0 ? idx5 - 1 : -1;
    if (prevIdx5 < 0) return signals;

    // 5m indicators
    const currEma9_5 = ind5m.ema?.[9]?.[idx5];
    const currEma21_5 = ind5m.ema?.[21]?.[idx5];
    const prevEma9_5 = ind5m.ema?.[9]?.[prevIdx5];
    const prevEma21_5 = ind5m.ema?.[21]?.[prevIdx5];
    const currRsi = ind5m.rsi?.[idx5];

    if (currEma9_5 === undefined || currEma21_5 === undefined ||
        prevEma9_5 === undefined || prevEma21_5 === undefined ||
        currRsi === undefined) return signals;

    if ([currEma9_5, currEma21_5, prevEma9_5, prevEma21_5, currRsi].some(isNaN)) return signals;

    // 15m indicators
    const idx15 = map15m[index];
    const currEma9_15 = ind15m.ema?.[9]?.[idx15];
    const currEma21_15 = ind15m.ema?.[21]?.[idx15];

    if (currEma9_15 === undefined || currEma21_15 === undefined) return signals;
    if (isNaN(currEma9_15) || isNaN(currEma21_15)) return signals;

    // Only trigger on 5m boundary (every 5th 1m candle) to avoid duplicate signals
    if (map5m[index] === map5m[index - 1]) return signals;

    // Strategy params
    const slPct = Number(config.slPercent ?? 2) / 100;
    const tpPct = Number(config.tpPercent ?? 4) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    // Asymmetric execution model (matches broker/live behaviour):
    //   Entry = NEXT bar's OPEN,  Exit = SIGNAL bar's CLOSE
    const signalBarClose = candles5m[prevIdx5]?.close ?? candle.close;
    const nextBarOpen    = candles5m[idx5]?.open     ?? signalBarClose;
    const qty = (equity * sizePct) / nextBarOpen;

    const goldenCross5m = prevEma9_5 <= prevEma21_5 && currEma9_5 > currEma21_5;
    const deathCross5m = prevEma9_5 >= prevEma21_5 && currEma9_5 < currEma21_5;
    const bullish15m = currEma9_15 > currEma21_15;
    const bearish15m = currEma9_15 < currEma21_15;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // ── EXIT: Close on 5m crossover alone (no RSI/15m needed for exit) ──
    // Death cross on 5m → close any open long
    if (deathCross5m && hasLong) {
      signals.push({ action: "CLOSE_LONG", reason: `5m death cross — EMA9(${currEma9_5.toFixed(0)}) < EMA21(${currEma21_5.toFixed(0)})` });
    }
    // Golden cross on 5m → close any open short
    if (goldenCross5m && hasShort) {
      signals.push({ action: "CLOSE_SHORT", reason: `5m golden cross — EMA9(${currEma9_5.toFixed(0)}) > EMA21(${currEma21_5.toFixed(0)})` });
    }

    // ── ENTRY: Full confirmation needed (crossover + RSI + 15m) ──
    // BUY: 5m golden cross + RSI > 60 + 15m bullish
    if (goldenCross5m && currRsi > 60 && bullish15m && !hasLong) {
      signals.push({
        action: "BUY",
        qty,
        leverage,
        entryPrice: nextBarOpen,
        sl: nextBarOpen * (1 - slPct),
        tp: nextBarOpen * (1 + tpPct),
        reason: `5m golden cross + RSI(${currRsi.toFixed(1)}) > 60 + 15m bullish`,
      });
    }

    // SELL: 5m death cross + RSI < 40 + 15m bearish
    if (deathCross5m && currRsi < 40 && bearish15m && !hasShort) {
      signals.push({
        action: "SELL",
        qty,
        leverage,
        entryPrice: nextBarOpen,
        sl: nextBarOpen * (1 + slPct),
        tp: nextBarOpen * (1 - tpPct),
        reason: `5m death cross + RSI(${currRsi.toFixed(1)}) < 40 + 15m bearish`,
      });
    }

    return signals;
  },
};
