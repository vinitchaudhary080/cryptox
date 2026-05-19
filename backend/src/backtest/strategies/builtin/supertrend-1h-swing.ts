import type { BacktestStrategy, CandleContext, Signal, Candle, IndicatorValues } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Supertrend 1H SWING (variant of proven supertrend-strategy)
 *
 * Slower sibling of supertrend-strategy. Same proven filter stack but on
 * 1H execution with 4H HTF confirmation. Designed for 1-3 day holds — captures
 * larger trend moves with fewer trades and less fee drag.
 *
 * - 1H execution (was 15m)
 * - 4H HTF confirmation (was 1h)
 * - SAME ADX > 25, EMA(50), RSI(14), SuperTrend(10,3) stack
 *
 * EXPECTED CHARACTERISTICS
 *   - Fewer trades than 15m (~15-25/year), longer per-trade R
 *   - Lower fee drag than faster variants
 *   - Larger MDD per trade but better R:R
 */

let precomputed: {
  map1h: Int32Array;
  map4h: Int32Array;
  ind1h: IndicatorValues;
  ind4h: IndicatorValues;
} | null = null;

export function precomputeSupertrend1hSwing(allCandles: Candle[]): void {
  const candles1h = resampleCandles(allCandles, 60);
  const candles4h = resampleCandles(allCandles, 240);

  const ind1h = computeIndicators(candles1h, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
    { name: "ADX", period: 14 },
    { name: "EMA", period: 50 },
    { name: "RSI", period: 14 },
  ]);
  const ind4h = computeIndicators(candles4h, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
  ]);

  const map1h = new Int32Array(allCandles.length);
  const map4h = new Int32Array(allCandles.length);
  let j1 = 0, j4 = 0;
  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j1 + 1 < candles1h.length && candles1h[j1 + 1].timestamp <= ts) j1++;
    map1h[i] = j1;
    while (j4 + 1 < candles4h.length && candles4h[j4 + 1].timestamp <= ts) j4++;
    map4h[i] = j4;
  }
  precomputed = { map1h, map4h, ind1h, ind4h };
}

export function resetSupertrend1hSwingCache(): void {
  precomputed = null;
}

export const supertrend1hSwingStrategy: BacktestStrategy = {
  name: "Supertrend 1H Swing",
  description: "Slower sibling of supertrend-strategy. SuperTrend(10,3) on 1H + ADX(14)>25 + EMA(50) trend alignment + RSI(14) range filter + 4H SuperTrend confirmation. Dynamic SL at SuperTrend line. Larger fixed TP for swing holds.",
  defaultConfig: {
    tpPercent: 10,
    leverage: 5,
    positionSizePercent: 25,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (!precomputed || index < 500) return signals;
    const { map1h, map4h, ind1h, ind4h } = precomputed;

    const idx1h = map1h[index];
    const prevIdx1h = idx1h > 0 ? idx1h - 1 : -1;
    if (prevIdx1h < 0) return signals;
    if (map1h[index] === map1h[index - 1]) return signals;

    const stDir = ind1h.supertrend?.direction[idx1h];
    const prevStDir = ind1h.supertrend?.direction[prevIdx1h];
    const stValue = ind1h.supertrend?.value[idx1h];
    const adx = ind1h.adx?.[idx1h];
    const ema50 = ind1h.ema?.[50]?.[idx1h];
    const rsi = ind1h.rsi?.[idx1h];
    if (stDir === undefined || prevStDir === undefined || stValue === undefined ||
        adx === undefined || ema50 === undefined || rsi === undefined) return signals;
    if ([stDir, prevStDir, stValue, adx, ema50, rsi].some((v) => isNaN(v as number))) return signals;

    const idx4h = map4h[index];
    const stDir4h = ind4h.supertrend?.direction[idx4h];
    if (stDir4h === undefined || isNaN(stDir4h)) return signals;

    const tpPct = Number(config.tpPercent ?? 10) / 100;
    const sizePct = Number(config.positionSizePercent ?? 25) / 100;
    const leverage = Number(config.leverage ?? 5);
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    const flipBullish = prevStDir === -1 && stDir === 1;
    const flipBearish = prevStDir === 1 && stDir === -1;

    if (flipBearish && hasLong) {
      signals.push({ action: "CLOSE_LONG", reason: `1H ST flipped RED (ADX ${adx.toFixed(1)})` });
    }
    if (flipBullish && hasShort) {
      signals.push({ action: "CLOSE_SHORT", reason: `1H ST flipped GREEN (ADX ${adx.toFixed(1)})` });
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
        reason: `1H ST GREEN + ADX ${adx.toFixed(1)} + EMA50 + RSI ${rsi.toFixed(1)} + 4H bullish | SL ${sl.toFixed(2)}`,
      });
    }

    if (flipBearish && adx > 25 && candle.close < ema50 && rsi >= 30 && rsi <= 60 && stDir4h === -1 && !hasShort) {
      const sl = stValue;
      const tp = candle.close * (1 - tpPct);
      signals.push({
        action: "SELL", qty, leverage, sl, tp,
        reason: `1H ST RED + ADX ${adx.toFixed(1)} + EMA50 + RSI ${rsi.toFixed(1)} + 4H bearish | SL ${sl.toFixed(2)}`,
      });
    }

    return signals;
  },
};
