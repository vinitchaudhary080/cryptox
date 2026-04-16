import type {
  Candle,
  BacktestConfig,
  BacktestResult,
  BacktestStrategy,
  EquityPoint,
  IndicatorValues,
  Signal,
  UIStrategyConfig,
} from "../types.js";
import { loadCandles } from "../data/csv-manager.js";
import { computeIndicators } from "../indicators/index.js";
import { PositionManager } from "./position-manager.js";
import { computeMetrics } from "./metrics.js";
import { getStrategyByName } from "../strategies/strategy-runner.js";
import { resetMeriStrategyCache, precomputeMeriStrategy } from "../strategies/builtin/meri-strategy.js";
import { resetSupertrendStrategyCache, precomputeSupertrendStrategy } from "../strategies/builtin/supertrend-strategy.js";
import { resetCPRCache, precomputeCPRLevels } from "../strategies/builtin/cpr-pivot-strategy.js";
import { resetGannStrategyCache, precomputeGannStrategy } from "../strategies/builtin/gann-matrix-momentum.js";
import { evaluateUIRules } from "../strategies/strategy-runner.js";

const EQUITY_SAMPLE_INTERVAL = 60; // sample equity every 60 candles (1 hour)

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  // Reset multi-timeframe caches
  resetMeriStrategyCache();
  resetSupertrendStrategyCache();
  resetCPRCache();

  const startMs = Date.now();

  const startTime = new Date(config.startDate).getTime();
  const endTime = new Date(config.endDate).getTime();

  // Load candles for the date range
  const candles = await loadCandles(config.coin, startTime, endTime);

  if (candles.length === 0) {
    throw new Error(`No candle data found for ${config.coin} between ${config.startDate} and ${config.endDate}`);
  }

  const makerFee = config.makerFee ?? 0.0005;
  const slippage = config.slippage ?? 0.0001;

  // Initialize position manager
  const pm = new PositionManager({ makerFee, slippage });

  // Determine strategy and required indicators
  let strategy: BacktestStrategy | null = null;
  let uiConfig: UIStrategyConfig | null = null;

  if (config.strategyType === "code") {
    strategy = getStrategyByName(config.strategyName);
    if (!strategy) throw new Error(`Unknown strategy: ${config.strategyName}`);
  } else {
    uiConfig = config.strategyConfig as unknown as UIStrategyConfig;
  }

  // Compute indicators
  const indicatorConfigs = strategy
    ? strategy.requiredIndicators
    : extractIndicatorConfigsFromUI(uiConfig!);

  const indicators = computeIndicators(candles, indicatorConfigs);

  // Pre-compute multi-timeframe data for multi-TF strategies
  if (config.strategyName === "meri-strategy") {
    precomputeMeriStrategy(candles);
  } else if (config.strategyName === "supertrend-strategy") {
    precomputeSupertrendStrategy(candles);
  } else if (config.strategyName === "cpr-pivot-strategy") {
    precomputeCPRLevels(candles);
  } else if (config.strategyName === "gann-matrix-momentum") {
    precomputeGannStrategy(candles);
  }

  // Run simulation
  let equity = config.initialCapital;
  const equityCurve: EquityPoint[] = [{ time: candles[0].timestamp, equity }];

  for (let i = 0; i < candles.length; i++) {
    // Yield to the event loop every 5000 candles so the HTTP server stays
    // responsive during long backtests (1.7M candles = 340 yields, ~0ms overhead).
    if (i % 5000 === 0 && i > 0) await new Promise((r) => setImmediate(r));

    const candle = candles[i];

    // 1. Check SL/TP on existing positions
    pm.checkStopLossAndTakeProfit(candle);

    // 2. Get signals from strategy
    let signals: Signal[] = [];

    if (strategy) {
      const ctx = {
        candle,
        index: i,
        indicators,
        positions: pm.getPositions(),
        equity,
        config: {
          ...strategy.defaultConfig,
          ...(config.strategyConfig as Record<string, number | string>),
        },
      };
      // Inject allCandles for multi-timeframe strategies (e.g., Meri Strategy)
      (ctx as unknown as { _allCandles: typeof candles })._allCandles = candles;
      signals = strategy.onCandle(ctx);
    } else if (uiConfig) {
      signals = evaluateUIRules(uiConfig, candle, i, indicators, pm.getPositions());
    }

    // 3. Execute signals
    for (const signal of signals) {
      executeSignal(signal, candle, pm, equity, config);
    }

    // 4. Update equity — O(1) via cached running total, not O(trades) reduce
    equity = config.initialCapital + pm.getRealizedPnl() + pm.getUnrealizedPnl(candle.close);

    // 5. Sample equity curve
    if (i % EQUITY_SAMPLE_INTERVAL === 0 || i === candles.length - 1) {
      equityCurve.push({ time: candle.timestamp, equity });
    }
  }

  // Close any remaining open positions at last candle
  if (candles.length > 0) {
    pm.closeAllPositions(candles[candles.length - 1]);
  }

  // Final equity after closing all
  const finalEquity = config.initialCapital + pm.getRealizedPnl();

  // Add final equity point
  if (candles.length > 0) {
    equityCurve.push({ time: candles[candles.length - 1].timestamp, equity: finalEquity });
  }

  const trades = pm.getClosedTrades();
  const metrics = computeMetrics(trades, equityCurve, config.initialCapital);
  const duration = Date.now() - startMs;

  return {
    config,
    trades,
    equityCurve,
    metrics,
    finalEquity,
    duration,
  };
}

function executeSignal(
  signal: Signal,
  candle: Candle,
  pm: PositionManager,
  equity: number,
  config: BacktestConfig,
): void {
  switch (signal.action) {
    case "BUY":
    case "SELL": {
      const leverage = signal.leverage ?? 1;
      const qty = signal.qty ?? (equity * 0.1) / candle.close; // default 10% of equity
      const sl = signal.sl ?? null;
      const tp = signal.tp ?? null;
      pm.openPosition(candle, signal.action, qty, leverage, sl, tp);
      break;
    }
    case "CLOSE_LONG": {
      pm.closePositionsBySide("BUY", candle);
      break;
    }
    case "CLOSE_SHORT": {
      pm.closePositionsBySide("SELL", candle);
      break;
    }
    case "CLOSE_ALL": {
      pm.closeAllPositions(candle);
      break;
    }
  }
}

/** Extract indicator configs needed from UI strategy rules */
function extractIndicatorConfigsFromUI(uiConfig: UIStrategyConfig) {
  const seen = new Set<string>();
  const configs: { name: string; period?: number; params?: Record<string, number> }[] = [];

  const allConditions = [
    ...uiConfig.entry_rules.flatMap((r) => r.conditions),
    ...uiConfig.exit_rules.flatMap((r) => r.conditions),
  ];

  for (const cond of allConditions) {
    const key = `${cond.indicator}-${cond.period ?? "default"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    configs.push({
      name: cond.indicator,
      period: cond.period,
    });
  }

  return configs;
}
