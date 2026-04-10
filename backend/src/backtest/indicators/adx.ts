import { ADX } from "technicalindicators";
import type { Candle } from "../types.js";

export function computeADX(candles: Candle[], period = 14): number[] {
  const result = ADX.calculate({
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
    period,
  });

  const padding = new Array(candles.length - result.length).fill(NaN);
  return [...padding, ...result.map((r) => r.adx)];
}
