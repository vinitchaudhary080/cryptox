import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import {
  type PrecomputedGann,
  computeGannPrecompute,
  leverageToCapitalPct,
} from "./gann-helpers.js";

/**
 * Gann Matrix Momentum V3 — Fixed SL / TP
 *
 * Same entry as V1 (EMA20/50 cross on 15m inside the 0°–180° Gann zone).
 *
 * EXIT (fixed only — no EMA-cross exit):
 *   • Stop-loss: 2% adverse move from entry
 *   • Take-profit: 4% favorable move from entry
 *
 * Risk:Reward = 1 : 2. Positions close only when SL or TP is hit by the engine.
 */

const SL_PCT = 0.02; // 2%
const TP_PCT = 0.04; // 4%

let precomputed: PrecomputedGann | null = null;

export function precomputeGannV3Strategy(allCandles: Candle[]): void {
  precomputed = computeGannPrecompute(allCandles);
}

export function resetGannV3StrategyCache(): void {
  precomputed = null;
}

export const gannMatrixMomentumV3: BacktestStrategy = {
  name: "Gann Matrix Momentum V3",
  description:
    "V3: Same Gann + EMA20/50 entry as V1. Fixed exits only — SL 2% / TP 4% " +
    "from entry price (R:R = 1:2). No EMA-cross exit.",
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

    const signals: Signal[] = [];
    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    if (bullishCross && inLongZone && !hasLong) {
      const sl = price * (1 - SL_PCT);
      const tp = price * (1 + TP_PCT);
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl,
        tp,
        reason: `EMA20 ↑ EMA50 + price $${price.toFixed(2)} in Gann zone | SL $${sl.toFixed(2)} (-2%) TP $${tp.toFixed(2)} (+4%)`,
      });
    }

    if (bearishCross && inShortZone && !hasShort) {
      const sl = price * (1 + SL_PCT);
      const tp = price * (1 - TP_PCT);
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl,
        tp,
        reason: `EMA20 ↓ EMA50 + price $${price.toFixed(2)} in Gann zone | SL $${sl.toFixed(2)} (+2%) TP $${tp.toFixed(2)} (-4%)`,
      });
    }

    return signals;
  },
};
