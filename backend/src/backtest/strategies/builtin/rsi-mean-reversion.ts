import type { BacktestStrategy, CandleContext, Signal } from "../../types.js";

export const rsiMeanReversion: BacktestStrategy = {
  name: "RSI Mean Reversion",
  description: "Buy when RSI is oversold (< 30), sell when overbought (> 70). Classic mean-reversion strategy with configurable SL/TP.",
  defaultConfig: {
    rsiPeriod: 14,
    oversold: 30,
    overbought: 70,
    slPercent: 2,
    tpPercent: 4,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [{ name: "RSI", period: 14 }],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, indicators, positions, equity, config } = ctx;

    const rsi = indicators.rsi?.[index];
    if (rsi === undefined || isNaN(rsi)) return signals;

    const oversold = Number(config.oversold ?? 30);
    const overbought = Number(config.overbought ?? 70);
    const slPct = Number(config.slPercent ?? 2) / 100;
    const tpPct = Number(config.tpPercent ?? 4) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);

    const qty = (equity * sizePct) / candle.close;
    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    // Buy signal: RSI oversold
    if (rsi < oversold && !hasLong) {
      signals.push({
        action: "BUY",
        qty,
        leverage,
        sl: candle.close * (1 - slPct),
        tp: candle.close * (1 + tpPct),
        reason: `RSI ${rsi.toFixed(1)} < ${oversold}`,
      });
    }

    // Sell signal: RSI overbought
    if (rsi > overbought && !hasShort) {
      signals.push({
        action: "SELL",
        qty,
        leverage,
        sl: candle.close * (1 + slPct),
        tp: candle.close * (1 - tpPct),
        reason: `RSI ${rsi.toFixed(1)} > ${overbought}`,
      });
    }

    // Close long when RSI normalizes
    if (rsi > 50 && hasLong) {
      signals.push({ action: "CLOSE_LONG", reason: "RSI normalized above 50" });
    }

    // Close short when RSI normalizes
    if (rsi < 50 && hasShort) {
      signals.push({ action: "CLOSE_SHORT", reason: "RSI normalized below 50" });
    }

    return signals;
  },
};
