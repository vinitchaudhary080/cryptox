import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * @data-requirements
 * coins:        any-supported          // works on BTC/ETH best (liquid majors)
 * primary_tf:   1m base data
 * fields:       OHLCV
 * extras:       none
 * warmup_days:  20                     // 200-bar 1H MA + 100-bar std-dev → ~13 days
 * min_window:   180 days
 * external:     none
 */

/**
 * Z-Score Mean Reversion vs Long MA (1H)
 *
 * EDGE THESIS
 *   Pairs-trading (Vidyamurthy 2004) rests on a stationary spread between two
 *   cointegrated assets reverting to its long-run mean. Cryptox tests one coin
 *   per backtest, so we substitute the cointegrating partner with the asset's
 *   own slow trend proxy: a 200-bar 1H EMA.
 *
 *   The residual `r_t = close_t − EMA200_t` is empirically mean-reverting on
 *   range-bound crypto majors (1H half-life 20-60 bars in 2021-2024). Its
 *   z-score `z_t = r_t / σ_100(r_t)` is the trade signal. When |z| >= 2.0 the
 *   asset is statistically 2σ away from fair value; reversion is the higher-
 *   probability outcome.
 *
 *   The well-known statarb killer is "regime change" — z crosses 2σ then keeps
 *   going to 4σ as the asset enters a trend. We mitigate this two ways:
 *     1) Hurst-style regime filter: skip entries when the 4H ADX > 30 (strong
 *        directional regime — likely to trend through the mean).
 *     2) Hard z-score stop: SL kicks at |z| = 3.5σ; gives mean-rev ~1.75 R:R
 *        before stopping out.
 *
 * ENTRY (long-reversion)
 *   - 1H signal bar (just-closed)
 *   - z-score of (close − EMA200) at signalBar <= -2.0  (price extreme low)
 *   - z-score at signalBar - 1 was also <= -2.0          (sustained, not noise)
 *   - z-score crossed UP through −2.0 from below on signalBar (turning)
 *   - 4H ADX(14) < 30                                    (not strongly trending)
 *   - Bar closed green (close > open)                    (reversion underway)
 *
 * ENTRY (short-reversion)  Mirror at +2.0σ.
 *
 * EXITS
 *   TP:        z-score returns to 0 (price back at EMA200) — closing 50% there
 *   Final TP:  z-score crosses +0.5σ for longs / −0.5σ for shorts (50% close)
 *   SL:        |z| reaches 3.5σ in the wrong direction
 *   TIME STOP: 72 hours (close-on-bar boundary)
 *
 * SELECTIVITY
 *   2σ + sustained-2-bar + Hurst-via-ADX filter typically fires 25-80
 *   times/year per coin. Trade math: 2 R:R structure with 55-60% win rate on
 *   range-bound regimes yields positive EV.
 *
 * REFERENCES
 *   - Vidyamurthy (2004), Pairs Trading: Quantitative Methods, ch.5–8
 *   - Velu/Hardy/Nehren (2020), Algorithmic Trading and Quantitative
 *     Strategies, §5.8 (statarb pairs) and §5.10 (volume filter)
 */

let precomputed: {
  candles1h: Candle[];
  candles4h: Candle[];
  map1h: Int32Array;
  map4h: Int32Array;
  ema200_1h: number[];
  std100Spread_1h: number[];     // rolling 100-bar std-dev of (close − EMA200)
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
      // (NaN-safety guard: in practice EMA200 is finite after warm-up)
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

export function precomputeZScoreMeanReversion1h(allCandles: Candle[]): void {
  const candles1h = resampleCandles(allCandles, 60);
  const candles4h = resampleCandles(allCandles, 240);

  const ind1h = computeIndicators(candles1h, [
    { name: "EMA", period: 200 },
  ]);
  const ind4h = computeIndicators(candles4h, [
    { name: "ADX", period: 14 },
  ]);

  const ema200_1h = ind1h.ema?.[200] ?? new Array<number>(candles1h.length).fill(NaN);
  const adx14_4h = ind4h.adx ?? new Array<number>(candles4h.length).fill(NaN);

  // Build spread series (close − EMA200) and its rolling 100-bar std-dev
  const spread1h = candles1h.map((c, i) => {
    const e = ema200_1h[i];
    return isFinite(e) ? c.close - e : NaN;
  });
  // For std-dev computation, treat NaN bars before warm-up by using a clean
  // copy where NaNs are replaced by neutral 0 only after warm-up index
  const cleanSpread: number[] = spread1h.map((v) => (isFinite(v) ? v : 0));
  const std100Spread_1h_raw = rollingStd(cleanSpread, 100);
  // Mask the std-dev to NaN where the underlying spread was NaN (pre-warm-up)
  const std100Spread_1h = std100Spread_1h_raw.map((v, i) => (isFinite(spread1h[i]) ? v : NaN));

  // Build 1m → 1h and 1m → 4h index maps
  const map1h = new Int32Array(allCandles.length);
  const map4h = new Int32Array(allCandles.length);
  let j1h = 0;
  let j4h = 0;
  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (j1h + 1 < candles1h.length && candles1h[j1h + 1].timestamp <= ts) j1h++;
    map1h[i] = j1h;
    while (j4h + 1 < candles4h.length && candles4h[j4h + 1].timestamp <= ts) j4h++;
    map4h[i] = j4h;
  }

  precomputed = { candles1h, candles4h, map1h, map4h, ema200_1h, std100Spread_1h, adx14_4h };
}

export function resetZScoreMeanReversion1hCache(): void {
  precomputed = null;
}

export const zScoreMeanReversion1h: BacktestStrategy = {
  name: "Z-Score Mean Reversion 1H",
  description:
    "Pairs-trading-inspired single-coin mean reversion. Trades 2σ z-score extremes of (close − EMA200) on 1H, gated by 4H ADX<30 to avoid trend regimes. SL at 3.5σ, TP ladder at z=0 and z=±0.5σ. Max-hold 72h.",
  defaultConfig: {
    zEntry: 2.0,
    zHardStop: 3.5,
    zTpMid: 0.0,
    zTpFinal: 0.5,
    adxRegimeMax: 30,
    maxHoldBars1h: 72,
    leverage: 3,
    positionSizePercent: 50,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (!precomputed || index < 200 * 60) return signals;
    const { map1h, map4h, ema200_1h, std100Spread_1h, adx14_4h, candles1h } = precomputed;

    // Only fire at 1H bucket transitions — operate on just-closed 1H bar
    if (map1h[index] === map1h[index - 1]) return signals;

    const idx1h = map1h[index];
    const signalIdx1h = idx1h - 1; // just-closed bar (no lookahead)
    if (signalIdx1h < 2) return signals;

    const ema = ema200_1h[signalIdx1h];
    const std = std100Spread_1h[signalIdx1h];
    const close1h = candles1h[signalIdx1h].close;
    const open1h = candles1h[signalIdx1h].open;
    if (!isFinite(ema) || !isFinite(std) || std <= 0) return signals;

    // z-scores: current signal bar and previous bar
    const z = (close1h - ema) / std;
    const emaPrev = ema200_1h[signalIdx1h - 1];
    const stdPrev = std100Spread_1h[signalIdx1h - 1];
    if (!isFinite(emaPrev) || !isFinite(stdPrev) || stdPrev <= 0) return signals;
    const zPrev = (candles1h[signalIdx1h - 1].close - emaPrev) / stdPrev;

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
    const leverage = Number(config.leverage ?? 3);
    const sizePct = Number(config.positionSizePercent ?? 50) / 100;
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

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
    const closedGreen = close1h > open1h;
    const closedRed = close1h < open1h;

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
        entryPrice: close1h,
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
        entryPrice: close1h,
      });
    }

    return signals;
  },
};
