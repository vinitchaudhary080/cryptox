import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";

/**
 * CPR Intraday Pivot Strategy
 *
 * Uses Central Pivot Range (CPR), Previous Day High (PDH) and Previous Day Low (PDL).
 * Narrow CPR = trending day → trade breakouts
 * Wide CPR = sideways day → fade at extremes
 *
 * Crypto market open: 5:30 AM IST (00:00 UTC)
 *
 * CPR Calculation (from previous day):
 *   Pivot = (High + Low + Close) / 3
 *   BC (Bottom Central) = (High + Low) / 2
 *   TC (Top Central) = Pivot + (Pivot - BC)  [or equivalently: 2*Pivot - BC]
 *   CPR Width = |TC - BC|
 *
 * ENTRY:
 *   Narrow CPR (<0.15%): Breakout — BUY above TC, SELL below BC
 *   Wide CPR (>0.4%): Fade — SELL near PDH, BUY near PDL
 *
 * EXIT:
 *   Breakout: Target PDH (BUY) or PDL (SELL), extended target PDH + CPR width
 *   Fade: Target TC or BC (middle of range)
 *
 * SL:
 *   Breakout BUY: Below TC
 *   Breakout SELL: Above BC
 *   Fade: 0.3% beyond PDH/PDL
 */

interface DayLevels {
  date: string;
  pdh: number;    // previous day high
  pdl: number;    // previous day low
  pivot: number;
  bc: number;     // bottom central
  tc: number;     // top central
  cprWidth: number;
  cprPercent: number; // CPR width as % of price
  isNarrow: boolean;  // < 0.15%
  isWide: boolean;    // > 0.4%
}

// Pre-computed daily levels
let dailyLevels: Map<string, DayLevels> | null = null;

function getIST530Date(timestamp: number): string {
  // Crypto "day" starts at 5:30 AM IST = 00:00 UTC
  const d = new Date(timestamp);
  return d.toISOString().slice(0, 10);
}

export function precomputeCPRLevels(allCandles: Candle[]): void {
  dailyLevels = new Map();

  // Group candles by day (UTC date)
  const dayCandles = new Map<string, Candle[]>();
  for (const c of allCandles) {
    const day = getIST530Date(c.timestamp);
    if (!dayCandles.has(day)) dayCandles.set(day, []);
    dayCandles.get(day)!.push(c);
  }

  const sortedDays = Array.from(dayCandles.keys()).sort();

  for (let i = 1; i < sortedDays.length; i++) {
    const prevDay = sortedDays[i - 1];
    const today = sortedDays[i];
    const prevCandles = dayCandles.get(prevDay)!;

    // Previous day OHLC
    const prevHigh = Math.max(...prevCandles.map((c) => c.high));
    const prevLow = Math.min(...prevCandles.map((c) => c.low));
    const prevClose = prevCandles[prevCandles.length - 1].close;

    // CPR calculation
    const pivot = (prevHigh + prevLow + prevClose) / 3;
    const bc = (prevHigh + prevLow) / 2;
    const tc = 2 * pivot - bc; // equivalent to Pivot + (Pivot - BC)

    // Ensure TC > BC (swap if needed)
    const topCPR = Math.max(tc, bc);
    const botCPR = Math.min(tc, bc);

    const cprWidth = topCPR - botCPR;
    const cprPercent = (cprWidth / pivot) * 100;

    dailyLevels.set(today, {
      date: today,
      pdh: prevHigh,
      pdl: prevLow,
      pivot,
      bc: botCPR,
      tc: topCPR,
      cprWidth,
      cprPercent,
      isNarrow: cprPercent < 0.15,
      isWide: cprPercent > 0.4,
    });
  }
}

export function resetCPRCache(): void {
  dailyLevels = null;
}

export const cprPivotStrategy: BacktestStrategy = {
  name: "CPR Pivot Strategy",
  description: "Intraday pivot strategy using Central Pivot Range. Narrow CPR = breakout trades. Wide CPR = fade at PDH/PDL extremes. Dynamic SL at CPR levels.",
  defaultConfig: {
    positionSizePercent: 10,
    leverage: 1,
    fadingSlPercent: 0.3,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, positions, equity, config } = ctx;

    if (!dailyLevels || index < 100) return signals;

    const today = getIST530Date(candle.timestamp);
    const levels = dailyLevels.get(today);
    if (!levels) return signals;

    const price = candle.close;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    const fadingSlPct = Number(config.fadingSlPercent ?? 0.3) / 100;
    const qty = (equity * sizePct) / price;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // ── EXIT: Check existing positions ──

    if (hasLong) {
      for (const pos of positions.filter((p) => p.side === "BUY")) {
        // Check if we should exit based on today's levels
        // Breakout long: exit if price drops back below TC
        if (price < levels.bc) {
          signals.push({ action: "CLOSE_LONG", reason: `Price ($${price.toFixed(2)}) dropped below BC ($${levels.bc.toFixed(2)})` });
        }
      }
    }

    if (hasShort) {
      for (const pos of positions.filter((p) => p.side === "SELL")) {
        if (price > levels.tc) {
          signals.push({ action: "CLOSE_SHORT", reason: `Price ($${price.toFixed(2)}) rose above TC ($${levels.tc.toFixed(2)})` });
        }
      }
    }

    // Don't open new positions if we already have one
    if (hasLong || hasShort) return signals;

    // ── ENTRY: Narrow CPR = Breakout Mode ──

    if (levels.isNarrow) {
      // BUY breakout: price breaks above TC
      if (price > levels.tc && candle.low <= levels.tc) {
        // Candle just crossed above TC
        const sl = levels.tc - (levels.cprWidth * 0.5); // SL below TC
        const tp1 = levels.pdh; // first target: PDH
        const tp = tp1 > price ? tp1 : price + levels.cprWidth; // if PDH already below, use CPR width extension

        signals.push({
          action: "BUY",
          qty,
          leverage,
          sl,
          tp,
          reason: `NARROW CPR (${levels.cprPercent.toFixed(3)}%) breakout above TC ($${levels.tc.toFixed(2)}) | Target PDH: $${levels.pdh.toFixed(2)} | SL: $${sl.toFixed(2)}`,
        });
      }

      // SELL breakout: price breaks below BC
      if (price < levels.bc && candle.high >= levels.bc) {
        const sl = levels.bc + (levels.cprWidth * 0.5); // SL above BC
        const tp1 = levels.pdl; // first target: PDL
        const tp = tp1 < price ? tp1 : price - levels.cprWidth;

        signals.push({
          action: "SELL",
          qty,
          leverage,
          sl,
          tp,
          reason: `NARROW CPR (${levels.cprPercent.toFixed(3)}%) breakout below BC ($${levels.bc.toFixed(2)}) | Target PDL: $${levels.pdl.toFixed(2)} | SL: $${sl.toFixed(2)}`,
        });
      }
    }

    // ── ENTRY: Wide CPR = Fade Mode ──

    if (levels.isWide) {
      const pdhProximity = Math.abs(price - levels.pdh) / levels.pdh;
      const pdlProximity = Math.abs(price - levels.pdl) / levels.pdl;

      // SELL near PDH (fade resistance) — within 0.1% of PDH
      if (pdhProximity < 0.001 && price >= levels.pdh * 0.999) {
        const sl = levels.pdh * (1 + fadingSlPct); // 0.3% above PDH
        const tp = levels.tc; // target: return to TC

        signals.push({
          action: "SELL",
          qty,
          leverage,
          sl,
          tp,
          reason: `WIDE CPR (${levels.cprPercent.toFixed(3)}%) fade at PDH ($${levels.pdh.toFixed(2)}) | Target TC: $${levels.tc.toFixed(2)} | SL: $${sl.toFixed(2)}`,
        });
      }

      // BUY near PDL (fade support) — within 0.1% of PDL
      if (pdlProximity < 0.001 && price <= levels.pdl * 1.001) {
        const sl = levels.pdl * (1 - fadingSlPct); // 0.3% below PDL
        const tp = levels.bc; // target: return to BC

        signals.push({
          action: "BUY",
          qty,
          leverage,
          sl,
          tp,
          reason: `WIDE CPR (${levels.cprPercent.toFixed(3)}%) fade at PDL ($${levels.pdl.toFixed(2)}) | Target BC: $${levels.bc.toFixed(2)} | SL: $${sl.toFixed(2)}`,
        });
      }
    }

    return signals;
  },
};
