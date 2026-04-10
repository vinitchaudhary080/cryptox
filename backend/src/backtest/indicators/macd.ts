import { MACD } from "technicalindicators";

export function computeMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macd: number[]; signal: number[]; histogram: number[] } {
  const result = MACD.calculate({
    values: closes,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const padLen = closes.length - result.length;
  const padding = new Array(padLen).fill(NaN);

  return {
    macd: [...padding, ...result.map((r) => r.MACD ?? NaN)],
    signal: [...padding, ...result.map((r) => r.signal ?? NaN)],
    histogram: [...padding, ...result.map((r) => r.histogram ?? NaN)],
  };
}
