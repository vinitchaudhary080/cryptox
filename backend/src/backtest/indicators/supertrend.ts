import { ATR } from "technicalindicators";
import type { Candle } from "../types.js";

export interface SuperTrendResult {
  value: number[];      // supertrend line value
  direction: number[];  // 1 = bullish (green), -1 = bearish (red)
}

/**
 * SuperTrend indicator
 * @param candles - OHLCV data
 * @param period - ATR period (default 10)
 * @param multiplier - ATR multiplier (default 3)
 */
export function computeSuperTrend(candles: Candle[], period = 10, multiplier = 3): SuperTrendResult {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  // Compute ATR
  const atrResult = ATR.calculate({
    high: highs,
    low: lows,
    close: closes,
    period,
  });

  const atrPadding = candles.length - atrResult.length;
  const atr = [...new Array(atrPadding).fill(0), ...atrResult];

  const value = new Array(candles.length).fill(NaN);
  const direction = new Array(candles.length).fill(0);

  // Need at least `period` candles
  const startIdx = atrPadding;
  if (startIdx >= candles.length) return { value, direction };

  // Initialize
  let prevUpperBand = 0;
  let prevLowerBand = 0;
  let prevSuperTrend = 0;
  let prevDir = 1; // start bullish

  for (let i = startIdx; i < candles.length; i++) {
    const hl2 = (highs[i] + lows[i]) / 2;
    const currentAtr = atr[i];

    // Basic bands
    let upperBand = hl2 + multiplier * currentAtr;
    let lowerBand = hl2 - multiplier * currentAtr;

    // Adjust bands based on previous values (bands can only move in favorable direction)
    if (i > startIdx) {
      // Upper band: can only go DOWN (tighter) if previous close was above it
      if (lowerBand > prevLowerBand || closes[i - 1] < prevLowerBand) {
        // keep lowerBand as is
      } else {
        lowerBand = prevLowerBand;
      }

      if (upperBand < prevUpperBand || closes[i - 1] > prevUpperBand) {
        // keep upperBand as is
      } else {
        upperBand = prevUpperBand;
      }
    }

    // Determine direction
    let dir: number;
    if (i === startIdx) {
      dir = closes[i] > upperBand ? 1 : -1;
    } else {
      if (prevDir === 1) {
        // Was bullish — stays bullish unless close drops below lowerBand
        dir = closes[i] < lowerBand ? -1 : 1;
      } else {
        // Was bearish — stays bearish unless close rises above upperBand
        dir = closes[i] > upperBand ? 1 : -1;
      }
    }

    // SuperTrend value = lowerBand if bullish, upperBand if bearish
    const st = dir === 1 ? lowerBand : upperBand;

    value[i] = st;
    direction[i] = dir;

    prevUpperBand = upperBand;
    prevLowerBand = lowerBand;
    prevSuperTrend = st;
    prevDir = dir;
  }

  return { value, direction };
}
