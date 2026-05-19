/**
 * Precompute-function registry — slug → fn map.
 *
 * Every backtest strategy that needs pre-resampled candles or rolling
 * indicators exposes a separate `precomputeXxx(allCandles)` function
 * that's invoked ONCE before the per-bar onCandle loop. This registry
 * lets the live worker dispatch to the right precompute by slug —
 * same dispatch the backtest engine does via a hardcoded if/else chain.
 *
 * Convention: when adding a new strategy file that exports a precompute
 * function, register it here too. Strategies that don't have precompute
 * (stateless ones using only ctx.candle + ctx.indicators) don't need an
 * entry — the executor's `getPrecomputeFn` will return null and skip
 * the precompute step.
 *
 * Started minimal (one strategy) to keep the AWS deploy surface small.
 * Expand as more strategies are pushed to live.
 */
import type { Candle } from "../types.js";
import { precomputeSupertrend5mFast } from "./builtin/supertrend-5m-fast.js";

type PrecomputeFn = (allCandles: Candle[]) => void;

export const PRECOMPUTE_FNS: Record<string, PrecomputeFn> = {
  "supertrend-5m-fast": precomputeSupertrend5mFast,
};

export function getPrecomputeFn(slug: string): PrecomputeFn | null {
  return PRECOMPUTE_FNS[slug] ?? null;
}
