import type { Candle, IndicatorConfig, IndicatorValues } from "../types.js";
import { computeRSI } from "./rsi.js";
import { computeEMA } from "./ema.js";
import { computeSMA } from "./sma.js";
import { computeMACD } from "./macd.js";
import { computeBollingerBands } from "./bollinger.js";
import { computeVWAP } from "./vwap.js";
import { computeADX } from "./adx.js";
import { computeSuperTrend } from "./supertrend.js";

/** Compute all requested indicators from candle data */
export function computeIndicators(candles: Candle[], configs: IndicatorConfig[]): IndicatorValues {
  const closes = candles.map((c) => c.close);
  const result: IndicatorValues = {};

  for (const config of configs) {
    switch (config.name.toUpperCase()) {
      case "RSI": {
        result.rsi = computeRSI(closes, config.period ?? 14);
        break;
      }
      case "EMA": {
        if (!result.ema) result.ema = {};
        const period = config.period ?? 20;
        result.ema[period] = computeEMA(closes, period);
        break;
      }
      case "SMA": {
        if (!result.sma) result.sma = {};
        const period = config.period ?? 20;
        result.sma[period] = computeSMA(closes, period);
        break;
      }
      case "MACD": {
        result.macd = computeMACD(
          closes,
          config.params?.fastPeriod ?? 12,
          config.params?.slowPeriod ?? 26,
          config.params?.signalPeriod ?? 9,
        );
        break;
      }
      case "BB":
      case "BOLLINGER": {
        result.bb = computeBollingerBands(
          closes,
          config.period ?? 20,
          config.params?.stdDev ?? 2,
        );
        break;
      }
      case "VWAP": {
        result.vwap = computeVWAP(candles);
        break;
      }
      case "ADX": {
        result.adx = computeADX(candles, config.period ?? 14);
        break;
      }
      case "SUPERTREND": {
        result.supertrend = computeSuperTrend(
          candles,
          config.period ?? 10,
          config.params?.multiplier ?? 3,
        );
        break;
      }
    }
  }

  return result;
}

export { computeRSI } from "./rsi.js";
export { computeEMA } from "./ema.js";
export { computeSMA } from "./sma.js";
export { computeMACD } from "./macd.js";
export { computeBollingerBands } from "./bollinger.js";
export { computeVWAP } from "./vwap.js";
export { computeADX } from "./adx.js";
export { computeSuperTrend } from "./supertrend.js";
