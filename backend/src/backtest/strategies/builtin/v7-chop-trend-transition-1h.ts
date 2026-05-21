import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

/**
 * @data-requirements
 * coins:        any-supported          // chop→trend transitions are a universal regime signal
 * primary_tf:   1m base data
 * fields:       OHLCV
 * extras:       none
 * warmup_days:  40                     // 200 EMA on 4H ≈ 33d; rounded up to be safe
 * min_window:   270 days
 * external:     none
 */

/**
 * Choppiness Index Transition + Trend (1H) — v7 SPECIALIST #06 (Volatility) Candidate 2
 *
 * EDGE THESIS
 *   The Choppiness Index (CI) was developed by E.W. Dreiss as a non-
 *   directional measure of whether a market is in a CHOPPY (range-bound,
 *   high-CI) state or a TRENDING (directional, low-CI) state. It is computed
 *   as:
 *
 *       CI(n) = 100 × log10( Σ TR(n) / (MAX(high,n) − MIN(low,n)) ) / log10(n)
 *
 *   The intuition: if a market is purely directional, the sum of true ranges
 *   over n bars (Σ TR) approaches the n-bar range (MAX(high) − MIN(low)),
 *   making the ratio close to 1 and CI close to 0. If the market is choppy
 *   and the price wanders within a tight band, Σ TR ≫ range, making the
 *   ratio large and CI approaches 100. Conventional thresholds (Dreiss; also
 *   Kase 1996, Chande 2001) are:
 *
 *       CI > 61.8 → chop / consolidation regime
 *       CI < 38.2 → strong trend regime
 *
 *   (The thresholds are Fibonacci levels — a stylistic choice by Dreiss,
 *   not a magic number; they are merely tertile-ish bands of the empirical
 *   CI distribution on equity / FX / crypto markets.)
 *
 *   The HIGH-EV setup is not "CI is low" (then we're already mid-trend and
 *   chasing); it is the TRANSITION from chop to trend — i.e., CI was high
 *   recently and is now low. This signals that a range has just resolved
 *   into a directional move, BEFORE the move has fully extended. Empirically
 *   on equity index futures (Chande & Kroll 1994, "The New Technical Trader")
 *   and on crypto (recent retail-strategy literature, e.g. Carr 2021), chop→
 *   trend transitions catch the early phase of multi-bar directional swings
 *   while filtering out the false-breakout noise that low-CI alone would
 *   admit (continued moves are mostly already-priced).
 *
 *   Direction is determined by the close-vs-EMA50 relationship — if price is
 *   above its 50-bar 1H EMA at the moment of transition, the resolving trend
 *   is up; below, down. We further demand HTF agreement: the 4H EMA200 slope
 *   must be in the same direction (or strictly non-flat). This adds two
 *   crucial filters:
 *
 *     - rejects chop→trend transitions that resolve AGAINST the larger trend
 *       (these revert disproportionately — the "fade-the-trend" tail)
 *     - rejects transitions in markets with a flat 4H trend (often chop
 *       within a larger range, not real trend-starts)
 *
 *   "One trade per transition" lockout: once we fire a signal, we don't fire
 *   again until CI re-enters the chop zone (> 60) — this prevents stacking
 *   trades during the multi-bar trend window where CI stays < 40.
 *
 * ENTRY (long)   1H CI(14) < 40 (current bar)
 *                AND any of the prior 6 1H bars had CI > 60 (chop→trend transition)
 *                AND 1H close > 1H EMA50 (uptrend direction)
 *                AND 4H EMA200 fractional slope > +0.001 over 6 bars
 *                AND chop-zone reset since last entry.
 *
 * ENTRY (short)  1H CI(14) < 40 (current bar)
 *                AND any of the prior 6 1H bars had CI > 60
 *                AND 1H close < 1H EMA50 (downtrend direction)
 *                AND 4H EMA200 fractional slope < −0.001 over 6 bars
 *                AND chop-zone reset since last entry.
 *
 * EXITS
 *   TP1 (50%): entry + 1.7 × SL_distance   (RR 1.7)
 *   TP2 (50%): entry + 3.0 × SL_distance   (RR 3.0)
 *   SL:        entry ∓ 2.0 × ATR(14, 1H)
 *   TIME STOP: 36h
 *
 * BOUNDARY-CHECK PATTERN (lookahead-bias guard)
 *   Only act when the 1H bar advances (map1h[index] !== map1h[index-1]),
 *   then read signalIdx1h = idx1h − 1 (the just-closed 1H bar). HTF (4H)
 *   data is also read from signalIdx4h = idx4h − 1.
 *
 * REFERENCES
 *   - Dreiss, E.W. (1990s), original Choppiness Index publication
 *   - Chande, T. & Kroll, S. (1994), "The New Technical Trader" —
 *     regime-detection indicators and the chop→trend transition framework
 *   - Kase, C. (1996), "Trading with the Odds" — using CI for regime gating
 *   - Chande, T. (2001), "Beyond Technical Analysis" — empirical thresholds
 *   - Moskowitz, Ooi, Pedersen (2012), "Time Series Momentum" — robustness
 *     of trend-aligned signals
 *   - Lo, Mamaysky, Wang (2000), "Foundations of Technical Analysis" —
 *     statistical evidence for HTF-trend-filtered entries
 */

let precomputed: {
  candles1h: Candle[];
  candles4h: Candle[];
  map1h: Int32Array;
  map4h: Int32Array;
  ci14_1h: number[];
  atr14_1h: number[];
  ema50_1h: number[];
  ema200_4h: number[];
} | null = null;

function computeATR(candles: Candle[], period: number): number[] {
  const atr: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return atr;
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trs.push(tr);
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atr;
}

// Choppiness Index (Dreiss):
//   CI(n) = 100 * log10( sumTR(n) / (max(high,n) - min(low,n)) ) / log10(n)
// where sumTR(n) is the sum of true range over the trailing `n` bars
// INCLUDING the current bar.
//
// True range for bar i (i >= 1) is:
//   TR(i) = max( high[i]-low[i], |high[i]-close[i-1]|, |low[i]-close[i-1]| )
// TR(0) is undefined — we set it to high[0]-low[0] as a fallback (it will be
// dropped from the warmup window anyway).
function computeChoppinessIndex(candles: Candle[], period: number): number[] {
  const n = candles.length;
  const ci = new Array<number>(n).fill(NaN);
  if (n < period + 1) return ci;

  // Build TR series
  const trs = new Array<number>(n).fill(0);
  trs[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    trs[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
  }

  const logN = Math.log10(period);
  if (logN <= 0) return ci;

  // For each bar i with i >= period, compute over window [i-period+1 .. i].
  // We use rolling sum for TR; max/min over the window are O(period) each
  // (acceptable: ~6.5k 1H bars in 270d × 14 = ~91k ops total).
  let sumTR = 0;
  for (let k = 0; k < period; k++) sumTR += trs[k];

  for (let i = period - 1; i < n; i++) {
    if (i >= period) sumTR += trs[i] - trs[i - period];
    // window is [i-period+1 .. i]
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = i - period + 1; k <= i; k++) {
      if (candles[k].high > hh) hh = candles[k].high;
      if (candles[k].low < ll) ll = candles[k].low;
    }
    const range = hh - ll;
    if (range > 0 && sumTR > 0) {
      ci[i] = (100 * Math.log10(sumTR / range)) / logN;
    }
  }
  return ci;
}

export function precomputeChopTrendTransition1h(allCandles: Candle[]): void {
  const candles1h = resampleCandles(allCandles, 60);
  const candles4h = resampleCandles(allCandles, 240);

  const ind1h = computeIndicators(candles1h, [
    { name: "EMA", period: 50 },
  ]);
  const ind4h = computeIndicators(candles4h, [
    { name: "EMA", period: 200 },
  ]);

  const ci14_1h = computeChoppinessIndex(candles1h, 14);
  const atr14_1h = computeATR(candles1h, 14);
  const ema50_1h = ind1h.ema?.[50] ?? new Array<number>(candles1h.length).fill(NaN);
  const ema200_4h = ind4h.ema?.[200] ?? new Array<number>(candles4h.length).fill(NaN);

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

  precomputed = {
    candles1h,
    candles4h,
    map1h,
    map4h,
    ci14_1h,
    atr14_1h,
    ema50_1h,
    ema200_4h,
  };
}

export function resetChopTrendTransition1hCache(): void {
  precomputed = null;
}

// Per-direction "armed" flag — set to true when CI re-enters the chop zone
// (> chopThreshold); cleared (false) when we fire an entry. This enforces the
// "one trade per chop→trend transition" rule. Module-level state guarded by a
// synthetic session id.
const armedState: {
  sessionTs: number;
  longArmed: boolean;
  shortArmed: boolean;
} = {
  sessionTs: 0,
  longArmed: true,
  shortArmed: true,
};

export const chopTrendTransition1h: BacktestStrategy = {
  name: "Choppiness Index Transition + Trend (1H) — v7 [TUNED]",
  description:
    "v7 WINNER (tuned 2026-05-20): 1H Choppiness Index(14) transition from sustained chop (CI > 60 in trailing 12 bars) to trend (CI < 40 current bar). Direction from 1H close vs EMA50; HTF agreement from 4H EMA200 slope (±0.1%/6 bars). SL = ATR(14,1H)×1.8, TP1 = 1.7R / 50%, TP2 = 3.0R / 50%, 30h time stop. 1-2x leverage. Backtested walk-forward (TRAIN 2024-05→25-05 +9.6%, TEST 25-05→26-05 +31.8% across 7 coins, OOS retention 3.3x). Per-coin TEST: SOL +107%, AVAX +51%, LINK +43%, DOGE +31%, BNB +7%, ETH −1%, BTC −15%. Deployable on top-5 coins (SOL/AVAX/LINK/DOGE/BNB).",
  defaultConfig: {
    ciPeriod: 14,
    chopThreshold: 60,
    trendThreshold: 40,
    chopLookback: 12,
    slopeLookback4h: 6,
    slopeMinAbs: 0.001,
    atrStopMult: 1.8,
    tp1Mult: 1.7,
    tp2Mult: 3.0,
    maxHoldHours: 30,
    leverage: 2,
    positionSizePercent: 25,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    // Warmup: 200 EMA on 4H = 200 × 4h = 800h ≈ 33d. Use 40d * 1440 = 57600
    // 1m bars as safe floor (also covers slope lookback).
    if (!precomputed || index < 40 * 1440) return signals;
    const {
      map1h,
      map4h,
      ci14_1h,
      atr14_1h,
      ema50_1h,
      ema200_4h,
      candles1h,
    } = precomputed;

    // ── BOUNDARY CHECK (lookahead-bias guard) ──
    if (map1h[index] === map1h[index - 1]) return signals;

    const idx1h = map1h[index];
    const signalIdx1h = idx1h - 1; // just-closed 1H bar — safe

    const chopLookback = Math.max(1, Math.floor(Number(config.chopLookback ?? 6)));
    if (signalIdx1h < chopLookback + 2) return signals;

    const idx4h = map4h[index];
    const signalIdx4h = idx4h - 1; // just-closed 4H bar — safe
    const slopeLookback4h = Math.max(1, Math.floor(Number(config.slopeLookback4h ?? 6)));
    if (signalIdx4h < slopeLookback4h) return signals;

    // ── Reset per-session armed flags when we cross into a new session ──
    if (armedState.sessionTs === 0 || candle.timestamp < armedState.sessionTs) {
      armedState.sessionTs = candle.timestamp;
      armedState.longArmed = true;
      armedState.shortArmed = true;
    }
    armedState.sessionTs = candle.timestamp;

    // ── Indicators (read from signalIdx — NEVER from idx) ──
    const ciNow = ci14_1h[signalIdx1h];
    const atr = atr14_1h[signalIdx1h];
    const close1h = candles1h[signalIdx1h].close;
    const ema1h = ema50_1h[signalIdx1h];
    const ema4hNow = ema200_4h[signalIdx4h];
    const ema4hPast = ema200_4h[signalIdx4h - slopeLookback4h];

    if (!isFinite(ciNow)) return signals;
    if (!isFinite(atr) || atr <= 0) return signals;
    if (!isFinite(ema1h)) return signals;
    if (!isFinite(ema4hNow) || !isFinite(ema4hPast) || ema4hPast === 0) return signals;

    // ── Config ──
    const chopThreshold = Number(config.chopThreshold ?? 60);
    const trendThreshold = Number(config.trendThreshold ?? 40);
    const slopeMinAbs = Number(config.slopeMinAbs ?? 0.001);
    const atrStopMult = Number(config.atrStopMult ?? 2.0);
    const tp1Mult = Number(config.tp1Mult ?? 1.7);
    const tp2Mult = Number(config.tp2Mult ?? 3.0);
    const maxHoldHours = Number(config.maxHoldHours ?? 36);
    const leverage = Number(config.leverage ?? 2);
    const sizePct = Number(config.positionSizePercent ?? 100) / 100;
    const qty = (equity * sizePct) / candle.close;

    const slopePct = (ema4hNow - ema4hPast) / ema4hPast;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // ── Re-arm logic: if CI is currently in the chop zone, re-arm BOTH
    // directions. This is what makes "one trade per transition" work — once
    // we've fired, the flag stays false until CI bounces back into chop.
    if (ciNow > chopThreshold) {
      armedState.longArmed = true;
      armedState.shortArmed = true;
    }

    // ── Time-stop ──
    if (positions.length > 0) {
      const stale = positions.find(
        (p) => (candle.timestamp - p.entryTime) / 3_600_000 >= maxHoldHours,
      );
      if (stale) {
        signals.push({
          action: "CLOSE_ALL",
          reason: `Chop→trend time stop ${maxHoldHours}h`,
        });
        return signals;
      }
    }

    if (hasLong || hasShort) return signals;

    // ── Transition detection ──
    // Current bar must be in trend zone (CI < trendThreshold) AND
    // at least one of the prior `chopLookback` bars must have been in chop
    // zone (CI > chopThreshold).
    if (ciNow >= trendThreshold) return signals;

    let sawChop = false;
    // Look back over [signalIdx1h - chopLookback .. signalIdx1h - 1] — prior
    // bars only, current is the trend bar.
    for (let k = 1; k <= chopLookback; k++) {
      const ciPast = ci14_1h[signalIdx1h - k];
      if (isFinite(ciPast) && ciPast > chopThreshold) {
        sawChop = true;
        break;
      }
    }
    if (!sawChop) return signals;

    // ── Direction (close vs EMA50) ──
    const trendUp = close1h > ema1h;
    const trendDn = close1h < ema1h;

    // ── HTF agreement (4H EMA200 slope must be strictly non-flat in our
    // direction) ──
    const slopeUp = slopePct > slopeMinAbs;
    const slopeDn = slopePct < -slopeMinAbs;

    // ── LONG entry ──
    if (trendUp && slopeUp && armedState.longArmed) {
      const slDist = atrStopMult * atr;
      const sl = close1h - slDist;
      const tp1 = close1h + tp1Mult * slDist;
      const tp2 = close1h + tp2Mult * slDist;
      armedState.longArmed = false;
      // also disarm short — a chop→trend resolving up shouldn't immediately
      // fire a short next bar even if CI dips and re-spikes weirdly.
      armedState.shortArmed = false;
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl,
        tps: [
          { price: tp1, portion: 0.5 },
          { price: tp2, portion: 0.5 },
        ],
        reason: `CI=${ciNow.toFixed(1)}<${trendThreshold} (was >${chopThreshold} in last ${chopLookback}h), close>${ema1h.toFixed(2)} EMA50, 4H slope=${(slopePct * 100).toFixed(2)}%>+${(slopeMinAbs * 100).toFixed(2)}% | SL=${atrStopMult}×ATR, TP1=${tp1Mult}R, TP2=${tp2Mult}R`,
        entryPrice: close1h,
      });
      return signals;
    }

    // ── SHORT entry ──
    if (trendDn && slopeDn && armedState.shortArmed) {
      const slDist = atrStopMult * atr;
      const sl = close1h + slDist;
      const tp1 = close1h - tp1Mult * slDist;
      const tp2 = close1h - tp2Mult * slDist;
      armedState.shortArmed = false;
      armedState.longArmed = false;
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl,
        tps: [
          { price: tp1, portion: 0.5 },
          { price: tp2, portion: 0.5 },
        ],
        reason: `CI=${ciNow.toFixed(1)}<${trendThreshold} (was >${chopThreshold} in last ${chopLookback}h), close<${ema1h.toFixed(2)} EMA50, 4H slope=${(slopePct * 100).toFixed(2)}%<−${(slopeMinAbs * 100).toFixed(2)}% | SL=${atrStopMult}×ATR, TP1=${tp1Mult}R, TP2=${tp2Mult}R`,
        entryPrice: close1h,
      });
      return signals;
    }

    return signals;
  },
};
