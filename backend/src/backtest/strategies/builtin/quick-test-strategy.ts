import type { BacktestStrategy, CandleContext, Signal } from "../../types.js";

/**
 * Quick Test Strategy — FOR TESTING BROKER CONNECTION ONLY
 *
 * Opens a trade on EVERY tick (1 min) to verify real orders go through.
 * Closes after 2 minutes. Very small position size.
 *
 * NOT for real trading — only for verifying broker connection works.
 */

export const quickTestStrategy: BacktestStrategy = {
  name: "Quick Test Strategy",
  description: "Opens a small test trade every few minutes to verify broker connection. For testing only — not for real trading.",
  defaultConfig: {
    positionSizePercent: 5,
    leverage: 1,
    slPercent: 1,
    tpPercent: 1,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    const { candle, positions, equity, config } = ctx;
    const sizePct = Number(config.positionSizePercent ?? 5) / 100;
    const leverage = Number(config.leverage ?? 1);
    const slPct = Number(config.slPercent ?? 1) / 100;
    const tpPct = Number(config.tpPercent ?? 1) / 100;
    const qty = (equity * sizePct) / candle.close;

    if (positions.length === 0) {
      return [{
        action: "BUY",
        qty,
        leverage,
        sl: candle.close * (1 - slPct),
        tp: candle.close * (1 + tpPct),
        reason: "Quick test — broker connection check",
      }];
    }
    return [];
  },
};
