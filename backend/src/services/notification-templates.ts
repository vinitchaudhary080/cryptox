/**
 * Telegram message templates — HTML parse_mode.
 *
 * Each builder returns the full HTML body shown in Telegram. Layout:
 *   • Bold header with one informative emoji
 *   • Monospace `<pre>` block with aligned key/value rows (numbers line up
 *     on both mobile + desktop Telegram clients)
 *   • Optional italic footer with context
 *
 * Conventions used by the alignment helpers:
 *   • Labels are left-padded to a fixed width per template — pickWidth()
 *     returns the longest label length so columns are guaranteed flush.
 *   • Numbers use Intl.NumberFormat or toFixed() — never raw `String(n)`.
 *   • All free-form fields (strategyName, reason, error) pass through
 *     escapeHtml() so a stray `<`, `>`, or `&` doesn't break parse.
 */

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, (ch) => (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&amp;"));
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // < $1 → 5 decimals, < $100 → 4, otherwise 2
  const decimals = Math.abs(n) < 1 ? 5 : Math.abs(n) < 100 ? 4 : 2;
  return `$${n.toFixed(decimals)}`;
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(6).replace(/\.?0+$/, "");
}

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "−";
  const abs = Math.abs(pnl);
  const decimals = abs < 10 ? 4 : 2;
  return `${sign}$${abs.toFixed(decimals)}`;
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${s}s`;
}

/**
 * Build an aligned key-value block. The widest label in the input defines
 * the column width so values are flush regardless of label length variety.
 */
function alignedBlock(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  return rows.map(([k, v]) => `${k.padEnd(width)} ${escapeHtml(v)}`).join("\n");
}

function joinTemplate(header: string, blockRows: Array<[string, string]>, footer?: string): string {
  const block = `<pre>${alignedBlock(blockRows)}</pre>`;
  return [header, "", block, footer ? "" : null, footer ? `<i>${escapeHtml(footer)}</i>` : null]
    .filter((s) => s !== null)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// 1. Strategy Deployed
// ─────────────────────────────────────────────────────────────────────
export interface StrategyDeployedData {
  strategyName: string;
  pair: string;
  capital: number;
  leverage: number;
  mode: "Live" | "Paper";
}

export function buildStrategyDeployedTemplate(d: StrategyDeployedData): string {
  return joinTemplate(
    `🚀 <b>Strategy Deployed</b>`,
    [
      ["Strategy", d.strategyName],
      ["Pair", d.pair],
      ["Capital", `$${d.capital.toFixed(2)}`],
      ["Leverage", `${d.leverage}x`],
      ["Mode", d.mode],
    ],
    "Strategy is now scanning the market. You'll be notified when the first trade fires.",
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2 & 3. Trade Opened — LONG / SHORT
// ─────────────────────────────────────────────────────────────────────
export interface TradeOpenedData {
  side: "BUY" | "SELL";
  strategyName: string;
  pair: string;
  entry: number;
  quantity: number;
  sl?: number | null;
  tp?: number | null;
  leverage: number;
  trigger: string;
}

export function buildTradeOpenedTemplate(d: TradeOpenedData): string {
  const isLong = d.side === "BUY";
  const header = isLong
    ? `📈 <b>LONG Opened</b>  •  ${escapeHtml(d.pair)}`
    : `📉 <b>SHORT Opened</b>  •  ${escapeHtml(d.pair)}`;

  const rows: Array<[string, string]> = [
    ["Strategy", d.strategyName],
    ["Entry", formatPrice(d.entry)],
    ["Quantity", `${formatQty(d.quantity)} ${d.pair.split("/")[0]}`],
  ];

  if (d.sl != null && Number.isFinite(d.sl)) {
    const slPct = ((d.sl - d.entry) / d.entry) * 100;
    rows.push(["Stop Loss", `${formatPrice(d.sl)}   (${formatPct(slPct)})`]);
  }
  if (d.tp != null && Number.isFinite(d.tp)) {
    const tpPct = ((d.tp - d.entry) / d.entry) * 100;
    rows.push(["Take Profit", `${formatPrice(d.tp)}   (${formatPct(tpPct)})`]);
  }
  rows.push(["Leverage", `${d.leverage}x`]);

  const block = `<pre>${alignedBlock(rows)}</pre>`;
  const trigger = `<i>Trigger:  ${escapeHtml(d.trigger)}</i>`;
  return [header, "", block, "", trigger].join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// 4, 5, 6. Trade Closed — TP / SL / Strategy exit
// ─────────────────────────────────────────────────────────────────────
export interface TradeClosedData {
  strategyName: string;
  pair: string;
  side: "BUY" | "SELL";
  entry: number;
  exit: number;
  pnl: number;
  pnlPct: number;
  heldMs: number;
  reason: string;
}

export function pickTradeClosedFlavor(reason: string): "tp" | "sl" | "other" {
  const r = reason.toLowerCase();
  if (r.includes("take profit") || r.includes("tp hit") || r.startsWith("tp ")) return "tp";
  if (r.includes("stop loss") || r.includes("sl hit") || r.startsWith("sl ")) return "sl";
  return "other";
}

export function buildTradeClosedTemplate(d: TradeClosedData): string {
  const flavor = pickTradeClosedFlavor(d.reason);
  const header =
    flavor === "tp"
      ? `✅ <b>Take Profit Hit</b>  •  ${escapeHtml(d.pair)}`
      : flavor === "sl"
        ? `🛑 <b>Stop Loss Hit</b>  •  ${escapeHtml(d.pair)}`
        : `🔄 <b>Position Closed</b>  •  ${escapeHtml(d.pair)}`;

  const sideLabel = d.side === "BUY" ? "LONG" : "SHORT";
  const rows: Array<[string, string]> = [
    ["Strategy", d.strategyName],
    ["Side", sideLabel],
    ["Entry", formatPrice(d.entry)],
    ["Exit", formatPrice(d.exit)],
    ["P&L", `${formatPnl(d.pnl)}   (${formatPct(d.pnlPct)})`],
    ["Held", formatDuration(d.heldMs)],
  ];

  if (flavor === "other") {
    rows.push(["Reason", d.reason]);
  }

  return joinTemplate(header, rows);
}

// ─────────────────────────────────────────────────────────────────────
// 7. Order Failed
// ─────────────────────────────────────────────────────────────────────
export interface TradeErrorData {
  strategyName: string;
  pair: string;
  side: "BUY" | "SELL";
  error: string;
}

export function buildTradeErrorTemplate(d: TradeErrorData): string {
  return joinTemplate(
    `⚠️ <b>Order Failed</b>  •  ${escapeHtml(d.pair)}`,
    [
      ["Strategy", d.strategyName],
      ["Side", d.side],
      ["Error", d.error],
    ],
    "Strategy continues running. The next signal will be attempted normally.",
  );
}

// ─────────────────────────────────────────────────────────────────────
// 8. Insufficient Capital (margin call)
// ─────────────────────────────────────────────────────────────────────
export interface MarginCallData {
  strategyName: string;
  pair: string;
  attemptedMargin: number;
  minMargin: number;
}

export function buildMarginCallTemplate(d: MarginCallData): string {
  return joinTemplate(
    `⚠️ <b>Insufficient Capital</b>`,
    [
      ["Strategy", d.strategyName],
      ["Pair", d.pair],
      ["Attempted", `$${d.attemptedMargin.toFixed(2)}`],
      ["Minimum", `$${d.minMargin.toFixed(2)}`],
    ],
    "Add more capital to your deployed strategy to resume trading.",
  );
}

// ─────────────────────────────────────────────────────────────────────
// 9. Strategy Paused
// ─────────────────────────────────────────────────────────────────────
export interface StrategyPausedData {
  strategyName: string;
  pair: string;
  closedCount: number;
  closedPnl: number;
}

export function buildStrategyPausedTemplate(d: StrategyPausedData): string {
  return joinTemplate(
    `⏸️ <b>Strategy Paused</b>  •  ${escapeHtml(d.pair)}`,
    [
      ["Strategy", d.strategyName],
      ["Positions", `${d.closedCount} closed`],
      ["Realized P&L", `${formatPnl(d.closedPnl)}`],
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────
// 10. Strategy Resumed
// ─────────────────────────────────────────────────────────────────────
export interface StrategyResumedData {
  strategyName: string;
  pair: string;
}

export function buildStrategyResumedTemplate(d: StrategyResumedData): string {
  return joinTemplate(
    `▶️ <b>Strategy Resumed</b>  •  ${escapeHtml(d.pair)}`,
    [
      ["Strategy", d.strategyName],
      ["Status", "Active"],
    ],
    "Strategy is scanning the market again. You'll be notified on the next signal.",
  );
}

// ─────────────────────────────────────────────────────────────────────
// 11. Strategy Stopped
// ─────────────────────────────────────────────────────────────────────
export interface StrategyStoppedData {
  strategyName: string;
  pair: string;
  reason: string;
  closedCount: number;
  closedPnl: number;
}

export function buildStrategyStoppedTemplate(d: StrategyStoppedData): string {
  return joinTemplate(
    `⏹️ <b>Strategy Stopped</b>  •  ${escapeHtml(d.pair)}`,
    [
      ["Strategy", d.strategyName],
      ["Reason", d.reason],
      ["Positions", `${d.closedCount} closed`],
      ["Realized P&L", `${formatPnl(d.closedPnl)}`],
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────
// 12. Admin Broadcast
// ─────────────────────────────────────────────────────────────────────
export interface AdminBroadcastData {
  title: string;
  body: string;
}

export function buildAdminBroadcastTemplate(d: AdminBroadcastData): string {
  return [
    `📢 <b>AlgoPulse Announcement</b>`,
    "",
    `<b>${escapeHtml(d.title)}</b>`,
    "",
    escapeHtml(d.body),
    "",
    `<i>— AlgoPulse Team</i>`,
  ].join("\n");
}
