import type { BacktestStrategy, CandleContext, Signal, Candle, IndicatorValues } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Meri Strategy V2 — same entry/exit logic as V1 (5m EMA9/21 crossover + RSI
 * filter + 15m trend confirmation, SL 2% / TP 4% defaults) BUT position
 * sizing is ALWAYS 50% of the CURRENT equity at the moment of entry.
 *
 * Compounding example (the user's ask):
 *   Start: $100
 *   Trade 1 → deploys $50 (50% of 100). Profit $10 → equity = $110
 *   Trade 2 → deploys $55 (50% of 110). Loss $5  → equity = $105
 *   Trade 3 → deploys $52.50 (50% of 105). ...and so on.
 *
 * Capital % is fixed at 50% — not configurable via UI (unlike V1). Leverage,
 * SL, TP stay configurable.
 */

const FIXED_EQUITY_PERCENT = 0.5;

let precomputed: {
  map5m: Int32Array;
  map15m: Int32Array;
  ind5m: IndicatorValues;
  ind15m: IndicatorValues;
  candles5m: Candle[];
} | null = null;

export function precomputeMeriV2Strategy(allCandles: Candle[]): void {
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

  const map5m = new Int32Array(allCandles.length);
  const map15m = new Int32Array(allCandles.length);

  let j5 = 0;
  let j15 = 0;

  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j5 + 1 < candles5m.length && candles5m[j5 + 1].timestamp <= ts) j5++;
    map5m[i] = j5;
    while (j15 + 1 < candles15m.length && candles15m[j15 + 1].timestamp <= ts) j15++;
    map15m[i] = j15;
  }

  precomputed = { map5m, map15m, ind5m, ind15m, candles5m };
}

export function resetMeriV2StrategyCache(): void {
  precomputed = null;
}

export const meriStrategyV2: BacktestStrategy = {
  name: "Meri Strategy V2",
  description:
    "V2: Same 5m EMA9/21 + RSI + 15m confirmation entries as V1. Position size is ALWAYS 50% of current equity (compounds — $100 → $50 trade → $10 profit → next trade uses $55). SL/TP configurable.",
  defaultConfig: {
    slPercent: 2,
    tpPercent: 4,
    leverage: 1,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (!precomputed || index < 100) return signals;

    const { map5m, map15m, ind5m, ind15m, candles5m } = precomputed;

    const idx5 = map5m[index];
    const prevIdx5 = idx5 > 0 ? idx5 - 1 : -1;
    if (prevIdx5 < 0) return signals;

    const currEma9_5 = ind5m.ema?.[9]?.[idx5];
    const currEma21_5 = ind5m.ema?.[21]?.[idx5];
    const prevEma9_5 = ind5m.ema?.[9]?.[prevIdx5];
    const prevEma21_5 = ind5m.ema?.[21]?.[prevIdx5];
    const currRsi = ind5m.rsi?.[idx5];

    if (
      currEma9_5 === undefined ||
      currEma21_5 === undefined ||
      prevEma9_5 === undefined ||
      prevEma21_5 === undefined ||
      currRsi === undefined
    )
      return signals;

    if ([currEma9_5, currEma21_5, prevEma9_5, prevEma21_5, currRsi].some(isNaN)) return signals;

    const idx15 = map15m[index];
    const currEma9_15 = ind15m.ema?.[9]?.[idx15];
    const currEma21_15 = ind15m.ema?.[21]?.[idx15];

    if (currEma9_15 === undefined || currEma21_15 === undefined) return signals;
    if (isNaN(currEma9_15) || isNaN(currEma21_15)) return signals;

    // Only trigger on 5m boundary (every 5th 1m candle) to avoid duplicate signals
    if (map5m[index] === map5m[index - 1]) return signals;

    const slPct = Number(config.slPercent ?? 2) / 100;
    const tpPct = Number(config.tpPercent ?? 4) / 100;
    const leverage = Number(config.leverage ?? 1);

    // ⚡ V2 rule — position size always 50% of CURRENT equity (compounds).
    // Execute at the JUST-CLOSED 5m bar's close (what the strategy reasoned
    // about and what the user sees on the chart), not the random 1m tick.
    const execPrice = prevIdx5 >= 0 && candles5m[prevIdx5]
      ? candles5m[prevIdx5].close
      : candle.close;
    const capitalDeployed = equity * FIXED_EQUITY_PERCENT;
    const qty = capitalDeployed / execPrice;

    const goldenCross5m = prevEma9_5 <= prevEma21_5 && currEma9_5 > currEma21_5;
    const deathCross5m = prevEma9_5 >= prevEma21_5 && currEma9_5 < currEma21_5;
    const bullish15m = currEma9_15 > currEma21_15;
    const bearish15m = currEma9_15 < currEma21_15;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // EXIT: Close on 5m crossover alone
    if (deathCross5m && hasLong) {
      signals.push({
        action: "CLOSE_LONG",
        entryPrice: execPrice,
        reason: `5m death cross — EMA9(${currEma9_5.toFixed(0)}) < EMA21(${currEma21_5.toFixed(0)})`,
      });
    }
    if (goldenCross5m && hasShort) {
      signals.push({
        action: "CLOSE_SHORT",
        entryPrice: execPrice,
        reason: `5m golden cross — EMA9(${currEma9_5.toFixed(0)}) > EMA21(${currEma21_5.toFixed(0)})`,
      });
    }

    // BUY entry
    if (goldenCross5m && currRsi > 60 && bullish15m && !hasLong) {
      signals.push({
        action: "BUY",
        qty,
        leverage,
        entryPrice: execPrice,
        sl: execPrice * (1 - slPct),
        tp: execPrice * (1 + tpPct),
        reason: `[50% equity = $${capitalDeployed.toFixed(2)}] 5m golden cross + RSI(${currRsi.toFixed(1)}) > 60 + 15m bullish`,
      });
    }

    // SELL entry
    if (deathCross5m && currRsi < 40 && bearish15m && !hasShort) {
      signals.push({
        action: "SELL",
        qty,
        leverage,
        entryPrice: execPrice,
        sl: execPrice * (1 + slPct),
        tp: execPrice * (1 - tpPct),
        reason: `[50% equity = $${capitalDeployed.toFixed(2)}] 5m death cross + RSI(${currRsi.toFixed(1)}) < 40 + 15m bearish`,
      });
    }

    return signals;
  },
};
