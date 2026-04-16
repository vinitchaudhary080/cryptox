import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";
import { resampleCandles } from "../../indicators/resample.js";
import { computeIndicators } from "../../indicators/index.js";

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
 *   RE-ENTRY: Allowed while price remains in sweet zone
 *
 * POSITION SIZING (leverage-based inverse):
 *   5x → 100% capital | 10x → 40% | 20x → 20%
 */

// ── Gann Square of 9 helpers ──────────────────────────────────

function kryptec(candle: Candle): number {
  return (candle.high + candle.low + candle.close * 4) / 6;
}

interface GannLevels {
  pivot: number;     // 0°
  r180: number;      // +180°
  s180: number;      // -180°
  r360: number;      // +360°
  s360: number;      // -360°
}

function calcGannLevels(pivotPrice: number): GannLevels {
  const sq = Math.sqrt(pivotPrice);
  return {
    pivot: pivotPrice,
    r180: Math.pow(sq + 1.0, 2),
    s180: Math.pow(Math.max(0, sq - 1.0), 2),
    r360: Math.pow(sq + 2.0, 2),
    s360: Math.pow(Math.max(0, sq - 2.0), 2),
  };
}

// ── Weekly resampling helper ──────────────────────────────────

function getWeekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = start of week
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - diff);
  return d.getTime();
}

function buildWeeklyKryptecMap(candles: Candle[]): Map<number, number> {
  // Group 1m candles by week → compute kryptec on weekly OHLCV
  const weeks = new Map<number, { open: number; high: number; low: number; close: number }>();

  for (const c of candles) {
    const ws = getWeekStart(c.timestamp);
    const w = weeks.get(ws);
    if (!w) {
      weeks.set(ws, { open: c.open, high: c.high, low: c.low, close: c.close });
    } else {
      w.high = Math.max(w.high, c.high);
      w.low = Math.min(w.low, c.low);
      w.close = c.close; // last close of the week
    }
  }

  // For each week, compute kryptec = (H + L + 4*C) / 6
  const result = new Map<number, number>();
  for (const [ws, w] of weeks) {
    result.set(ws, (w.high + w.low + w.close * 4) / 6);
  }
  return result;
}

// ── EMA helper (lightweight, no full indicator system needed) ──

function computeEMA(values: number[], period: number): number[] {
  const ema: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return ema;

  // SMA for initial seed
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  ema[period - 1] = sum / period;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema[i] = values[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// ── Leverage → capital percentage mapping ─────────────────────

function leverageToCapitalPct(leverage: number): number {
  if (leverage >= 20) return 0.20;
  if (leverage >= 10) return 0.40;
  return 1.0; // 5x or below = full capital
}

// ── Strategy state (persists across onCandle calls via closure) ─

let cachedGannLevels: GannLevels | null = null;
let cachedGannWeekStart = 0;
let cached15mBars: Candle[] = [];
let cached15mEma20: number[] = [];
let cached15mEma50: number[] = [];
let last15mBarCount = 0;

function resetState() {
  cachedGannLevels = null;
  cachedGannWeekStart = 0;
  cached15mBars = [];
  cached15mEma20 = [];
  cached15mEma50 = [];
  last15mBarCount = 0;
}

export const gannMatrixMomentum: BacktestStrategy = {
  name: "Gann Matrix Momentum",
  description:
    "Multi-timeframe trend following: Gann Square of 9 (Weekly kryptec pivot) " +
    "for trend zones, EMA 20/50 crossover on 15m for entries. Trades only in " +
    "the 0°–180° (longs) or -180°–0° (shorts) sweet zone.",
  defaultConfig: {
    leverage: 5,
    slPercent: 0, // 0 = no fixed SL, exit on opposite EMA cross only
    tpPercent: 0,
    positionSizePercent: 100, // overridden by leverage mapping
  },
  requiredIndicators: [], // we compute our own 15m EMAs internally

  onCandle(ctx: CandleContext): Signal[] {
    const { candle, index, positions, equity, config } = ctx;
    const allCandles = (ctx as unknown as { _allCandles: Candle[] })._allCandles;

    // ── Only evaluate on 15m boundaries ────────────────────────
    // (every 15th 1m candle — index 14, 29, 44, ...)
    if ((index + 1) % 15 !== 0) return [];
    if (index < 60) return []; // need at least 60 bars (1 hour) for warmup

    // ── Build / update 15m bars + EMAs ─────────────────────────
    const slice = allCandles.slice(0, index + 1);
    const bars15m = resampleCandles(slice, 15);

    if (bars15m.length < 55) return []; // need 50+ bars for EMA50

    // Only recompute EMAs if new 15m bars were added
    if (bars15m.length !== last15mBarCount) {
      const closes = bars15m.map((b) => b.close);
      cached15mEma20 = computeEMA(closes, 20);
      cached15mEma50 = computeEMA(closes, 50);
      cached15mBars = bars15m;
      last15mBarCount = bars15m.length;
    }

    const len = cached15mBars.length;
    const currEma20 = cached15mEma20[len - 1];
    const prevEma20 = cached15mEma20[len - 2];
    const currEma50 = cached15mEma50[len - 1];
    const prevEma50 = cached15mEma50[len - 2];

    if (isNaN(currEma20) || isNaN(currEma50) || isNaN(prevEma20) || isNaN(prevEma50)) {
      return [];
    }

    // ── Detect EMA crossover / crossunder ──────────────────────
    const bullishCross = prevEma20 <= prevEma50 && currEma20 > currEma50;
    const bearishCross = prevEma20 >= prevEma50 && currEma20 < currEma50;
    const emaAbove = currEma20 > currEma50;
    const emaBelow = currEma20 < currEma50;

    // ── Compute Gann levels (weekly pivot, update on new week) ─
    const currentWeekStart = getWeekStart(candle.timestamp);
    if (!cachedGannLevels || currentWeekStart !== cachedGannWeekStart) {
      // Build weekly kryptec map and use PREVIOUS week's value as pivot
      const weeklyMap = buildWeeklyKryptecMap(slice);
      const weekStarts = [...weeklyMap.keys()].sort((a, b) => a - b);

      // Find previous week's kryptec (the week before the current one)
      let prevWeekKryptec = 0;
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        if (weekStarts[i] < currentWeekStart) {
          prevWeekKryptec = weeklyMap.get(weekStarts[i])!;
          break;
        }
      }

      if (prevWeekKryptec > 0) {
        cachedGannLevels = calcGannLevels(prevWeekKryptec);
        cachedGannWeekStart = currentWeekStart;
      } else if (!cachedGannLevels) {
        // First week fallback — use current week's running kryptec
        const firstKryptec = weeklyMap.values().next().value;
        if (firstKryptec) {
          cachedGannLevels = calcGannLevels(firstKryptec);
          cachedGannWeekStart = currentWeekStart;
        }
      }
    }

    if (!cachedGannLevels) return [];

    const { pivot, r180, s180 } = cachedGannLevels;
    const price = candle.close;

    // ── Zone checks ────────────────────────────────────────────
    const inLongZone = price > pivot && price < r180;   // 0° < price < 180°
    const inShortZone = price < pivot && price > s180;  // -180° < price < 0°

    // ── Position sizing ────────────────────────────────────────
    const leverage = Number(config.leverage ?? 5);
    const capitalPct = leverageToCapitalPct(leverage);
    const qty = (equity * capitalPct) / price;

    const signals: Signal[] = [];
    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // ── EXIT: opposite EMA cross ───────────────────────────────
    if (hasLong && bearishCross) {
      signals.push({
        action: "CLOSE_LONG",
        reason: `EMA20 (${currEma20.toFixed(2)}) crossed below EMA50 (${currEma50.toFixed(2)}) — exit long`,
      });
    }
    if (hasShort && bullishCross) {
      signals.push({
        action: "CLOSE_SHORT",
        reason: `EMA20 (${currEma20.toFixed(2)}) crossed above EMA50 (${currEma50.toFixed(2)}) — exit short`,
      });
    }

    // ── LONG ENTRY ─────────────────────────────────────────────
    if (bullishCross && inLongZone && !hasLong) {
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl: 0, // no fixed SL — exit on opposite cross
        tp: 0,
        reason: `EMA20 ↑ EMA50 + price $${price.toFixed(2)} in Gann [0°=$${pivot.toFixed(2)}, 180°=$${r180.toFixed(2)}]`,
      });
    }

    // ── SHORT ENTRY ────────────────────────────────────────────
    if (bearishCross && inShortZone && !hasShort) {
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl: 0,
        tp: 0,
        reason: `EMA20 ↓ EMA50 + price $${price.toFixed(2)} in Gann [-180°=$${s180.toFixed(2)}, 0°=$${pivot.toFixed(2)}]`,
      });
    }

    return signals;
  },
};

// Reset state when module is re-imported (tsx watch, etc.)
resetState();
