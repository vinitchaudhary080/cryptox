import { EMA } from "technicalindicators";

export function computeEMA(closes: number[], period: number): number[] {
  const result = EMA.calculate({ values: closes, period });
  const padding = new Array(closes.length - result.length).fill(NaN);
  return [...padding, ...result];
}
