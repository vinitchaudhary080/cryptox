import { RSI } from "technicalindicators";

export function computeRSI(closes: number[], period = 14): number[] {
  const result = RSI.calculate({ values: closes, period });
  // Pad with NaN at the start to align with candle array
  const padding = new Array(closes.length - result.length).fill(NaN);
  return [...padding, ...result];
}
