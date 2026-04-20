/**
 * Build a full backtest report as a multi-section CSV and trigger a browser
 * download. Sections: run summary, core metrics, extended metrics, top winning
 * trades, top losing trades, all trades. Opens cleanly in Excel / Sheets.
 */

type RunLike = {
  id: string;
  coin: string;
  startDate: string;
  endDate: string;
  strategyType: string;
  strategyName: string;
  strategyConfig: Record<string, unknown>;
  initialCapital: number;
  finalEquity: number;
  totalPnl: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  status: string;
  duration: number | null;
  createdAt: string;
  grossPnl?: number;
  totalFees?: number;
  makerFee?: number;
  slippage?: number;
};

type TopTradeLike = {
  entry_time?: number;
  exit_time?: number;
  side?: string;
  pnl?: number;
};

type TradeLike = {
  entryTime: string;
  entryPrice: number;
  qty: number;
  side: string;
  leverage: number;
  sl: number | null;
  tp: number | null;
  exitTime: string | null;
  exitPrice: number | null;
  pnl: number;
  fee: number;
  exitReason: string | null;
};

type ExtendedLike = {
  largestWinTrades?: TopTradeLike[];
  largestLossTrades?: TopTradeLike[];
  avgBarsWinning?: number;
  avgBarsLosing?: number;
  avgDaysWinning?: number;
  avgDaysLosing?: number;
  mddRecoveryDays?: number;
  tradeBlowoutCount?: number;
  tradeDoubleCount?: number;
  equityBlowoutCount?: number;
  equityDoubleCount?: number;
  peakEquity?: number;
  lowestEquity?: number;
  maxDrawdownPercent?: number;
  [key: string]: unknown;
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: unknown[]): string {
  return cells.map(csvEscape).join(",");
}

function formatTime(ms: number | string | null | undefined): string {
  if (!ms) return "";
  const d = typeof ms === "number" ? new Date(ms) : new Date(ms);
  if (isNaN(d.getTime())) return String(ms);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function downloadBacktestReport(run: RunLike, trades: TradeLike[], ext: ExtendedLike): void {
  const lines: string[] = [];

  // ── SECTION: RUN SUMMARY ──
  lines.push("=== BACKTEST REPORT ===");
  lines.push("");
  lines.push(row("Field", "Value"));
  lines.push(row("Run ID", run.id));
  lines.push(row("Coin", run.coin));
  lines.push(row("Strategy", run.strategyName));
  lines.push(row("Strategy Type", run.strategyType));
  lines.push(row("Start Date", run.startDate));
  lines.push(row("End Date", run.endDate));
  lines.push(row("Initial Capital ($)", run.initialCapital.toFixed(2)));
  lines.push(row("Final Equity ($)", run.finalEquity.toFixed(2)));
  const roiPct = run.initialCapital > 0 ? ((run.finalEquity - run.initialCapital) / run.initialCapital) * 100 : 0;
  lines.push(row("ROI (%)", roiPct.toFixed(2)));
  lines.push(row("Duration (s)", run.duration != null ? (run.duration / 1000).toFixed(2) : ""));
  lines.push(row("Status", run.status));
  lines.push(row("Created At", run.createdAt));
  lines.push(row("Maker Fee (%)", run.makerFee != null ? (run.makerFee * 100).toFixed(3) : ""));
  lines.push(row("Slippage (%)", run.slippage != null ? (run.slippage * 100).toFixed(3) : ""));

  // Strategy config dump
  lines.push("");
  lines.push("--- Strategy Config ---");
  for (const [k, v] of Object.entries(run.strategyConfig || {})) {
    lines.push(row(k, typeof v === "object" ? JSON.stringify(v) : v));
  }

  // ── SECTION: CORE METRICS ──
  lines.push("");
  lines.push("=== CORE METRICS ===");
  lines.push("");
  lines.push(row("Metric", "Value"));
  lines.push(row("Total Trades", run.totalTrades));
  lines.push(row("Wins", run.winTrades));
  lines.push(row("Losses", run.lossTrades));
  lines.push(row("Win Rate (%)", run.winRate.toFixed(2)));
  lines.push(row("Gross PnL ($)", run.grossPnl != null ? run.grossPnl.toFixed(2) : ""));
  lines.push(row("Net PnL ($)", run.totalPnl.toFixed(2)));
  lines.push(row("Total Fees ($)", run.totalFees != null ? run.totalFees.toFixed(2) : ""));
  lines.push(row("Max Drawdown ($)", run.maxDrawdown.toFixed(2)));
  lines.push(row("Sharpe Ratio", run.sharpeRatio.toFixed(3)));
  lines.push(row("Profit Factor", isFinite(run.profitFactor) ? run.profitFactor.toFixed(3) : "Inf"));
  lines.push(row("Avg Win ($)", run.avgWin.toFixed(2)));
  lines.push(row("Avg Loss ($)", run.avgLoss.toFixed(2)));
  lines.push(row("Best Trade ($)", run.bestTrade.toFixed(2)));
  lines.push(row("Worst Trade ($)", run.worstTrade.toFixed(2)));

  // ── SECTION: EXTENDED METRICS ──
  if (ext && Object.keys(ext).length > 0) {
    lines.push("");
    lines.push("=== EXTENDED METRICS ===");
    lines.push("");
    lines.push(row("Metric", "Value"));
    if (ext.peakEquity != null) lines.push(row("Peak Equity ($)", ext.peakEquity.toFixed(2)));
    if (ext.lowestEquity != null) lines.push(row("Lowest Equity ($)", ext.lowestEquity.toFixed(2)));
    if (ext.maxDrawdownPercent != null)
      lines.push(row("Max DD (% peak→trough)", ext.maxDrawdownPercent.toFixed(2)));
    if (ext.equityBlowoutCount != null)
      lines.push(row("Account Blowouts (equity ≤1% of initial)", ext.equityBlowoutCount));
    if (ext.equityDoubleCount != null)
      lines.push(row("Account Doubled (equity ≥2× initial)", ext.equityDoubleCount));
    if (ext.tradeBlowoutCount != null)
      lines.push(row("Trades, 100% capital loss", ext.tradeBlowoutCount));
    if (ext.tradeDoubleCount != null)
      lines.push(row("Trades, 100% capital gain", ext.tradeDoubleCount));
    if (ext.avgDaysWinning != null)
      lines.push(row("Avg Days (Winning Trade)", ext.avgDaysWinning.toFixed(2)));
    if (ext.avgDaysLosing != null)
      lines.push(row("Avg Days (Losing Trade)", ext.avgDaysLosing.toFixed(2)));
    if (ext.mddRecoveryDays != null)
      lines.push(row("MDD Recovery (days)", ext.mddRecoveryDays));
  }

  // ── SECTION: TOP WINNERS ──
  const wins = ext?.largestWinTrades ?? [];
  if (wins.length > 0) {
    lines.push("");
    lines.push("=== TOP WINNING TRADES ===");
    lines.push("");
    lines.push(row("#", "Entry Time", "Exit Time", "Side", "PnL ($)"));
    wins.forEach((t, i) => {
      lines.push(row(i + 1, formatTime(t.entry_time), formatTime(t.exit_time), t.side ?? "", (t.pnl ?? 0).toFixed(2)));
    });
  }

  // ── SECTION: TOP LOSERS ──
  const losses = ext?.largestLossTrades ?? [];
  if (losses.length > 0) {
    lines.push("");
    lines.push("=== TOP LOSING TRADES ===");
    lines.push("");
    lines.push(row("#", "Entry Time", "Exit Time", "Side", "PnL ($)"));
    losses.forEach((t, i) => {
      lines.push(row(i + 1, formatTime(t.entry_time), formatTime(t.exit_time), t.side ?? "", (t.pnl ?? 0).toFixed(2)));
    });
  }

  // ── SECTION: ALL TRADES ──
  lines.push("");
  lines.push(`=== ALL TRADES (${trades.length}) ===`);
  lines.push("");
  lines.push(
    row(
      "#",
      "Entry Time",
      "Entry Price",
      "Qty",
      "Side",
      "Leverage",
      "SL",
      "TP",
      "Exit Time",
      "Exit Price",
      "PnL",
      "Fee",
      "Exit Reason",
    ),
  );
  trades.forEach((t, i) => {
    lines.push(
      row(
        i + 1,
        t.entryTime,
        t.entryPrice.toFixed(2),
        t.qty.toFixed(6),
        t.side,
        t.leverage,
        t.sl?.toFixed(2) ?? "",
        t.tp?.toFixed(2) ?? "",
        t.exitTime ?? "",
        t.exitPrice?.toFixed(2) ?? "",
        t.pnl.toFixed(2),
        t.fee.toFixed(4),
        t.exitReason ?? "",
      ),
    );
  });

  // Prefix BOM so Excel opens UTF-8 correctly.
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeCoin = run.coin.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const safeStrat = run.strategyName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.download = `backtest-report-${safeCoin}-${safeStrat}-${run.id.slice(0, 8)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
