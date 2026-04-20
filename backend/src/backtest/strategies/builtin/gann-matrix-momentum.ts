import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import {
  type PrecomputedGann,
  computeGannPrecompute,
  leverageToCapitalPct,
} from "./gann-helpers.js";

/**
 * Gann Matrix Momentum V1 — Multi-timeframe trend following with Gann Square of 9
 *
 * COMPONENTS:
 *   1. Gann Square of 9 (anchored on Weekly "kryptec" source)
 *      kryptec = (H + L + 4*C) / 6
 *      Levels: 0° (pivot), ±180° = (√pivot ± 1.0)²
 *
 *   2. EMA 20 / EMA 50 crossover on 15-minute resampled candles
 *
 * RULES:
 *   LONG:  EMA20 > EMA50 cross + price in [0°, 180°] sweet zone
 *   SHORT: EMA20 < EMA50 cross + price in [-180°, 0°] sweet zone
 *   EXIT:  Opposite EMA cross (no fixed SL/TP)
 *
 * POSITION SIZING (leverage-based inverse):
 *   5x → 100% capital | 10x → 40% | 20x → 20%
 */

let precomputed: PrecomputedGann | null = null;

export function precomputeGannStrategy(allCandles: Candle[]): void {
  precomputed = computeGannPrecompute(allCandles);
}

export function resetGannStrategyCache(): void {
  precomputed = null;
}

export const gannMatrixMomentum: BacktestStrategy = {
  name: "Gann Matrix Momentum",
  description:
    "Multi-timeframe trend following: Gann Square of 9 (Weekly kryptec pivot) " +
    "for trend zones, EMA 20/50 crossover on 15m for entries. Trades only in " +
    "the 0°–180° (longs) or -180°–0° (shorts) sweet zone. Exit on opposite EMA cross.",
  defaultConfig: {
    leverage: 5,
    positionSizePercent: 100,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];

    const { candle, index, positions, equity, config } = ctx;
    const { map15m, ema20, ema50, gannAtCandle, candles15m } = precomputed;

    // Fire only when we transition into a new 15m bucket — gap-resilient.
    // Evaluate against the bucket that just CLOSED to avoid look-ahead bias.
    if (index === 0 || map15m[index] === map15m[index - 1]) return [];

    const idx15m = map15m[index] - 1;
    if (idx15m < 51) return [];
    // Asymmetric execution model (matches broker/live behaviour):
    //   Entry = NEXT bar's OPEN,  Exit = SIGNAL bar's CLOSE
    const signalBarClose = candles15m[idx15m]?.close ?? candle.close;
    const nextBarOpen    = candles15m[idx15m + 1]?.open ?? signalBarClose;

    const currEma20 = ema20[idx15m];
    const prevEma20 = ema20[idx15m - 1];
    const currEma50 = ema50[idx15m];
    const prevEma50 = ema50[idx15m - 1];

    if (isNaN(currEma20) || isNaN(currEma50) || isNaN(prevEma20) || isNaN(prevEma50)) {
      return [];
    }

    const bullishCross = prevEma20 <= prevEma50 && currEma20 > currEma50;
    const bearishCross = prevEma20 >= prevEma50 && currEma20 < currEma50;

    const gann = gannAtCandle[index];
    if (!gann) return [];

    const price = signalBarClose;
    const inLongZone = price > gann.pivot && price < gann.r180;
    const inShortZone = price < gann.pivot && price > gann.s180;

    const leverage = Number(config.leverage ?? 5);
    const capitalPct = leverageToCapitalPct(leverage);
    const qty = (equity * capitalPct) / nextBarOpen;

    const signals: Signal[] = [];
    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    if (hasLong && bearishCross) {
      signals.push({
        action: "CLOSE_LONG",
        entryPrice: signalBarClose,
        reason: `EMA20 (${currEma20.toFixed(2)}) ↓ EMA50 (${currEma50.toFixed(2)}) — exit long`,
      });
    }
    if (hasShort && bullishCross) {
      signals.push({
        action: "CLOSE_SHORT",
        entryPrice: signalBarClose,
        reason: `EMA20 (${currEma20.toFixed(2)}) ↑ EMA50 (${currEma50.toFixed(2)}) — exit short`,
      });
    }

    if (bullishCross && inLongZone && !hasLong) {
      signals.push({
        action: "BUY",
        entryPrice: nextBarOpen,
        qty,
        leverage,
        sl: undefined,
        tp: undefined,
        reason: `EMA20 ↑ EMA50 + price $${price.toFixed(2)} in Gann [0°=$${gann.pivot.toFixed(2)}, 180°=$${gann.r180.toFixed(2)}]`,
      });
    }

    if (bearishCross && inShortZone && !hasShort) {
      signals.push({
        action: "SELL",
        entryPrice: nextBarOpen,
        qty,
        leverage,
        sl: undefined,
        tp: undefined,
        reason: `EMA20 ↓ EMA50 + price $${price.toFixed(2)} in Gann [-180°=$${gann.s180.toFixed(2)}, 0°=$${gann.pivot.toFixed(2)}]`,
      });
    }

    return signals;
  },
};
