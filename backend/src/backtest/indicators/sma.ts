import { SMA } from "technicalindicators";

export function computeSMA(closes: number[], period: number): number[] {
  const result = SMA.calculate({ values: closes, period });
  const padding = new Array(closes.length - result.length).fill(NaN);
  return [...padding, ...result];
}
