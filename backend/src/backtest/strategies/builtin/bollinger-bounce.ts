import type { BacktestStrategy, CandleContext, Signal } from "../../types.js";

export const bollingerBounce: BacktestStrategy = {
  name: "Bollinger Bounce",
  description: "Buy when price touches lower Bollinger Band (oversold), sell when it touches upper band (overbought). Mean-reversion band strategy.",
  defaultConfig: {
    bbPeriod: 20,
    bbStdDev: 2,
    slPercent: 2,
    tpPercent: 3,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [
    { name: "BB", period: 20, params: { stdDev: 2 } },
  ],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, indicators, positions, equity, config } = ctx;

    const upper = indicators.bb?.upper[index];
    const lower = indicators.bb?.lower[index];
    const middle = indicators.bb?.middle[index];

    if (!upper || !lower || !middle) return signals;
    if (isNaN(upper) || isNaN(lower) || isNaN(middle)) return signals;

    const slPct = Number(config.slPercent ?? 2) / 100;
    const tpPct = Number(config.tpPercent ?? 3) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // Price touches lower band: buy signal
    if (candle.low <= lower && !hasLong) {
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl: candle.close * (1 - slPct),
        tp: middle, // target middle band
        reason: `Price touched lower BB (${lower.toFixed(2)})`,
      });
    }

    // Price touches upper band: sell signal
    if (candle.high >= upper && !hasShort) {
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl: candle.close * (1 + slPct),
        tp: middle, // target middle band
        reason: `Price touched upper BB (${upper.toFixed(2)})`,
      });
    }

    // Close long at middle band
    if (candle.close >= middle && hasLong) {
      signals.push({ action: "CLOSE_LONG", reason: "Price reached middle BB" });
    }

    // Close short at middle band
    if (candle.close <= middle && hasShort) {
      signals.push({ action: "CLOSE_SHORT", reason: "Price reached middle BB" });
    }

    return signals;
  },
};
