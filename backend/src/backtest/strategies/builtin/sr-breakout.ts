import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";

/**
 * Support / Resistance Breakout Strategy (15m)
 *
 * Concept:
 *  - Find volume-confirmed pivot highs and lows over a 20-bar lookback window
 *  - Draw Support / Resistance zones of width = 1 × ATR(200) anchored at each pivot
 *  - BUY on fresh close above resistance-box top; SELL on fresh close below support-box bottom
 *  - Hard SL at the far edge of the broken zone (pivot price)
 *  - Trail exit with KAMA(10,2,30): hand over from hard SL once KAMA crosses to a more
 *    favourable level
 *
 * Config flags:
 *  - `leverage`                (default 1)
 *  - `positionSizePercent`      (default 25 — of current equity per trade)
 *  - `candleSizeFilterPercent`  (default 0 — Version A. Set to 1 for Version B: skip
 *                                trades where breakout candle range > 1% of close.)
 */

// ─────────────────────────────────────────────────────────────
// Indicator helpers (computed in-strategy so nothing else has to change)
// ─────────────────────────────────────────────────────────────

function computeATR(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length === 0) return out;

  const tr: number[] = new Array(candles.length).fill(0);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
  }

  if (candles.length < period) return out;

  // Wilder smoothing (standard ATR)
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

function computeKAMA(closes: number[], length: number, fast: number, slow: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= length) return out;

  const fastSC = 2 / (fast + 1);
  const slowSC = 2 / (slow + 1);

  // Seed KAMA at bar `length` with SMA of first `length` closes.
  let seed = 0;
  for (let i = 0; i < length; i++) seed += closes[i];
  out[length - 1] = seed / length;

  for (let i = length; i < closes.length; i++) {
    const change = Math.abs(closes[i] - closes[i - length]);
    let volatility = 0;
    for (let j = i - length + 1; j <= i; j++) {
      volatility += Math.abs(closes[j] - closes[j - 1]);
    }
    const er = volatility > 0 ? change / volatility : 0;
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
    out[i] = out[i - 1] + sc * (closes[i] - out[i - 1]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Precompute (runs once before the simulation loop)
// ─────────────────────────────────────────────────────────────

const LOOKBACK = 20;
const ATR_PERIOD = 200;

interface Zone {
  top: number;
  bottom: number;
  pivotIdx: number;        // 15m index of the original pivot
  confirmedAt: number;     // 15m index when the zone becomes visible (= pivotIdx + LOOKBACK)
  kind: "support" | "resistance";
}

interface PrecomputedSR {
  candles15m: Candle[];
  atr: number[];
  kama: number[];
  map15m: Int32Array;
  /** zone active at each 15m bar ∈ {support|null} */
  activeSupportAt: (Zone | null)[];
  activeResistanceAt: (Zone | null)[];
  /** "fresh break" flags at each 15m bar — single-use per zone */
  breakSupAt: (Zone | null)[];
  breakResAt: (Zone | null)[];
}

let precomputed: PrecomputedSR | null = null;

export function resetSRBreakoutCache(): void {
  precomputed = null;
}

export function precomputeSRBreakout(allCandles: Candle[]): void {
  const candles15m = resampleCandles(allCandles, 15);
  const atr = computeATR(candles15m, ATR_PERIOD);
  const closes15m = candles15m.map((c) => c.close);
  const kama = computeKAMA(closes15m, 10, 2, 30);

  // Delta volume per bar + rolling Vol_High / Vol_Low over the prior 2 bars.
  const dv = candles15m.map((c) =>
    c.close > c.open ? c.volume : c.close < c.open ? -c.volume : 0,
  );
  const volHigh = new Array<number>(candles15m.length).fill(-Infinity);
  const volLow = new Array<number>(candles15m.length).fill(+Infinity);
  for (let i = 2; i < candles15m.length; i++) {
    const a = dv[i - 1] / 2.5;
    const b = dv[i - 2] / 2.5;
    volHigh[i] = Math.max(a, b);
    volLow[i] = Math.min(a, b);
  }

  // Scan for pivots (need 20 bars on either side). Emit zones as they confirm.
  const zones: Zone[] = [];
  for (let i = LOOKBACK; i < candles15m.length - LOOKBACK; i++) {
    let isPivotHigh = true;
    let isPivotLow = true;
    const hi = candles15m[i].high;
    const lo = candles15m[i].low;
    for (let j = i - LOOKBACK; j <= i + LOOKBACK; j++) {
      if (j === i) continue;
      if (candles15m[j].high >= hi) isPivotHigh = false;
      if (candles15m[j].low <= lo) isPivotLow = false;
      if (!isPivotHigh && !isPivotLow) break;
    }

    const a = atr[i];
    if (!a || isNaN(a)) continue;

    if (isPivotLow && dv[i] > volHigh[i]) {
      zones.push({
        top: lo,
        bottom: lo - a,
        pivotIdx: i,
        confirmedAt: i + LOOKBACK,
        kind: "support",
      });
    }
    if (isPivotHigh && dv[i] < volLow[i]) {
      zones.push({
        bottom: hi,
        top: hi + a,
        pivotIdx: i,
        confirmedAt: i + LOOKBACK,
        kind: "resistance",
      });
    }
  }

  // Walk forward in time; track the currently-active support and resistance.
  // A zone stays active until price closes through it (then it's "broken" and we note
  // the fresh-break signal exactly once on that bar). "Flip" is conceptual only — we
  // never trade from the flipped role.
  const activeSupportAt: (Zone | null)[] = new Array(candles15m.length).fill(null);
  const activeResistanceAt: (Zone | null)[] = new Array(candles15m.length).fill(null);
  const breakSupAt: (Zone | null)[] = new Array(candles15m.length).fill(null);
  const breakResAt: (Zone | null)[] = new Array(candles15m.length).fill(null);

  // Index zones by confirmation bar for quick lookup
  const zonesByBar: Map<number, Zone[]> = new Map();
  for (const z of zones) {
    const arr = zonesByBar.get(z.confirmedAt) ?? [];
    arr.push(z);
    zonesByBar.set(z.confirmedAt, arr);
  }

  let curSup: Zone | null = null;
  let curRes: Zone | null = null;

  for (let i = 0; i < candles15m.length; i++) {
    // 1. A new zone may confirm on this bar — it replaces the prior active one of the same kind.
    const fresh = zonesByBar.get(i);
    if (fresh) {
      for (const z of fresh) {
        if (z.kind === "support") curSup = z;
        else curRes = z;
      }
    }

    const close = candles15m[i].close;

    // 2. Check for fresh break on this bar's close.
    if (curSup && close < curSup.bottom) {
      breakSupAt[i] = curSup;
      curSup = null; // broken — no longer valid as support, and we don't re-use the flip
    }
    if (curRes && close > curRes.top) {
      breakResAt[i] = curRes;
      curRes = null;
    }

    activeSupportAt[i] = curSup;
    activeResistanceAt[i] = curRes;
  }

  // Map every 1m index to its 15m bar index
  const map15m = new Int32Array(allCandles.length);
  let j = 0;
  for (let i = 0; i < allCandles.length; i++) {
    while (
      j + 1 < candles15m.length &&
      candles15m[j + 1].timestamp <= allCandles[i].timestamp
    )
      j++;
    map15m[i] = j;
  }

  precomputed = {
    candles15m,
    atr,
    kama,
    map15m,
    activeSupportAt,
    activeResistanceAt,
    breakSupAt,
    breakResAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Strategy
// ─────────────────────────────────────────────────────────────

// Per-run trade state — tracks which "hard SL vs KAMA" mode each open position is in.
// Keyed by position id would be ideal, but we only ever hold one position at a time in
// this strategy, so a scalar is enough.
let trailingWithKama = false;

export const srBreakoutStrategy: BacktestStrategy = {
  name: "Support/Resistance Breakout",
  description:
    "15m volume-confirmed pivot zones (20-bar lookback, ATR-wide). BUY on fresh close above resistance, SELL on fresh close below support. Hard SL at the far edge of the broken zone, then KAMA(10,2,30) trail once KAMA is more favourable. Optional candle-size filter via config.",
  defaultConfig: {
    leverage: 1,
    positionSizePercent: 25,
    candleSizeFilterPercent: 0, // 0 = no filter (Version A). Set to 1 for Version B.
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];

    const { candle, index, positions, equity, config } = ctx;
    const { map15m, candles15m, kama, activeSupportAt, activeResistanceAt, breakSupAt, breakResAt } = precomputed;

    // Fire only at the first 1m bar of each new 15m bucket — resilient to
    // CSV gaps that would otherwise misalign an index-based check. Evaluate
    // against the bucket that just CLOSED (idx15 - 1) to avoid look-ahead.
    if (index === 0 || map15m[index] === map15m[index - 1]) return [];

    const idx15 = map15m[index] - 1;
    if (idx15 < ATR_PERIOD + LOOKBACK) return []; // wait for ATR + pivot confirmation warmup

    const bar = candles15m[idx15];
    // Asymmetric execution model:
    //   Entry = NEXT bar's OPEN (order placed after signal confirms).
    //   Exit  = SIGNAL bar's CLOSE (the close that triggered the exit).
    const signalBarClose = bar.close;
    const nextBarOpen    = candles15m[idx15 + 1]?.open ?? signalBarClose;
    const close = signalBarClose;
    const k = kama[idx15];

    const leverage = Number(config.leverage ?? 1);
    const sizePct = Math.max(1, Math.min(100, Number(config.positionSizePercent ?? 25))) / 100;
    const candleSizeFilter = Number(config.candleSizeFilterPercent ?? 0);

    const signals: Signal[] = [];
    const longPos = positions.find((p) => p.side === "BUY");
    const shortPos = positions.find((p) => p.side === "SELL");

    // ─────────────────────────────────────────────────────
    // Exit logic — hard SL then KAMA trailing
    // ─────────────────────────────────────────────────────
    if (longPos) {
      const hardSL = longPos.sl ?? 0;
      if (!trailingWithKama && !isNaN(k) && k > hardSL) {
        trailingWithKama = true;
      }
      if (trailingWithKama && !isNaN(k) && close < k) {
        signals.push({ action: "CLOSE_LONG", entryPrice: signalBarClose, reason: `KAMA trail: close ${close.toFixed(2)} < KAMA ${k.toFixed(2)}` });
        trailingWithKama = false;
      }
    }
    if (shortPos) {
      const hardSL = shortPos.sl ?? Infinity;
      if (!trailingWithKama && !isNaN(k) && k < hardSL) {
        trailingWithKama = true;
      }
      if (trailingWithKama && !isNaN(k) && close > k) {
        signals.push({ action: "CLOSE_SHORT", entryPrice: signalBarClose, reason: `KAMA trail: close ${close.toFixed(2)} > KAMA ${k.toFixed(2)}` });
        trailingWithKama = false;
      }
    }

    // ─────────────────────────────────────────────────────
    // Entry logic — only one of either side at a time
    // ─────────────────────────────────────────────────────
    const breakSup = breakSupAt[idx15];
    const breakRes = breakResAt[idx15];

    if (!longPos && !shortPos && (breakSup || breakRes)) {
      // Candle-size filter
      const candleRangePct = ((bar.high - bar.low) / bar.close) * 100;
      const filterPasses = candleSizeFilter <= 0 || candleRangePct <= candleSizeFilter;

      if (filterPasses) {
        if (breakRes) {
          // BUY — hard SL at bottom of resistance box (= pivot high price)
          const sl = breakRes.bottom;
          const qty = (equity * sizePct) / nextBarOpen;
          signals.push({
            action: "BUY",
            qty,
            leverage,
            sl,
            tp: undefined,
            entryPrice: nextBarOpen,
            reason: `Break Res: close ${close.toFixed(2)} > top ${breakRes.top.toFixed(2)} (pivot ${breakRes.bottom.toFixed(2)})`,
          });
          trailingWithKama = false;
        } else if (breakSup) {
          // SELL — hard SL at top of support box (= pivot low price)
          const sl = breakSup.top;
          const qty = (equity * sizePct) / nextBarOpen;
          signals.push({
            action: "SELL",
            qty,
            leverage,
            sl,
            tp: undefined,
            entryPrice: nextBarOpen,
            reason: `Break Sup: close ${close.toFixed(2)} < bottom ${breakSup.bottom.toFixed(2)} (pivot ${breakSup.top.toFixed(2)})`,
          });
          trailingWithKama = false;
        }
      }
    }

    // Also — there's still active-zone context in activeSupportAt/activeResistanceAt
    // which is currently only used for logging/debug; no additional entry paths needed
    // (breaks are emitted on the SAME bar they happen, not held open).
    void activeSupportAt;
    void activeResistanceAt;

    return signals;
  },
};
