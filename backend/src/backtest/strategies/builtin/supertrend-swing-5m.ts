import type { BacktestStrategy, CandleContext, Signal, Candle, IndicatorValues } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Supertrend 5m SWING (variant of supertrend-1h-swing)
 *
 * Fastest sibling of supertrend-1h-swing — same proven filter stack but
 * executed on 5m bars with 4H HTF confirmation. Highest trade frequency
 * in the family, captures intraday swings.
 *
 * - 5m execution (was 1H)
 * - 4H HTF confirmation (unchanged)
 * - SAME ADX > 25, EMA(50h time-anchored => period 600 on 5m),
 *   RSI(14), SuperTrend(10,3) stack
 *
 * LEVERAGE — capped at 2x per platform risk policy (1-2x hard rule).
 * Effective notional: 100% size × 2x lev = 200% (vs source 25% × 5x = 125%).
 *
 * EXPECTED CHARACTERISTICS
 *   - ~12x more trades than 1H sibling
 *   - Heavy fee drag — needs strong ST flip + ADX + 4H alignment to net out
 *   - Smallest per-trade R, fastest turnover
 */

// Per-coin precompute cache. Keyed by `(firstCandleTimestamp, lastCandleTimestamp,
// candleCount)` of the data passed to precompute — uniquely identifies a backtest
// run's input. A single shared `precomputed` variable was a real bug in
// parallel multi-coin batches: every coin's precompute call overwrote the
// module-level state, so SOL's onCandle would end up reading e.g. DOGE's
// indicator arrays via SOL's `idx5m` — producing nonsensical SL values
// like $1.44 on a $95 SOL trade (May 2026 incident).
type PrecomputeBundle = {
  map5m: Int32Array;
  map4h: Int32Array;
  ind5m: IndicatorValues;
  ind4h: IndicatorValues;
};
const cache = new Map<string, PrecomputeBundle>();

function cacheKey(allCandles: Candle[]): string {
  if (allCandles.length === 0) return "empty";
  const first = allCandles[0].timestamp;
  const last = allCandles[allCandles.length - 1].timestamp;
  return `${first}:${last}:${allCandles.length}`;
}

export function precomputeSupertrendSwing5m(allCandles: Candle[]): void {
  const key = cacheKey(allCandles);
  if (cache.has(key)) return; // already done for this exact dataset

  const candles5m = resampleCandles(allCandles, 5);
  const candles4h = resampleCandles(allCandles, 240);

  const ind5m = computeIndicators(candles5m, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
    { name: "ADX", period: 14 },
    { name: "EMA", period: 600 },
    { name: "RSI", period: 14 },
  ]);
  const ind4h = computeIndicators(candles4h, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
  ]);

  const map5m = new Int32Array(allCandles.length);
  const map4h = new Int32Array(allCandles.length);
  let j5 = 0, j4 = 0;
  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j5 + 1 < candles5m.length && candles5m[j5 + 1].timestamp <= ts) j5++;
    map5m[i] = j5;
    while (j4 + 1 < candles4h.length && candles4h[j4 + 1].timestamp <= ts) j4++;
    map4h[i] = j4;
  }
  cache.set(key, { map5m, map4h, ind5m, ind4h });
}

export function resetSupertrendSwing5mCache(): void {
  cache.clear();
}

export const supertrendSwing5mStrategy: BacktestStrategy = {
  name: "Supertrend 5m Swing",
  description: "Fastest sibling of supertrend-1h-swing. SuperTrend(10,3) on 5m + ADX(14)>25 + EMA(600) (=50h time-anchored) trend alignment + RSI(14) range filter + 4H SuperTrend confirmation. Dynamic SL at SuperTrend line. Fixed % TP.",
  defaultConfig: {
    tpPercent: 10,
    leverage: 2,
    positionSizePercent: 100,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    // Warm-up: largest indicator is EMA(600) on 5m = 600 × 5min = 50h ≈ 2.1
    // days. Plus 4H SuperTrend(10) = 40h ≈ 1.7 days. 5 days of 1m data is
    // a comfortable buffer for both to stabilize.
    if (index < 5 * 1440) return signals;
    // Look up THIS run's precomputed bundle by data identity (first+last
    // timestamp + length). Engine injects _allCandles into context so we
    // can recover the same key the precompute step used. Without this
    // lookup, parallel multi-coin backtests would cross-contaminate via
    // a single shared module-level variable.
    const allCandles = (ctx as unknown as { _allCandles?: Candle[] })._allCandles;
    if (!allCandles || allCandles.length === 0) return signals;
    const precomputed = cache.get(cacheKey(allCandles));
    if (!precomputed) return signals;
    const { map5m, map4h, ind5m, ind4h } = precomputed;

    // CLOSED-BAR ONLY (no look-ahead) — see feedback-cryptox-no-lookahead-bias memory
    if (map5m[index] === map5m[index - 1]) return signals;
    const idx5m = map5m[index] - 1;
    const prevIdx5m = idx5m - 1;
    if (prevIdx5m < 0) return signals;

    const stDir = ind5m.supertrend?.direction[idx5m];
    const prevStDir = ind5m.supertrend?.direction[prevIdx5m];
    const stValue = ind5m.supertrend?.value[idx5m];
    const adx = ind5m.adx?.[idx5m];
    const ema50 = ind5m.ema?.[600]?.[idx5m];
    const rsi = ind5m.rsi?.[idx5m];
    if (stDir === undefined || prevStDir === undefined || stValue === undefined ||
        adx === undefined || ema50 === undefined || rsi === undefined) return signals;
    if ([stDir, prevStDir, stValue, adx, ema50, rsi].some((v) => isNaN(v as number))) return signals;

    const idx4h = map4h[index] - 1; // CLOSED 4H HTF
    const stDir4h = ind4h.supertrend?.direction[idx4h];
    if (stDir4h === undefined || isNaN(stDir4h)) return signals;

    const tpPct = Number(config.tpPercent ?? 10) / 100;
    const sizePct = Number(config.positionSizePercent ?? 100) / 100;
    const leverage = Number(config.leverage ?? 2);
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    const flipBullish = prevStDir === -1 && stDir === 1;
    const flipBearish = prevStDir === 1 && stDir === -1;

    if (flipBearish && hasLong) {
      signals.push({ action: "CLOSE_LONG", reason: `5m ST flipped RED (ADX ${adx.toFixed(1)})` });
    }
    if (flipBullish && hasShort) {
      signals.push({ action: "CLOSE_SHORT", reason: `5m ST flipped GREEN (ADX ${adx.toFixed(1)})` });
    }
    if (adx < 20) {
      if (hasLong) signals.push({ action: "CLOSE_LONG", reason: `ADX fading ${adx.toFixed(1)} < 20` });
      if (hasShort) signals.push({ action: "CLOSE_SHORT", reason: `ADX fading ${adx.toFixed(1)} < 20` });
      return signals;
    }

    if (flipBullish && adx > 25 && candle.close > ema50 && rsi >= 40 && rsi <= 70 && stDir4h === 1 && !hasLong) {
      const sl = stValue;
      const tp = candle.close * (1 + tpPct);
      signals.push({
        action: "BUY", qty, leverage, sl, tp,
        reason: `5m ST GREEN + ADX ${adx.toFixed(1)} + EMA600 + RSI ${rsi.toFixed(1)} + 4H bullish | SL ${sl.toFixed(2)}`,
      });
    }

    if (flipBearish && adx > 25 && candle.close < ema50 && rsi >= 30 && rsi <= 60 && stDir4h === -1 && !hasShort) {
      const sl = stValue;
      const tp = candle.close * (1 - tpPct);
      signals.push({
        action: "SELL", qty, leverage, sl, tp,
        reason: `5m ST RED + ADX ${adx.toFixed(1)} + EMA600 + RSI ${rsi.toFixed(1)} + 4H bearish | SL ${sl.toFixed(2)}`,
      });
    }

    return signals;
  },
};
