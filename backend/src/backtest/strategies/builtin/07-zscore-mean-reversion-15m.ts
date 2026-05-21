import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * @data-requirements
 * coins:        any-supported          // works on BTC/ETH best (liquid majors)
 * primary_tf:   1m base data
 * fields:       OHLCV
 * extras:       none
 * warmup_days:  250                    // 800-bar 15m EMA + 400-bar std-dev (~8.3 days of 15m)
 * min_window:   180 days
 * external:     none
 */

/**
 * Z-Score Mean Reversion vs Long MA (15m)
 *
 * 15m variant of the 1H Z-Score Mean Reversion strategy. Scales lookbacks by
 * 4x (60min / 15min) to preserve the same time-anchored signal:
 *   - EMA period   200 → 800   (~8.3 days on 15m, identical to 200 bars on 1H)
 *   - Spread std   100 → 400   (~4.2 days on 15m, identical to 100 bars on 1H)
 *
 * z-thresholds, ADX(14) on 4H regime gate, sustained-2-bar entry, z-hard-stop
 * SL and TP ladder (z=0, z=±0.5σ) remain unchanged. Time stop is interpreted
 * as 72 HOURS via timestamp diff so it stays TF-agnostic (i.e. ~288 bars on
 * 15m). HTF (4H) ADX references are unchanged.
 *
 * Rationale: lower timeframe → more signals → more brokerage events, while
 * preserving the same underlying mean-reverting edge horizon.
 */

let precomputed: {
  candles15m: Candle[];
  candles4h: Candle[];
  map15m: Int32Array;
  map4h: Int32Array;
  ema800_15m: number[];
  std400Spread_15m: number[];    // rolling 400-bar std-dev of (close − EMA800)
  adx14_4h: number[];
} | null = null;

/** Rolling N-bar standard deviation of a series, NaN until window fills. */
function rollingStd(series: number[], window: number): number[] {
  const n = series.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < window) return out;

  let sum = 0;
  let sumSq = 0;
  let filled = 0;
  for (let i = 0; i < n; i++) {
    const v = series[i];
    if (!isFinite(v)) {
      // Skip — but keep window size constant for simplicity by treating as 0
      // (NaN-safety guard: in practice EMA800 is finite after warm-up)
      continue;
    }
    sum += v;
    sumSq += v * v;
    filled++;
    if (i >= window) {
      const old = series[i - window];
      if (isFinite(old)) {
        sum -= old;
        sumSq -= old * old;
        filled--;
      }
    }
    if (i >= window - 1 && filled >= window) {
      const mean = sum / window;
      const variance = sumSq / window - mean * mean;
      out[i] = variance > 0 ? Math.sqrt(variance) : 0;
    }
  }
  return out;
}

export function precomputeZScoreMeanReversion15m(allCandles: Candle[]): void {
  const candles15m = resampleCandles(allCandles, 15);
  const candles4h = resampleCandles(allCandles, 240);

  const ind15m = computeIndicators(candles15m, [
    { name: "EMA", period: 800 },
  ]);
  const ind4h = computeIndicators(candles4h, [
    { name: "ADX", period: 14 },
  ]);

  const ema800_15m = ind15m.ema?.[800] ?? new Array<number>(candles15m.length).fill(NaN);
  const adx14_4h = ind4h.adx ?? new Array<number>(candles4h.length).fill(NaN);

  // Build spread series (close − EMA800) and its rolling 400-bar std-dev
  const spread15m = candles15m.map((c, i) => {
    const e = ema800_15m[i];
    return isFinite(e) ? c.close - e : NaN;
  });
  // For std-dev computation, treat NaN bars before warm-up by using a clean
  // copy where NaNs are replaced by neutral 0 only after warm-up index
  const cleanSpread: number[] = spread15m.map((v) => (isFinite(v) ? v : 0));
  const std400Spread_15m_raw = rollingStd(cleanSpread, 400);
  // Mask the std-dev to NaN where the underlying spread was NaN (pre-warm-up)
  const std400Spread_15m = std400Spread_15m_raw.map((v, i) => (isFinite(spread15m[i]) ? v : NaN));

  // Build 1m → 15m and 1m → 4h index maps
  const map15m = new Int32Array(allCandles.length);
  const map4h = new Int32Array(allCandles.length);
  let j15m = 0;
  let j4h = 0;
  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j15m + 1 < candles15m.length && candles15m[j15m + 1].timestamp <= ts) j15m++;
    map15m[i] = j15m;
    while (j4h + 1 < candles4h.length && candles4h[j4h + 1].timestamp <= ts) j4h++;
    map4h[i] = j4h;
  }

  precomputed = { candles15m, candles4h, map15m, map4h, ema800_15m, std400Spread_15m, adx14_4h };
}

export function resetZScoreMeanReversion15mCache(): void {
  precomputed = null;
}

export const zScoreMeanReversion15m: BacktestStrategy = {
  name: "Z-Score Mean Reversion 15m",
  description:
    "Pairs-trading-inspired single-coin mean reversion (15m variant). Trades 2σ z-score extremes of (close − EMA800) on 15m, gated by 4H ADX<30 to avoid trend regimes. SL at 3.5σ, TP ladder at z=0 and z=±0.5σ. Max-hold 72h (TF-agnostic via timestamp).",
  defaultConfig: {
    zEntry: 2.0,
    zHardStop: 3.5,
    zTpMid: 0.0,
    zTpFinal: 0.5,
    adxRegimeMax: 30,
    maxHoldBars: 72,
    leverage: 3,
    positionSizePercent: 50,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    // Warm-up: 250 days of 1m data to comfortably fill 800-bar 15m EMA
    if (!precomputed || index < 250 * 1440) return signals;
    const { map15m, map4h, ema800_15m, std400Spread_15m, adx14_4h, candles15m } = precomputed;

    // Only fire at 15m bucket transitions — operate on just-closed 15m bar
    if (map15m[index] === map15m[index - 1]) return signals;

    const idx15m = map15m[index];
    const signalIdx15m = idx15m - 1; // just-closed bar (no lookahead)
    if (signalIdx15m < 2) return signals;

    const ema = ema800_15m[signalIdx15m];
    const std = std400Spread_15m[signalIdx15m];
    const close15m = candles15m[signalIdx15m].close;
    const open15m = candles15m[signalIdx15m].open;
    if (!isFinite(ema) || !isFinite(std) || std <= 0) return signals;

    // z-scores: current signal bar and previous bar
    const z = (close15m - ema) / std;
    const emaPrev = ema800_15m[signalIdx15m - 1];
    const stdPrev = std400Spread_15m[signalIdx15m - 1];
    if (!isFinite(emaPrev) || !isFinite(stdPrev) || stdPrev <= 0) return signals;
    const zPrev = (candles15m[signalIdx15m - 1].close - emaPrev) / stdPrev;

    // 4H ADX regime gate (read from just-closed 4H bar)
    const idx4h = map4h[index];
    const signalIdx4h = idx4h > 0 ? idx4h - 1 : -1;
    if (signalIdx4h < 0) return signals;
    const adx4h = adx14_4h[signalIdx4h];
    if (!isFinite(adx4h)) return signals;

    const zEntry = Number(config.zEntry ?? 2.0);
    const zHardStop = Number(config.zHardStop ?? 3.5);
    const zTpFinal = Number(config.zTpFinal ?? 0.5);
    const adxRegimeMax = Number(config.adxRegimeMax ?? 30);
    const maxHoldHours = Number(config.maxHoldBars ?? 72);
    const leverage = Number(config.leverage ?? 3);
    const sizePct = Number(config.positionSizePercent ?? 50) / 100;
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // ── TIME STOP: TF-agnostic, interpret maxHoldBars as HOURS via timestamps ──
    for (const p of positions) {
      const heldHours = (candle.timestamp - p.entryTime) / 3_600_000;
      if (heldHours >= maxHoldHours) {
        if (p.side === "BUY") {
          signals.push({
            action: "CLOSE_LONG",
            reason: `time stop: held ${heldHours.toFixed(1)}h >= ${maxHoldHours}h`,
          });
        } else {
          signals.push({
            action: "CLOSE_SHORT",
            reason: `time stop: held ${heldHours.toFixed(1)}h >= ${maxHoldHours}h`,
          });
        }
      }
    }

    // ── EXIT logic: z-score back inside ±zTpFinal of mean → final close ──
    if (hasLong && z >= -zTpFinal) {
      signals.push({
        action: "CLOSE_LONG",
        reason: `z-score reverted to ${z.toFixed(2)} (>= −${zTpFinal})`,
      });
    }
    if (hasShort && z <= zTpFinal) {
      signals.push({
        action: "CLOSE_SHORT",
        reason: `z-score reverted to ${z.toFixed(2)} (<= ${zTpFinal})`,
      });
    }

    // ── ENTRIES ──
    // Skip if already in any position
    if (hasLong || hasShort) return signals;
    // Regime gate
    if (adx4h >= adxRegimeMax) return signals;

    // LONG: z was deeply negative and bar closed green (turning) — both this
    // bar and the previous closed bar were < −zEntry, signaling sustained
    // dislocation rather than a single noisy print.
    const closedGreen = close15m > open15m;
    const closedRed = close15m < open15m;

    // Reject entries that are ALREADY past the hard-stop threshold.
    // When z is more extreme than -zHardStop, the computed SL price
    // (ema - zHardStop*std) ends up ABOVE the entry close — which the
    // engine treats as immediately-triggered and fills at SL price,
    // producing artificial profit. Skip these entries — mean reversion
    // is unreliable at extreme dislocations anyway.
    if (z <= -zEntry && z > -zHardStop && zPrev <= -zEntry && z > zPrev && closedGreen) {
      // SL price: where z would equal −zHardStop
      const slPrice = ema - zHardStop * std;
      // TP ladder: 50% at z=0 (EMA), 50% at z=+zTpFinal
      const tp1Price = ema; // z=0
      const tp2Price = ema + zTpFinal * std;
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl: slPrice,
        tps: [
          { price: tp1Price, portion: 0.5 },
          { price: tp2Price, portion: 0.5 },
        ],
        reason: `z=${z.toFixed(2)} (sustained ≤ −${zEntry}), 4H ADX=${adx4h.toFixed(1)}<${adxRegimeMax}, green close | SL@z=−${zHardStop}`,
        entryPrice: close15m,
      });
    }

    // SHORT: mirror
    // Mirror SHORT guard: reject entries already past the hard-stop on
    // the upper side, where slPrice (ema + zHardStop*std) would end up
    // BELOW entry and trigger immediately.
    if (z >= zEntry && z < zHardStop && zPrev >= zEntry && z < zPrev && closedRed) {
      const slPrice = ema + zHardStop * std;
      const tp1Price = ema;
      const tp2Price = ema - zTpFinal * std;
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl: slPrice,
        tps: [
          { price: tp1Price, portion: 0.5 },
          { price: tp2Price, portion: 0.5 },
        ],
        reason: `z=${z.toFixed(2)} (sustained ≥ ${zEntry}), 4H ADX=${adx4h.toFixed(1)}<${adxRegimeMax}, red close | SL@z=+${zHardStop}`,
        entryPrice: close15m,
      });
    }

    return signals;
  },
};
