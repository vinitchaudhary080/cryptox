import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import {
  type PrecomputedGann,
  computeGannPrecompute,
  leverageToCapitalPct,
} from "./gann-helpers.js";

/**
 * Gann Matrix Momentum V2 — Scale-out at 360°
 *
 * Same entry as V1 (EMA20/50 cross on 15m inside the 0°–180° Gann zone).
 *
 * EXIT (two-leg):
 *   • Leg A (50% qty): fixed TP at the 360° Gann level (r360 for longs, s360 for shorts).
 *   • Leg B (50% qty): exits only on the opposite EMA20/50 cross.
 *
 * If the opposite cross fires before 360° is reached, both legs exit on the cross
 * (CLOSE_LONG/CLOSE_SHORT closes every open position on that side).
 */

let precomputed: PrecomputedGann | null = null;

export function precomputeGannV2Strategy(allCandles: Candle[]): void {
  precomputed = computeGannPrecompute(allCandles);
}

export function resetGannV2StrategyCache(): void {
  precomputed = null;
}

export const gannMatrixMomentumV2: BacktestStrategy = {
  name: "Gann Matrix Momentum V2",
  description:
    "V2: Same Gann + EMA20/50 entry as V1. Scales out — 50% qty booked at the " +
    "360° Gann level (fixed TP), remaining 50% exits on the opposite EMA cross.",
  defaultConfig: {
    leverage: 5,
    positionSizePercent: 100,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];

    const { candle, index, positions, equity, config } = ctx;
    const { map15m, ema20, ema50, gannAtCandle } = precomputed;

    // Fire only when we transition into a new 15m bucket — gap-resilient.
    // Evaluate against the bucket that just CLOSED to avoid look-ahead bias.
    if (index === 0 || map15m[index] === map15m[index - 1]) return [];

    const idx15m = map15m[index] - 1;
    if (idx15m < 51) return [];

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

    const price = candle.close;
    const inLongZone = price > gann.pivot && price < gann.r180;
    const inShortZone = price < gann.pivot && price > gann.s180;

    const leverage = Number(config.leverage ?? 5);
    const capitalPct = leverageToCapitalPct(leverage);
    const qty = (equity * capitalPct) / price;
    const halfQty = qty / 2;

    const signals: Signal[] = [];
    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    if (hasLong && bearishCross) {
      signals.push({
        action: "CLOSE_LONG",
        reason: `EMA20 (${currEma20.toFixed(2)}) ↓ EMA50 (${currEma50.toFixed(2)}) — exit remaining long`,
      });
    }
    if (hasShort && bullishCross) {
      signals.push({
        action: "CLOSE_SHORT",
        reason: `EMA20 (${currEma20.toFixed(2)}) ↑ EMA50 (${currEma50.toFixed(2)}) — exit remaining short`,
      });
    }

    if (bullishCross && inLongZone && !hasLong) {
      signals.push({
        action: "BUY",
        qty: halfQty,
        leverage,
        sl: undefined,
        tp: gann.r360,
        reason: `[Leg A 50% → TP 360°=$${gann.r360.toFixed(2)}] EMA20 ↑ EMA50 + price $${price.toFixed(2)} in Gann zone`,
      });
      signals.push({
        action: "BUY",
        qty: halfQty,
        leverage,
        sl: undefined,
        tp: undefined,
        reason: `[Leg B 50% → EMA-cross exit] EMA20 ↑ EMA50 + price $${price.toFixed(2)} in Gann zone`,
      });
    }

    if (bearishCross && inShortZone && !hasShort) {
      signals.push({
        action: "SELL",
        qty: halfQty,
        leverage,
        sl: undefined,
        tp: gann.s360,
        reason: `[Leg A 50% → TP -360°=$${gann.s360.toFixed(2)}] EMA20 ↓ EMA50 + price $${price.toFixed(2)} in Gann zone`,
      });
      signals.push({
        action: "SELL",
        qty: halfQty,
        leverage,
        sl: undefined,
        tp: undefined,
        reason: `[Leg B 50% → EMA-cross exit] EMA20 ↓ EMA50 + price $${price.toFixed(2)} in Gann zone`,
      });
    }

    return signals;
  },
};
