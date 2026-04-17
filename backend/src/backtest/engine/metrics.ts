import type {
  BacktestTrade,
  BacktestMetrics,
  EquityPoint,
  DrawdownPoint,
  CumulativePnlPoint,
  TopTrade,
} from "../types.js";

const ONE_MINUTE_MS = 60_000;

function toTopTrade(t: BacktestTrade): TopTrade {
  return {
    entry_time: t.entry_time,
    exit_time: t.exit_time,
    side: t.side,
    entry_price: t.entry_price,
    exit_price: t.exit_price,
    pnl: t.pnl,
    exit_reason: t.exit_reason,
  };
}

export function computeMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
  initialCapital: number,
  candleIntervalMs: number = ONE_MINUTE_MS,
): BacktestMetrics {
  const closedTrades = trades.filter((t) => t.status === "CLOSED");

  const empty: BacktestMetrics = {
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
    largestWinTrades: [],
    largestLossTrades: [],
    avgBarsWinning: 0,
    avgBarsLosing: 0,
    avgDaysWinning: 0,
    avgDaysLosing: 0,
    drawdownCurve: [],
    cumulativePnlCurve: [],
    mddRecoveryDays: 0,
    tradeBlowoutCount: 0,
    tradeDoubleCount: 0,
    equityBlowoutCount: 0,
    equityDoubleCount: 0,
    peakEquity: 0,
    lowestEquity: 0,
  };

  if (closedTrades.length === 0) return empty;

  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl <= 0);

  const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
  const totalFees = closedTrades.reduce((s, t) => s + t.fee, 0);
  const grossPnl = totalPnl + totalFees;
  const totalWinPnl = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLossPnl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // ── Drawdown curve + max drawdown + MDD recovery days ──────────

  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  // Track the longest recovery period (peak → trough → back-to-peak)
  let recoveryStart = 0; // time when we last set a new peak
  let longestRecoveryMs = 0;
  let mddTroughTime = 0; // time of the deepest trough in current drawdown
  let currentMddRecoveredAt = 0;

  const drawdownCurve: DrawdownPoint[] = [];

  for (const point of equityCurve) {
    if (point.equity >= peak) {
      // New peak — recovery complete
      if (recoveryStart > 0 && point.time - recoveryStart > longestRecoveryMs) {
        longestRecoveryMs = point.time - recoveryStart;
      }
      peak = point.equity;
      recoveryStart = point.time;
    }
    const dd = peak - point.equity;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      mddTroughTime = point.time;
    }
    if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

    drawdownCurve.push({ time: point.time, drawdownPct: ddPct });
  }
  // If still in drawdown at end, count to last equity point
  if (equityCurve.length > 0) {
    const lastTime = equityCurve[equityCurve.length - 1].time;
    if (recoveryStart > 0 && lastTime - recoveryStart > longestRecoveryMs) {
      longestRecoveryMs = lastTime - recoveryStart;
    }
  }
  const mddRecoveryDays = Math.round(longestRecoveryMs / (24 * 60 * 60 * 1000));

  // ── Cumulative PnL curve ───────────────────────────────────────

  const cumulativePnlCurve: CumulativePnlPoint[] = [];
  let runningPnl = 0;
  for (const t of closedTrades) {
    runningPnl += t.pnl;
    cumulativePnlCurve.push({ time: t.exit_time, pnl: runningPnl });
  }

  // ── Sharpe ratio ───────────────────────────────────────────────

  const sharpeRatio = computeSharpeRatio(equityCurve);

  // ── Consecutive wins/losses ────────────────────────────────────

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

  // ── Average trade duration (minutes) ───────────────────────────

  const totalDuration = closedTrades.reduce(
    (s, t) => s + (t.exit_time - t.entry_time),
    0,
  );
  const avgTradeDuration = totalDuration / closedTrades.length / 60000;

  // ── Largest winning/losing trades (top 5 each) ─────────────────

  const sortedByPnl = [...closedTrades].sort((a, b) => b.pnl - a.pnl);
  const largestWinTrades = sortedByPnl
    .filter((t) => t.pnl > 0)
    .slice(0, 5)
    .map(toTopTrade);
  const largestLossTrades = sortedByPnl
    .filter((t) => t.pnl < 0)
    .reverse()
    .slice(0, 5)
    .map(toTopTrade);

  // ── Avg bars in winning vs losing trades ───────────────────────
  // "bars" = trade duration in candle-count, using the backtest timeframe.

  const barsForTrade = (t: BacktestTrade) =>
    Math.max(1, Math.round((t.exit_time - t.entry_time) / candleIntervalMs));

  const avgBarsWinning =
    wins.length > 0
      ? wins.reduce((s, t) => s + barsForTrade(t), 0) / wins.length
      : 0;
  const avgBarsLosing =
    losses.length > 0
      ? losses.reduce((s, t) => s + barsForTrade(t), 0) / losses.length
      : 0;

  // ── Avg duration in days ───────────────────────────────────
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysForTrade = (t: BacktestTrade) =>
    Math.max(0, (t.exit_time - t.entry_time) / DAY_MS);
  const avgDaysWinning =
    wins.length > 0
      ? wins.reduce((s, t) => s + daysForTrade(t), 0) / wins.length
      : 0;
  const avgDaysLosing =
    losses.length > 0
      ? losses.reduce((s, t) => s + daysForTrade(t), 0) / losses.length
      : 0;

  // ── Blowout / double counters ────────────────────────────────
  // Per-trade: "capital deployed" = entry_price * qty (margin, NOT notional * leverage).
  // A trade that loses ≥100% of its deployed capital → blowout.
  // A trade that gains ≥100% of its deployed capital → double.
  let tradeBlowoutCount = 0;
  let tradeDoubleCount = 0;
  for (const t of closedTrades) {
    const deployed = t.entry_price * t.qty;
    if (deployed <= 0) continue;
    if (t.pnl <= -deployed) tradeBlowoutCount++;
    if (t.pnl >= deployed) tradeDoubleCount++;
  }

  // Equity-level: count threshold crossings (hysteresis, so bouncing around the
  // line doesn't inflate the count — only re-counts after equity has moved
  // meaningfully away from the threshold).
  const blowoutThreshold = initialCapital * 0.01; // ≤1% of initial = wiped
  const doubleThreshold = initialCapital * 2;
  let equityBlowoutCount = 0;
  let equityDoubleCount = 0;
  let blowoutArmed = true; // true when we're eligible to count next blowout
  let doubleArmed = true;
  let peakEquity = initialCapital;
  let lowestEquity = initialCapital;
  for (const point of equityCurve) {
    if (point.equity > peakEquity) peakEquity = point.equity;
    if (point.equity < lowestEquity) lowestEquity = point.equity;
    // Blowout: we're armed and equity drops to/below threshold.
    if (blowoutArmed && point.equity <= blowoutThreshold) {
      equityBlowoutCount++;
      blowoutArmed = false;
    } else if (!blowoutArmed && point.equity > blowoutThreshold * 5) {
      // Equity recovered well above threshold — re-arm so a future blowout counts again.
      blowoutArmed = true;
    }
    // Double: crossed upward through 2× initial.
    if (doubleArmed && point.equity >= doubleThreshold) {
      equityDoubleCount++;
      doubleArmed = false;
    } else if (!doubleArmed && point.equity < doubleThreshold * 0.9) {
      // Equity pulled back well below 2× — re-arm.
      doubleArmed = true;
    }
  }

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
    largestWinTrades,
    largestLossTrades,
    avgBarsWinning: Math.round(avgBarsWinning * 10) / 10,
    avgBarsLosing: Math.round(avgBarsLosing * 10) / 10,
    avgDaysWinning: Math.round(avgDaysWinning * 100) / 100,
    avgDaysLosing: Math.round(avgDaysLosing * 100) / 100,
    drawdownCurve,
    cumulativePnlCurve,
    mddRecoveryDays,
    tradeBlowoutCount,
    tradeDoubleCount,
    equityBlowoutCount,
    equityDoubleCount,
    peakEquity,
    lowestEquity,
  };
}

function computeSharpeRatio(equityCurve: EquityPoint[]): number {
  if (equityCurve.length < 2) return 0;

  // Group equity points by date to get daily returns
  const dailyEquity = new Map<string, number>();
  for (const point of equityCurve) {
    const date = new Date(point.time).toISOString().slice(0, 10);
    dailyEquity.set(date, point.equity);
  }

  const dates = [...dailyEquity.keys()].sort();
  if (dates.length < 2) return 0;

  const dailyReturns: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const prev = dailyEquity.get(dates[i - 1])!;
    const curr = dailyEquity.get(dates[i])!;
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }
  }

  if (dailyReturns.length < 2) return 0;

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) /
    (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  return (avgReturn / stdDev) * Math.sqrt(365); // annualized
}
