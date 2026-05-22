import type { BacktestStrategy, CandleContext, Signal, Candle, IndicatorValues } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Supertrend 5m FAST (variant of proven supertrend-strategy)
 *
 * The 15m supertrend strategy is the only consistently profitable strategy
 * in this codebase — backtested at +6.9% BTC, +51.9% ETH, +60.4% AVAX over
 * one year. This variant runs the SAME signal logic on a faster timeframe:
 *
 *   - 5m execution (was 15m)
 *   - 15m HTF confirmation (was 1h)
 *   - SAME ADX > 25 filter, EMA(50), RSI(14), SuperTrend(10,3) stack
 *
 * EXPECTED CHARACTERISTICS
 *   - More trades than 15m variant (~3-5x frequency)
 *   - Smaller per-trade R but tighter exits
 *   - Higher fee drag → only viable on liquid coins (BTC, ETH)
 *
 * USE CASE
 *   For users who want intraday signal frequency.
 *   For 1-2-day holds prefer supertrend-strategy (15m).
 */

// Per-coin precompute cache — see feedback-cryptox-strategy-precompute-parallel-safety
// memory. A module-level singleton gets clobbered when parallel multi-coin
// backtests share the same Node process.
type PrecomputeBundle = {
  map5m: Int32Array;
  map15m: Int32Array;
  ind5m: IndicatorValues;
  ind15m: IndicatorValues;
};
const cache = new Map<string, PrecomputeBundle>();

function cacheKey(allCandles: Candle[]): string {
  if (allCandles.length === 0) return "empty";
  return `${allCandles[0].timestamp}:${allCandles[allCandles.length - 1].timestamp}:${allCandles.length}`;
}

export function precomputeSupertrend5mFast(allCandles: Candle[]): void {
  const key = cacheKey(allCandles);
  if (cache.has(key)) return;

  const candles5m = resampleCandles(allCandles, 5);
  const candles15m = resampleCandles(allCandles, 15);

  const ind5m = computeIndicators(candles5m, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
    { name: "ADX", period: 14 },
    { name: "EMA", period: 50 },
    { name: "RSI", period: 14 },
  ]);
  const ind15m = computeIndicators(candles15m, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
  ]);

  const map5m = new Int32Array(allCandles.length);
  const map15m = new Int32Array(allCandles.length);
  let j5 = 0, j15 = 0;
  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j5 + 1 < candles5m.length && candles5m[j5 + 1].timestamp <= ts) j5++;
    map5m[i] = j5;
    while (j15 + 1 < candles15m.length && candles15m[j15 + 1].timestamp <= ts) j15++;
    map15m[i] = j15;
  }
  cache.set(key, { map5m, map15m, ind5m, ind15m });
}

export function resetSupertrend5mFastCache(): void {
  cache.clear();
}

export const supertrend5mFastStrategy: BacktestStrategy = {
  name: "Supertrend 5m Fast",
  description: "Faster sibling of supertrend-strategy. SuperTrend(10,3) on 5m + ADX(14)>25 + EMA(50) trend alignment + RSI(14) range filter + 15m SuperTrend confirmation. Dynamic SL at SuperTrend line. Same proven logic, intraday frequency.",
  defaultConfig: {
    tpPercent: 3,
    leverage: 5,
    positionSizePercent: 25,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (index < 200) return signals;
    const allCandles = (ctx as unknown as { _allCandles?: Candle[] })._allCandles;
    if (!allCandles || allCandles.length === 0) return signals;
    const precomputed = cache.get(cacheKey(allCandles));
    if (!precomputed) return signals;
    const { map5m, map15m, ind5m, ind15m } = precomputed;

    const idx5 = map5m[index];
    const prevIdx5 = idx5 > 0 ? idx5 - 1 : -1;
    if (prevIdx5 < 0) return signals;
    if (map5m[index] === map5m[index - 1]) return signals;

    const stDir = ind5m.supertrend?.direction[idx5];
    const prevStDir = ind5m.supertrend?.direction[prevIdx5];
    const stValue = ind5m.supertrend?.value[idx5];
    const adx = ind5m.adx?.[idx5];
    const ema50 = ind5m.ema?.[50]?.[idx5];
    const rsi = ind5m.rsi?.[idx5];
    if (stDir === undefined || prevStDir === undefined || stValue === undefined ||
        adx === undefined || ema50 === undefined || rsi === undefined) return signals;
    if ([stDir, prevStDir, stValue, adx, ema50, rsi].some((v) => isNaN(v as number))) return signals;

    const idx15 = map15m[index];
    const stDir15 = ind15m.supertrend?.direction[idx15];
    if (stDir15 === undefined || isNaN(stDir15)) return signals;

    const tpPct = Number(config.tpPercent ?? 3) / 100;
    const sizePct = Number(config.positionSizePercent ?? 25) / 100;
    const leverage = Number(config.leverage ?? 5);
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

    if (flipBullish && adx > 25 && candle.close > ema50 && rsi >= 40 && rsi <= 70 && stDir15 === 1 && !hasLong) {
      const sl = stValue;
      const tp = candle.close * (1 + tpPct);
      signals.push({
        action: "BUY", qty, leverage, sl, tp,
        reason: `5m ST GREEN + ADX ${adx.toFixed(1)} + EMA50 + RSI ${rsi.toFixed(1)} + 15m bullish | SL ${sl.toFixed(2)}`,
      });
    }

    if (flipBearish && adx > 25 && candle.close < ema50 && rsi >= 30 && rsi <= 60 && stDir15 === -1 && !hasShort) {
      const sl = stValue;
      const tp = candle.close * (1 - tpPct);
      signals.push({
        action: "SELL", qty, leverage, sl, tp,
        reason: `5m ST RED + ADX ${adx.toFixed(1)} + EMA50 + RSI ${rsi.toFixed(1)} + 15m bearish | SL ${sl.toFixed(2)}`,
      });
    }

    return signals;
  },
};
