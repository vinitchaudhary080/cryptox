import type { BacktestTrade, BacktestMetrics, EquityPoint } from "../types.js";

export function computeMetrics(trades: BacktestTrade[], equityCurve: EquityPoint[], initialCapital: number): BacktestMetrics {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");

  if (closedTrades.length === 0) {
    return {
      totalTrades: 0,
      winTrades: 0,
      lossTrades: 0,
      winRate: 0,
      totalPnl: 0,
      grossPnl: 0,
      totalFees: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      avgTradeDuration: 0,
    };
  }

  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);

  const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
  const totalFees = closedTrades.reduce((s, t) => s + t.fee, 0);
  const grossPnl = totalPnl + totalFees; // PnL before fees
  const totalWinPnl = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLossPnl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // Max drawdown from equity curve
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = peak - point.equity;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPct > maxDrawdownPercent) maxDrawdownPercent = drawdownPct;
  }

  // Sharpe ratio (annualized, using daily returns from equity curve)
  const sharpeRatio = computeSharpeRatio(equityCurve);

  // Consecutive wins/losses
  let currentWins = 0;
  let currentLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  for (const trade of closedTrades) {
    if (trade.pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    }
  }

  // Average trade duration in minutes
  const totalDuration = closedTrades.reduce(
    (s, t) => s + (t.exit_time - t.entry_time),
    0,
  );
  const avgTradeDuration = totalDuration / closedTrades.length / 60000;

  return {
    totalTrades: closedTrades.length,
    winTrades: wins.length,
    lossTrades: losses.length,
    winRate: (wins.length / closedTrades.length) * 100,
    totalPnl,
    grossPnl,
    totalFees,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    profitFactor: totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? Infinity : 0,
    avgWin: wins.length > 0 ? totalWinPnl / wins.length : 0,
    avgLoss: losses.length > 0 ? totalLossPnl / losses.length : 0,
    bestTrade: closedTrades.reduce((max, t) => Math.max(max, t.pnl), -Infinity),
    worstTrade: closedTrades.reduce((min, t) => Math.min(min, t.pnl), Infinity),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    avgTradeDuration,
  };
}

function computeSharpeRatio(equityCurve: EquityPoint[]): number {
  if (equityCurve.length < 2) return 0;

  // Compute daily returns by sampling equity curve at daily boundaries
  const dailyReturns: number[] = [];
  let lastEquity = equityCurve[0].equity;
  let lastDate = new Date(equityCurve[0].time).toISOString().slice(0, 10);

  for (const point of equityCurve) {
    const date = new Date(point.time).toISOString().slice(0, 10);
    if (date !== lastDate) {
      const ret = lastEquity > 0 ? (point.equity - lastEquity) / lastEquity : 0;
      dailyReturns.push(ret);
      lastEquity = point.equity;
      lastDate = date;
    }
  }

  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize: multiply by sqrt(365) for crypto (24/7 markets)
  return (mean / stdDev) * Math.sqrt(365);
}
