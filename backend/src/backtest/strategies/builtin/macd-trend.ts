import type { BacktestStrategy, CandleContext, Signal } from "../../types.js";

export const macdTrend: BacktestStrategy = {
  name: "MACD Trend",
  description: "Buy when MACD histogram turns positive (bullish momentum), sell when it turns negative. Momentum-based trend strategy.",
  defaultConfig: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    slPercent: 2.5,
    tpPercent: 5,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [
    { name: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  ],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, indicators, positions, equity, config } = ctx;

    const histogram = indicators.macd?.histogram[index];
    const prevHistogram = index > 0 ? indicators.macd?.histogram[index - 1] : undefined;

    if (histogram === undefined || prevHistogram === undefined) return signals;
    if (isNaN(histogram) || isNaN(prevHistogram)) return signals;

    const slPct = Number(config.slPercent ?? 2.5) / 100;
    const tpPct = Number(config.tpPercent ?? 5) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    const qty = (equity * sizePct) / candle.close;

    // Histogram turns positive: bullish signal
    if (prevHistogram <= 0 && histogram > 0) {
      if (positions.some((p) => p.side === "SELL")) {
        signals.push({ action: "CLOSE_SHORT", reason: "MACD histogram turned positive" });
      }
      if (!positions.some((p) => p.side === "BUY")) {
        signals.push({
          action: "BUY",
          qty,
          leverage,
          sl: candle.close * (1 - slPct),
          tp: candle.close * (1 + tpPct),
          reason: "MACD histogram crossed above zero",
        });
      }
    }

    // Histogram turns negative: bearish signal
    if (prevHistogram >= 0 && histogram < 0) {
      if (positions.some((p) => p.side === "BUY")) {
        signals.push({ action: "CLOSE_LONG", reason: "MACD histogram turned negative" });
      }
      if (!positions.some((p) => p.side === "SELL")) {
        signals.push({
          action: "SELL",
          qty,
          leverage,
          sl: candle.close * (1 + slPct),
          tp: candle.close * (1 - tpPct),
          reason: "MACD histogram crossed below zero",
        });
      }
    }

    return signals;
  },
};
