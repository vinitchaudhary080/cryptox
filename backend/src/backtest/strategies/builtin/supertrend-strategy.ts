import type { BacktestStrategy, CandleContext, Signal, Candle, IndicatorValues } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * Supertrend Strategy (15 MIN)
 *
 * ENTRY:
 * - BUY: SuperTrend flips red→green on 15m + ADX(14) > 25 + Price > EMA(50) + RSI 40-70
 *         + 1h chart agrees (SuperTrend green on 1h)
 * - SELL: SuperTrend flips green→red on 15m + ADX(14) > 25 + Price < EMA(50) + RSI 30-60
 *          + 1h chart agrees (SuperTrend red on 1h)
 *
 * EXIT:
 * - SuperTrend flips against position on 15m → exit immediately
 * - ADX drops below 20 → exit (trend fading)
 *
 * STOP-LOSS:
 * - SuperTrend line value at entry time (dynamic SL)
 */

// Pre-computed multi-timeframe data
let precomputed: {
  map15m: Int32Array;
  map1h: Int32Array;
  ind15m: IndicatorValues;
  ind1h: IndicatorValues;
} | null = null;

export function precomputeSupertrendStrategy(allCandles: Candle[]): void {
  const candles15m = resampleCandles(allCandles, 15);
  const candles1h = resampleCandles(allCandles, 60);

  const ind15m = computeIndicators(candles15m, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
    { name: "ADX", period: 14 },
    { name: "EMA", period: 50 },
    { name: "RSI", period: 14 },
  ]);

  const ind1h = computeIndicators(candles1h, [
    { name: "SUPERTREND", period: 10, params: { multiplier: 3 } },
  ]);

  // Build timestamp mapping
  const map15m = new Int32Array(allCandles.length);
  const map1h = new Int32Array(allCandles.length);

  let j15 = 0;
  let j1h = 0;

  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j15 + 1 < candles15m.length && candles15m[j15 + 1].timestamp <= ts) j15++;
    map15m[i] = j15;
    while (j1h + 1 < candles1h.length && candles1h[j1h + 1].timestamp <= ts) j1h++;
    map1h[i] = j1h;
  }

  precomputed = { map15m, map1h, ind15m, ind1h };
}

export function resetSupertrendStrategyCache(): void {
  precomputed = null;
}

export const supertrendStrategy: BacktestStrategy = {
  name: "Supertrend Strategy",
  description: "SuperTrend on 15m with ADX filter, EMA(50) trend alignment, RSI range filter, and 1h chart confirmation. Dynamic SL at SuperTrend line. Exits on SuperTrend flip or ADX fade.",
  defaultConfig: {
    tpPercent: 6,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (!precomputed || index < 200) return signals;

    const { map15m, map1h, ind15m, ind1h } = precomputed;

    const idx15 = map15m[index];
    const prevIdx15 = idx15 > 0 ? idx15 - 1 : -1;
    if (prevIdx15 < 0) return signals;

    // Only trigger on 15m boundary
    if (map15m[index] === map15m[index - 1]) return signals;

    // ── 15m indicators ──
    const stDir = ind15m.supertrend?.direction[idx15];
    const prevStDir = ind15m.supertrend?.direction[prevIdx15];
    const stValue = ind15m.supertrend?.value[idx15];
    const adx = ind15m.adx?.[idx15];
    const ema50 = ind15m.ema?.[50]?.[idx15];
    const rsi = ind15m.rsi?.[idx15];

    if (stDir === undefined || prevStDir === undefined || stValue === undefined ||
        adx === undefined || ema50 === undefined || rsi === undefined) return signals;
    if ([stDir, prevStDir, stValue, adx, ema50, rsi].some((v) => isNaN(v as number))) return signals;

    // ── 1h indicators ──
    const idx1h = map1h[index];
    const stDir1h = ind1h.supertrend?.direction[idx1h];
    if (stDir1h === undefined || isNaN(stDir1h)) return signals;

    // ── Strategy params ──
    const tpPct = Number(config.tpPercent ?? 6) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    const flipBullish = prevStDir === -1 && stDir === 1; // red → green
    const flipBearish = prevStDir === 1 && stDir === -1; // green → red

    // ── EXIT: SuperTrend flip against position → immediate exit ──
    if (flipBearish && hasLong) {
      signals.push({ action: "CLOSE_LONG", reason: `SuperTrend flipped RED on 15m (ADX: ${adx.toFixed(1)})` });
    }
    if (flipBullish && hasShort) {
      signals.push({ action: "CLOSE_SHORT", reason: `SuperTrend flipped GREEN on 15m (ADX: ${adx.toFixed(1)})` });
    }

    // ── EXIT: ADX drops below 20 → trend fading ──
    if (adx < 20) {
      if (hasLong) {
        signals.push({ action: "CLOSE_LONG", reason: `ADX fading (${adx.toFixed(1)} < 20) — trend weak` });
      }
      if (hasShort) {
        signals.push({ action: "CLOSE_SHORT", reason: `ADX fading (${adx.toFixed(1)} < 20) — trend weak` });
      }
      return signals; // don't enter when ADX is weak
    }

    // ── ENTRY: Full confirmation needed ──

    // BUY: ST flip green + ADX > 25 + Price > EMA50 + RSI 40-70 + 1h bullish
    if (flipBullish && adx > 25 && candle.close > ema50 && rsi >= 40 && rsi <= 70 && stDir1h === 1 && !hasLong) {
      const sl = stValue; // SuperTrend line = dynamic SL
      const tp = candle.close * (1 + tpPct);

      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl,
        tp,
        reason: `ST flip GREEN + ADX(${adx.toFixed(1)}) > 25 + Price > EMA50 + RSI(${rsi.toFixed(1)}) + 1h bullish | SL: $${sl.toFixed(2)}`,
      });
    }

    // SELL: ST flip red + ADX > 25 + Price < EMA50 + RSI 30-60 + 1h bearish
    if (flipBearish && adx > 25 && candle.close < ema50 && rsi >= 30 && rsi <= 60 && stDir1h === -1 && !hasShort) {
      const sl = stValue; // SuperTrend line = dynamic SL
      const tp = candle.close * (1 - tpPct);

      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl,
        tp,
        reason: `ST flip RED + ADX(${adx.toFixed(1)}) > 25 + Price < EMA50 + RSI(${rsi.toFixed(1)}) + 1h bearish | SL: $${sl.toFixed(2)}`,
      });
    }

    return signals;
  },
};
