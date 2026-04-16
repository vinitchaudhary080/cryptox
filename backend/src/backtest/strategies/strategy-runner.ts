import type {
  BacktestStrategy,
  Signal,
  Candle,
  IndicatorValues,
  Position,
  UIStrategyConfig,
  RuleCondition,
  Operator,
} from "../types.js";

// Built-in strategies registry
import { rsiMeanReversion } from "./builtin/rsi-mean-reversion.js";
import { emaCrossover } from "./builtin/ema-crossover.js";
import { macdTrend } from "./builtin/macd-trend.js";
import { bollingerBounce } from "./builtin/bollinger-bounce.js";
import { meriStrategy } from "./builtin/meri-strategy.js";
import { supertrendStrategy } from "./builtin/supertrend-strategy.js";
import { cprPivotStrategy } from "./builtin/cpr-pivot-strategy.js";
import { quickTestStrategy } from "./builtin/quick-test-strategy.js";
import { raviStrategy } from "./builtin/ravi-strategy.js";
import { gannMatrixMomentum } from "./builtin/gann-matrix-momentum.js";

const BUILTIN_STRATEGIES: Record<string, BacktestStrategy> = {
  "rsi-mean-reversion": rsiMeanReversion,
  "ema-crossover": emaCrossover,
  "meri-strategy": meriStrategy,
  "supertrend-strategy": supertrendStrategy,
  "cpr-pivot-strategy": cprPivotStrategy,
  "quick-test-strategy": quickTestStrategy,
  "ravi-strategy": raviStrategy,
  "macd-trend": macdTrend,
  "bollinger-bounce": bollingerBounce,
  "gann-matrix-momentum": gannMatrixMomentum,
};

export function getStrategyByName(name: string): BacktestStrategy | null {
  return BUILTIN_STRATEGIES[name] ?? null;
}

export function listBuiltinStrategies(): { name: string; description: string; defaultConfig: Record<string, unknown> }[] {
  return Object.entries(BUILTIN_STRATEGIES).map(([name, strategy]) => ({
    name,
    description: strategy.description,
    defaultConfig: strategy.defaultConfig,
  }));
}

// ── UI Rule Evaluation ──────────────────────────────────────────

/** Get the current indicator value for a condition */
function getIndicatorValue(
  cond: RuleCondition,
  index: number,
  indicators: IndicatorValues,
): number {
  switch (cond.indicator.toUpperCase()) {
    case "RSI":
      return indicators.rsi?.[index] ?? NaN;
    case "EMA": {
      const period = cond.period ?? 20;
      return indicators.ema?.[period]?.[index] ?? NaN;
    }
    case "SMA": {
      const period = cond.period ?? 20;
      return indicators.sma?.[period]?.[index] ?? NaN;
    }
    case "MACD": {
      const key = cond.key ?? "macd";
      if (key === "signal") return indicators.macd?.signal[index] ?? NaN;
      if (key === "histogram") return indicators.macd?.histogram[index] ?? NaN;
      return indicators.macd?.macd[index] ?? NaN;
    }
    case "BB":
    case "BOLLINGER": {
      const key = cond.key ?? "middle";
      if (key === "upper") return indicators.bb?.upper[index] ?? NaN;
      if (key === "lower") return indicators.bb?.lower[index] ?? NaN;
      return indicators.bb?.middle[index] ?? NaN;
    }
    case "VWAP":
      return indicators.vwap?.[index] ?? NaN;
    case "PRICE":
    case "CLOSE":
      return NaN; // handled separately via candle.close
    default:
      return NaN;
  }
}

function evaluateCondition(
  cond: RuleCondition,
  index: number,
  indicators: IndicatorValues,
  candle: Candle,
): boolean {
  let value: number;
  if (cond.indicator.toUpperCase() === "PRICE" || cond.indicator.toUpperCase() === "CLOSE") {
    value = candle.close;
  } else {
    value = getIndicatorValue(cond, index, indicators);
  }

  if (isNaN(value)) return false;

  const target = cond.value;
  const op: Operator = cond.operator;

  switch (op) {
    case "<": return value < target;
    case ">": return value > target;
    case "<=": return value <= target;
    case ">=": return value >= target;
    case "==": return Math.abs(value - target) < 0.0001;
    case "crosses_above": {
      if (index < 1) return false;
      const prev = cond.indicator.toUpperCase() === "PRICE"
        ? candle.close // approx — would need prev candle
        : getIndicatorValue(cond, index - 1, indicators);
      return prev <= target && value > target;
    }
    case "crosses_below": {
      if (index < 1) return false;
      const prev = cond.indicator.toUpperCase() === "PRICE"
        ? candle.close
        : getIndicatorValue(cond, index - 1, indicators);
      return prev >= target && value < target;
    }
    default:
      return false;
  }
}

/** Evaluate UI-based rules and return signals */
export function evaluateUIRules(
  config: UIStrategyConfig,
  candle: Candle,
  index: number,
  indicators: IndicatorValues,
  positions: Position[],
): Signal[] {
  const signals: Signal[] = [];

  // Check entry rules
  for (const rule of config.entry_rules) {
    const allMet = rule.conditions.every((cond) =>
      evaluateCondition(cond, index, indicators, candle),
    );

    if (allMet) {
      const positionSize = (rule.position_size_percent / 100);
      // qty is calculated relative to equity, but we don't have equity here
      // So we pass a relative qty and let the engine scale it
      const sl = rule.action === "BUY"
        ? candle.close * (1 - rule.sl_percent / 100)
        : candle.close * (1 + rule.sl_percent / 100);

      const tp = rule.action === "BUY"
        ? candle.close * (1 + rule.tp_percent / 100)
        : candle.close * (1 - rule.tp_percent / 100);

      signals.push({
        action: rule.action,
        leverage: rule.leverage,
        sl: rule.sl_percent > 0 ? sl : undefined,
        tp: rule.tp_percent > 0 ? tp : undefined,
        // qty will be calculated by the engine based on equity * positionSize
        qty: positionSize, // fraction of equity
        reason: `UI rule: ${rule.conditions.map((c) => `${c.indicator} ${c.operator} ${c.value}`).join(" AND ")}`,
      });
    }
  }

  // Check exit rules
  for (const rule of config.exit_rules) {
    const allMet = rule.conditions.every((cond) =>
      evaluateCondition(cond, index, indicators, candle),
    );

    if (allMet) {
      if (rule.close_side === "ALL") {
        signals.push({ action: "CLOSE_ALL", reason: "UI exit rule" });
      } else if (rule.close_side === "BUY") {
        signals.push({ action: "CLOSE_LONG", reason: "UI exit rule" });
      } else {
        signals.push({ action: "CLOSE_SHORT", reason: "UI exit rule" });
      }
    }
  }

  return signals;
}
