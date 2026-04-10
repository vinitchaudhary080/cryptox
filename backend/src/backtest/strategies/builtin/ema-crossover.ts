import type { BacktestStrategy, CandleContext, Signal } from "../../types.js";

export const emaCrossover: BacktestStrategy = {
  name: "EMA Crossover",
  description: "Buy when fast EMA crosses above slow EMA (golden cross), sell when it crosses below (death cross). Trend-following strategy.",
  defaultConfig: {
    fastPeriod: 9,
    slowPeriod: 21,
    slPercent: 3,
    tpPercent: 6,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [
    { name: "EMA", period: 9 },
    { name: "EMA", period: 21 },
  ],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, indicators, positions, equity, config } = ctx;

    const fastPeriod = Number(config.fastPeriod ?? 9);
    const slowPeriod = Number(config.slowPeriod ?? 21);

    const fastEma = indicators.ema?.[fastPeriod]?.[index];
    const slowEma = indicators.ema?.[slowPeriod]?.[index];
    const prevFastEma = index > 0 ? indicators.ema?.[fastPeriod]?.[index - 1] : undefined;
    const prevSlowEma = index > 0 ? indicators.ema?.[slowPeriod]?.[index - 1] : undefined;

    if (!fastEma || !slowEma || !prevFastEma || !prevSlowEma) return signals;
    if (isNaN(fastEma) || isNaN(slowEma) || isNaN(prevFastEma) || isNaN(prevSlowEma)) return signals;

    const slPct = Number(config.slPercent ?? 3) / 100;
    const tpPct = Number(config.tpPercent ?? 6) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    const qty = (equity * sizePct) / candle.close;

    // Golden cross: fast crosses above slow
    const goldenCross = prevFastEma <= prevSlowEma && fastEma > slowEma;
    // Death cross: fast crosses below slow
    const deathCross = prevFastEma >= prevSlowEma && fastEma < slowEma;

    if (goldenCross) {
      // Close any short positions first
      if (positions.some((p) => p.side === "SELL")) {
        signals.push({ action: "CLOSE_SHORT", reason: "Golden cross" });
      }
      if (!positions.some((p) => p.side === "BUY")) {
        signals.push({
          action: "BUY",
          qty,
          leverage,
          sl: candle.close * (1 - slPct),
          tp: candle.close * (1 + tpPct),
          reason: `EMA golden cross (${fastPeriod}/${slowPeriod})`,
        });
      }
    }

    if (deathCross) {
      // Close any long positions first
      if (positions.some((p) => p.side === "BUY")) {
        signals.push({ action: "CLOSE_LONG", reason: "Death cross" });
      }
      if (!positions.some((p) => p.side === "SELL")) {
        signals.push({
          action: "SELL",
          qty,
          leverage,
          sl: candle.close * (1 + slPct),
          tp: candle.close * (1 - tpPct),
          reason: `EMA death cross (${fastPeriod}/${slowPeriod})`,
        });
      }
    }

    return signals;
  },
};
