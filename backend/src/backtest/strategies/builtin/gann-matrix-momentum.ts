import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";

/**
 * Gann Matrix Momentum — Multi-timeframe trend following with Gann Square of 9
 *
 * COMPONENTS:
 *   1. Gann Square of 9 (anchored on Weekly "kryptec" source)
 *      kryptec = (H + L + 4*C) / 6
 *      Levels: 0° (pivot), ±180° = (√pivot ± 1.0)², ±360° = (√pivot ± 2.0)²
 *
 *   2. EMA 20 / EMA 50 crossover on 15-minute resampled candles
 *
 * RULES:
 *   LONG:  EMA20 > EMA50 cross + price in [0°, 180°] sweet zone
 *   SHORT: EMA20 < EMA50 cross + price in [-180°, 0°] sweet zone
 *   EXIT:  Opposite EMA cross (no fixed SL/TP)
 *
 * POSITION SIZING (leverage-based inverse):
 *   5x → 100% capital | 10x → 40% | 20x → 20%
 *
 * PERFORMANCE:
 *   Uses precompute pattern (like meri-strategy) — all 15m resampling,
 *   EMA computation, and weekly Gann level calculation happen ONCE before
 *   the simulation loop. onCandle does O(1) index lookups only.
 */

// ── Precomputed data (set once, used every onCandle) ─────────

interface GannLevels {
  pivot: number;
  r180: number;
  s180: number;
}

interface PrecomputedGann {
  map15m: Int32Array;        // 1m index → 15m bar index
  ema20: number[];           // per 15m bar
  ema50: number[];           // per 15m bar
  gannAtCandle: GannLevels[]; // per 1m candle → which week's Gann levels apply
}

let precomputed: PrecomputedGann | null = null;

// ── Helpers ───────────────────────────────────────────────────

function kryptecPrice(c: { high: number; low: number; close: number }): number {
  return (c.high + c.low + c.close * 4) / 6;
}

function calcGann(pivot: number): GannLevels {
  const sq = Math.sqrt(pivot);
  return {
    pivot,
    r180: (sq + 1.0) ** 2,
    s180: Math.max(0, sq - 1.0) ** 2,
  };
}

function computeEMA(values: number[], period: number): number[] {
  const ema: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return ema;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function getWeekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - diff);
  return d.getTime();
}

function leverageToCapitalPct(leverage: number): number {
  if (leverage >= 20) return 0.20;
  if (leverage >= 10) return 0.40;
  return 1.0;
}

// ── Precompute (called ONCE before simulation loop) ──────────

export function precomputeGannStrategy(allCandles: Candle[]): void {
  // 1. Resample 1m → 15m (ONE pass over all data)
  const candles15m = resampleCandles(allCandles, 15);

  // 2. Compute EMA20 + EMA50 on 15m closes
  const closes15m = candles15m.map((c) => c.close);
  const ema20 = computeEMA(closes15m, 20);
  const ema50 = computeEMA(closes15m, 50);

  // 3. Build 1m→15m index map (same pattern as meri-strategy)
  const map15m = new Int32Array(allCandles.length);
  let j = 0;
  for (let i = 0; i < allCandles.length; i++) {
    while (j + 1 < candles15m.length && candles15m[j + 1].timestamp <= allCandles[i].timestamp) j++;
    map15m[i] = j;
  }

  // 4. Build weekly kryptec → Gann levels, then map each 1m candle to its week's levels
  //    Group candles by week, compute kryptec per completed week.
  const weeklyKryptec = new Map<number, { high: number; low: number; close: number }>();

  for (const c of allCandles) {
    const ws = getWeekStart(c.timestamp);
    const w = weeklyKryptec.get(ws);
    if (!w) {
      weeklyKryptec.set(ws, { high: c.high, low: c.low, close: c.close });
    } else {
      w.high = Math.max(w.high, c.high);
      w.low = Math.min(w.low, c.low);
      w.close = c.close;
    }
  }

  // Sorted week starts
  const weekStarts = [...weeklyKryptec.keys()].sort((a, b) => a - b);

  // For each week, the Gann anchor = PREVIOUS week's kryptec
  const gannByWeek = new Map<number, GannLevels>();
  for (let w = 0; w < weekStarts.length; w++) {
    if (w === 0) {
      // First week: use its own kryptec as fallback
      const data = weeklyKryptec.get(weekStarts[0])!;
      gannByWeek.set(weekStarts[0], calcGann(kryptecPrice(data)));
    } else {
      // Use PREVIOUS week's kryptec
      const prevData = weeklyKryptec.get(weekStarts[w - 1])!;
      gannByWeek.set(weekStarts[w], calcGann(kryptecPrice(prevData)));
    }
  }

  // Map each 1m candle to its week's Gann levels (O(n) single pass)
  const gannAtCandle: GannLevels[] = new Array(allCandles.length);
  let currentWeekIdx = 0;
  let currentGann = gannByWeek.get(weekStarts[0]) ?? calcGann(allCandles[0].close);

  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    // Advance to the correct week
    while (
      currentWeekIdx + 1 < weekStarts.length &&
      ts >= weekStarts[currentWeekIdx + 1]
    ) {
      currentWeekIdx++;
      currentGann = gannByWeek.get(weekStarts[currentWeekIdx]) ?? currentGann;
    }
    gannAtCandle[i] = currentGann;
  }

  precomputed = { map15m, ema20, ema50, gannAtCandle };
}

export function resetGannStrategyCache(): void {
  precomputed = null;
}

// ── Strategy ─────────────────────────────────────────────────

export const gannMatrixMomentum: BacktestStrategy = {
  name: "Gann Matrix Momentum",
  description:
    "Multi-timeframe trend following: Gann Square of 9 (Weekly kryptec pivot) " +
    "for trend zones, EMA 20/50 crossover on 15m for entries. Trades only in " +
    "the 0°–180° (longs) or -180°–0° (shorts) sweet zone.",
  defaultConfig: {
    leverage: 5,
    positionSizePercent: 100,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];

    const { candle, index, positions, equity, config } = ctx;
    const { map15m, ema20, ema50, gannAtCandle } = precomputed;

    // Only evaluate on 15m boundaries
    if ((index + 1) % 15 !== 0) return [];

    const idx15m = map15m[index];
    if (idx15m < 51) return []; // need 50+ bars for EMA50 warmup

    const currEma20 = ema20[idx15m];
    const prevEma20 = ema20[idx15m - 1];
    const currEma50 = ema50[idx15m];
    const prevEma50 = ema50[idx15m - 1];

    if (isNaN(currEma20) || isNaN(currEma50) || isNaN(prevEma20) || isNaN(prevEma50)) {
      return [];
    }

    // EMA crossover detection
    const bullishCross = prevEma20 <= prevEma50 && currEma20 > currEma50;
    const bearishCross = prevEma20 >= prevEma50 && currEma20 < currEma50;

    // Gann levels for this candle's week
    const gann = gannAtCandle[index];
    if (!gann) return [];

    const price = candle.close;
    const inLongZone = price > gann.pivot && price < gann.r180;
    const inShortZone = price < gann.pivot && price > gann.s180;

    // Position sizing
    const leverage = Number(config.leverage ?? 5);
    const capitalPct = leverageToCapitalPct(leverage);
    const qty = (equity * capitalPct) / price;

    const signals: Signal[] = [];
    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // EXIT: opposite EMA cross
    if (hasLong && bearishCross) {
      signals.push({
        action: "CLOSE_LONG",
        reason: `EMA20 (${currEma20.toFixed(2)}) ↓ EMA50 (${currEma50.toFixed(2)}) — exit long`,
      });
    }
    if (hasShort && bullishCross) {
      signals.push({
        action: "CLOSE_SHORT",
        reason: `EMA20 (${currEma20.toFixed(2)}) ↑ EMA50 (${currEma50.toFixed(2)}) — exit short`,
      });
    }

    // LONG ENTRY
    if (bullishCross && inLongZone && !hasLong) {
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl: undefined,
        tp: undefined,
        reason: `EMA20 ↑ EMA50 + price $${price.toFixed(2)} in Gann [0°=$${gann.pivot.toFixed(2)}, 180°=$${gann.r180.toFixed(2)}]`,
      });
    }

    // SHORT ENTRY
    if (bearishCross && inShortZone && !hasShort) {
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl: undefined,
        tp: undefined,
        reason: `EMA20 ↓ EMA50 + price $${price.toFixed(2)} in Gann [-180°=$${gann.s180.toFixed(2)}, 0°=$${gann.pivot.toFixed(2)}]`,
      });
    }

    return signals;
  },
};
