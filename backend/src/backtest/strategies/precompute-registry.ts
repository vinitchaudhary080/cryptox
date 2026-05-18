/**
 * Precompute-function registry — slug → fn map.
 *
 * Why this exists: every backtest strategy that needs more than a single
 * candle's worth of state (multi-timeframe, EMA200, ADX, rolling stdev,
 * Ichimoku Kumo, etc.) exposes a separate `precomputeXxx(allCandles)`
 * function that pre-resamples + pre-computes indicators ONCE before the
 * onCandle loop. The backtest engine has a hardcoded if/else chain that
 * dispatches to the right precompute by `strategyName`.
 *
 * The live worker needs the same dispatch — but the worker doesn't know
 * about each strategy file individually. This registry provides a
 * stable, additive map keyed by the same slug as `BUILTIN_STRATEGIES`
 * in strategy-runner.ts.
 *
 * Convention: when adding a new strategy that needs precompute, register
 * it here too. Strategies WITHOUT a precompute function (stateless ones
 * that work off ctx.candle + ctx.indicators only) don't need an entry —
 * the executor will just skip the precompute step.
 *
 * Status: starting with the strategies that have been actively deployed
 * (07-zscore-mean-reversion-1h, supertrend-5m-fast). Expand as needed.
 */
import type { Candle } from "../types.js";
import { precomputeZScoreMeanReversion1h } from "./builtin/07-zscore-mean-reversion-1h.js";
import { precomputeSupertrend5mFast } from "./builtin/supertrend-5m-fast.js";
import { precomputeSupertrendStrategy } from "./builtin/supertrend-strategy.js";
import { precomputeSupertrend1hSwing } from "./builtin/supertrend-1h-swing.js";
import { precomputeIchimokuRenkoTrend } from "./builtin/ichimoku-renko-trend.js";

type PrecomputeFn = (allCandles: Candle[]) => void;

export const PRECOMPUTE_FNS: Record<string, PrecomputeFn> = {
  "07-zscore-mean-reversion-1h": precomputeZScoreMeanReversion1h,
  "supertrend-5m-fast": precomputeSupertrend5mFast,
  "supertrend-strategy": precomputeSupertrendStrategy,
  "supertrend-1h-swing": precomputeSupertrend1hSwing,
  "ichimoku-renko-trend-follower": precomputeIchimokuRenkoTrend,
};

export function getPrecomputeFn(slug: string): PrecomputeFn | null {
  return PRECOMPUTE_FNS[slug] ?? null;
}
