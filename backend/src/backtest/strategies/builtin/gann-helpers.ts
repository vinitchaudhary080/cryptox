import type { Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";

/**
 * Shared helpers for Gann Matrix Momentum family (V1 / V2 / V3).
 *
 * All versions reuse the same precompute pipeline:
 *   1m candles → 15m resample → EMA20/EMA50 → weekly kryptec → Gann levels.
 *
 * Only the onCandle entry/exit logic differs between versions.
 */

export interface GannLevels {
  pivot: number;
  r180: number;
  s180: number;
  r360: number;
  s360: number;
}

export interface PrecomputedGann {
  map15m: Int32Array;
  ema20: number[];
  ema50: number[];
  gannAtCandle: GannLevels[];
  candles15m: Candle[];
}

export function kryptecPrice(c: { high: number; low: number; close: number }): number {
  return (c.high + c.low + c.close * 4) / 6;
}

export function calcGann(pivot: number): GannLevels {
  const sq = Math.sqrt(pivot);
  return {
    pivot,
    r180: (sq + 1.0) ** 2,
    s180: Math.max(0, sq - 1.0) ** 2,
    r360: (sq + 2.0) ** 2,
    s360: Math.max(0, sq - 2.0) ** 2,
  };
}

export function computeEMA(values: number[], period: number): number[] {
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

export function getWeekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - diff);
  return d.getTime();
}

export function leverageToCapitalPct(leverage: number): number {
  if (leverage >= 20) return 0.20;
  if (leverage >= 10) return 0.40;
  return 1.0;
}

export function computeGannPrecompute(allCandles: Candle[]): PrecomputedGann {
  const candles15m = resampleCandles(allCandles, 15);
  const closes15m = candles15m.map((c) => c.close);
  const ema20 = computeEMA(closes15m, 20);
  const ema50 = computeEMA(closes15m, 50);

  const map15m = new Int32Array(allCandles.length);
  let j = 0;
  for (let i = 0; i < allCandles.length; i++) {
    while (j + 1 < candles15m.length && candles15m[j + 1].timestamp <= allCandles[i].timestamp) j++;
    map15m[i] = j;
  }

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

  const weekStarts = [...weeklyKryptec.keys()].sort((a, b) => a - b);
  const gannByWeek = new Map<number, GannLevels>();
  for (let w = 0; w < weekStarts.length; w++) {
    if (w === 0) {
      const data = weeklyKryptec.get(weekStarts[0])!;
      gannByWeek.set(weekStarts[0], calcGann(kryptecPrice(data)));
    } else {
      const prevData = weeklyKryptec.get(weekStarts[w - 1])!;
      gannByWeek.set(weekStarts[w], calcGann(kryptecPrice(prevData)));
    }
  }

  const gannAtCandle: GannLevels[] = new Array(allCandles.length);
  let currentWeekIdx = 0;
  let currentGann = gannByWeek.get(weekStarts[0]) ?? calcGann(allCandles[0].close);

  for (let i = 0; i < allCandles.length; i++) {
    const ts = allCandles[i].timestamp;
    while (
      currentWeekIdx + 1 < weekStarts.length &&
      ts >= weekStarts[currentWeekIdx + 1]
    ) {
      currentWeekIdx++;
      currentGann = gannByWeek.get(weekStarts[currentWeekIdx]) ?? currentGann;
    }
    gannAtCandle[i] = currentGann;
  }

  return { map15m, ema20, ema50, gannAtCandle, candles15m };
}
