import type { Candle } from "../types.js";

/** Compute VWAP with daily reset */
export function computeVWAP(candles: Candle[]): number[] {
  const vwap: number[] = [];
  let cumulativeTPV = 0;  // typical price * volume
  let cumulativeVol = 0;
  let currentDate = "";

  for (const candle of candles) {
    // Reset on new day
    if (candle.date !== currentDate) {
      cumulativeTPV = 0;
      cumulativeVol = 0;
      currentDate = candle.date;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVol += candle.volume;

    vwap.push(cumulativeVol > 0 ? cumulativeTPV / cumulativeVol : candle.close);
  }

  return vwap;
}
