import type { BacktestStrategy, CandleContext, Signal } from "../../types.js";

/**
 * Ravi Strategy — EMA(15) on 1-Minute Timeframe
 *
 * RULES:
 * - BUY: When 1m candle closes ABOVE EMA(15) — go long
 * - SELL: When 1m candle closes BELOW EMA(15) — go short
 * - If already in a position and signal reverses → close + open opposite
 * - Only 1 position at a time
 *
 * NO crossover needed — just checks if current candle close is above or below EMA.
 */

export const raviStrategy: BacktestStrategy = {
  name: "Ravi Strategy",
  description: "Buy when 1m candle closes above EMA(15), sell when it closes below. Stays in position until reverse signal.",
  defaultConfig: {
    slPercent: 1,
    tpPercent: 2,
    positionSizePercent: 10,
    leverage: 1,
  },
  requiredIndicators: [
    { name: "EMA", period: 15 },
  ],

  onCandle(ctx: CandleContext): Signal[] {
    const signals: Signal[] = [];
    const { candle, index, indicators, positions, equity, config } = ctx;

    if (index < 20) return signals;

    const ema15 = indicators.ema?.[15];
    if (!ema15) return signals;

    const currEma = ema15[index];
    if (isNaN(currEma)) return signals;

    const slPct = Number(config.slPercent ?? 1) / 100;
    const tpPct = Number(config.tpPercent ?? 2) / 100;
    const sizePct = Number(config.positionSizePercent ?? 10) / 100;
    const leverage = Number(config.leverage ?? 1);
    const qty = (equity * sizePct) / candle.close;

    const hasLong = positions.some((p) => p.side === "BUY");
    const hasShort = positions.some((p) => p.side === "SELL");

    const isAbove = candle.close > currEma;
    const isBelow = candle.close < currEma;

    // Close above EMA → should be LONG
    if (isAbove) {
      // If short → close it
      if (hasShort) {
        signals.push({ action: "CLOSE_SHORT", reason: `Close ($${candle.close.toFixed(2)}) > EMA15 ($${currEma.toFixed(2)}) — reversing to BUY` });
      }
      // If not long → open BUY
      if (!hasLong) {
        signals.push({
          action: "BUY",
          qty,
          leverage,
          sl: candle.close * (1 - slPct),
          tp: candle.close * (1 + tpPct),
          reason: `Close ($${candle.close.toFixed(2)}) > EMA15 ($${currEma.toFixed(2)})`,
        });
      }
    }

    // Close below EMA → should be SHORT
    if (isBelow) {
      // If long → close it
      if (hasLong) {
        signals.push({ action: "CLOSE_LONG", reason: `Close ($${candle.close.toFixed(2)}) < EMA15 ($${currEma.toFixed(2)}) — reversing to SELL` });
      }
      // If not short → open SELL
      if (!hasShort) {
        signals.push({
          action: "SELL",
          qty,
          leverage,
          sl: candle.close * (1 + slPct),
          tp: candle.close * (1 - tpPct),
          reason: `Close ($${candle.close.toFixed(2)}) < EMA15 ($${currEma.toFixed(2)})`,
        });
      }
    }

    return signals;
  },
};
