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
import { precomputeSupertrend1hSwing } from "./builtin/supertrend-1h-swing.js";
import { precomputeZScoreMeanReversion1h } from "./builtin/07-zscore-mean-reversion-1h.js";
import { precomputeZScoreMeanReversion15m } from "./builtin/07-zscore-mean-reversion-15m.js";
import { precomputeChopTrendTransition1h } from "./builtin/v7-chop-trend-transition-1h.js";

type PrecomputeFn = (allCandles: Candle[]) => void;

export const PRECOMPUTE_FNS: Record<string, PrecomputeFn> = {
  "supertrend-5m-fast": precomputeSupertrend5mFast,
  "supertrend-1h-swing": precomputeSupertrend1hSwing,
  "07-zscore-mean-reversion-1h": precomputeZScoreMeanReversion1h,
  "07-zscore-mean-reversion-15m": precomputeZScoreMeanReversion15m,
  "v7-chop-trend-transition-1h": precomputeChopTrendTransition1h,
};

export function getPrecomputeFn(slug: string): PrecomputeFn | null {
  return PRECOMPUTE_FNS[slug] ?? null;
}
