import { runBacktest } from "./engine/backtest-engine.js";

const config = {
  coin: "BTC",
  startDate: "2024-03-01",
  endDate: "2026-04-09",
  strategyType: "code" as const,
  strategyName: "rsi-mean-reversion",
  strategyConfig: {
    rsiPeriod: 14,
    oversold: 30,
    overbought: 70,
    slPercent: 2,
    tpPercent: 4,
    positionSizePercent: 10,
    leverage: 1,
  },
  initialCapital: 10000,
  makerFee: 0.0005,
  slippage: 0.0001,
};

console.log("Running RSI Mean Reversion backtest on BTC (2 years of 1m data)...");
console.log("Loading 1.1M candles...");
console.time("Backtest");

const result = await runBacktest(config);

console.timeEnd("Backtest");
console.log("");
console.log("════════════════════════════════════════════════");
console.log("   BACKTEST REPORT — BTC RSI Mean Reversion    ");
console.log("════════════════════════════════════════════════");
console.log("");
console.log("Period:           ", config.startDate, "→", config.endDate);
console.log("Initial Capital:  ", `$${config.initialCapital.toLocaleString()}`);
console.log("Final Equity:     ", `$${result.finalEquity.toFixed(2)}`);
console.log("Total PnL:        ", `$${result.metrics.totalPnl.toFixed(2)}`, result.metrics.totalPnl >= 0 ? "PROFIT" : "LOSS");
console.log("ROI:              ", `${((result.finalEquity - config.initialCapital) / config.initialCapital * 100).toFixed(2)}%`);
console.log("");
console.log("── Trade Stats ──");
console.log("Total Trades:     ", result.metrics.totalTrades);
console.log("Win Trades:       ", result.metrics.winTrades);
console.log("Loss Trades:      ", result.metrics.lossTrades);
console.log("Win Rate:         ", `${result.metrics.winRate.toFixed(1)}%`);
console.log("");
console.log("── Risk Metrics ──");
console.log("Max Drawdown:     ", `$${result.metrics.maxDrawdown.toFixed(2)}`);
console.log("Sharpe Ratio:     ", result.metrics.sharpeRatio.toFixed(2));
console.log("Profit Factor:    ", result.metrics.profitFactor === Infinity ? "∞" : result.metrics.profitFactor.toFixed(2));
console.log("");
console.log("── Trade Analysis ──");
console.log("Avg Win:          ", `$${result.metrics.avgWin.toFixed(2)}`);
console.log("Avg Loss:         ", `$${result.metrics.avgLoss.toFixed(2)}`);
console.log("Best Trade:       ", `$${result.metrics.bestTrade.toFixed(2)}`);
console.log("Worst Trade:      ", `$${result.metrics.worstTrade.toFixed(2)}`);
console.log("Max Consec Wins:  ", result.metrics.maxConsecutiveWins);
console.log("Max Consec Losses:", result.metrics.maxConsecutiveLosses);
console.log("Avg Trade Dur:    ", `${result.metrics.avgTradeDuration.toFixed(0)} min`);
console.log("");
console.log("── Sample Trades (first 10) ──");
console.log("Entry Time            | Side | Entry Price  | Exit Price   | PnL        | Reason");
console.log("─────────────────────-|------|-------------|-------------|------------|-------");
result.trades.slice(0, 10).forEach((t) => {
  const et = new Date(t.entry_time).toISOString().slice(0, 16);
  const pnlStr = (t.pnl >= 0 ? "+" : "") + `$${t.pnl.toFixed(2)}`;
  console.log(
    `${et.padEnd(22)}| ${t.side.padEnd(5)}| $${t.entry_price.toFixed(2).padStart(10)} | $${t.exit_price.toFixed(2).padStart(10)} | ${pnlStr.padStart(10)} | ${t.exit_reason}`,
  );
});
console.log("");
console.log("Equity curve points:", result.equityCurve.length);
console.log("Execution time:     ", `${result.duration}ms`);
