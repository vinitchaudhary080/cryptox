import { BollingerBands } from "technicalindicators";

export function computeBollingerBands(
  closes: number[],
  period = 20,
  stdDev = 2,
): { upper: number[]; middle: number[]; lower: number[] } {
  const result = BollingerBands.calculate({ values: closes, period, stdDev });

  const padLen = closes.length - result.length;
  const padding = new Array(padLen).fill(NaN);

  return {
    upper: [...padding, ...result.map((r) => r.upper)],
    middle: [...padding, ...result.map((r) => r.middle)],
    lower: [...padding, ...result.map((r) => r.lower)],
  };
}
