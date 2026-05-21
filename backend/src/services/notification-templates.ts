/**
 * Notification templates — content + presentation for all 3 channels.
 *
 * Each builder returns a `NotificationContent` triple:
 *   • `title`   — short headline (works in-app navbar + as push notif title)
 *   • `message` — single-line summary (in-app body + push body)
 *   • `telegramHtml` — multi-line rich HTML (Telegram only)
 *
 * Why a single builder per type instead of 3 separate ones: keeps the
 * content for all 3 channels in sync. Adding a field (e.g. new "qty"
 * column) happens once. The in-app dropdown and the push notification on
 * a locked iPhone show the same information density — just rendered for
 * their respective surface.
 *
 * Conventions:
 *   • Titles use a single leading emoji per type so they're glanceable on
 *     a push notification (no icon support there). The in-app panel has
 *     its own colored icon per type, so emoji is mildly redundant in-app
 *     but harmless.
 *   • Messages prefer the · separator instead of newlines — push and
 *     navbar both compress whitespace, so · gives a clean inline grouping.
 *   • All free-form fields are HTML-escaped in the telegramHtml output.
 *     Title and message are plain text, so no escaping needed there.
 */

export interface NotificationContent {
  title: string;
  message: string;
  telegramHtml: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, (ch) => (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&amp;"));
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
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

function alignedBlock(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  return rows.map(([k, v]) => `${k.padEnd(width)} ${escapeHtml(v)}`).join("\n");
}

function htmlTemplate(header: string, blockRows: Array<[string, string]>, footer?: string): string {
  const block = `<pre>${alignedBlock(blockRows)}</pre>`;
  return [header, "", block, footer ? "" : null, footer ? `<i>${escapeHtml(footer)}</i>` : null]
    .filter((s) => s !== null)
    .join("\n");
}

/** Strip USDT/USD/USDC quote currency for compact display. AVAX/USDT → AVAX. */
function basePair(pair: string): string {
  return pair.split("/")[0];
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

export function buildStrategyDeployedNotification(d: StrategyDeployedData): NotificationContent {
  return {
    title: `🚀 Strategy deployed`,
    message: `${d.strategyName} · ${d.pair} · $${d.capital.toFixed(2)} @ ${d.leverage}x leverage`,
    telegramHtml: htmlTemplate(
      `🚀 <b>Strategy Deployed</b>`,
      [
        ["Strategy", d.strategyName],
        ["Pair", d.pair],
        ["Capital", `$${d.capital.toFixed(2)}`],
        ["Leverage", `${d.leverage}x`],
        ["Mode", d.mode],
      ],
      "Strategy is now scanning the market. You'll be notified when the first trade fires.",
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 2. Trade Opened — LONG / SHORT
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

export function buildTradeOpenedNotification(d: TradeOpenedData): NotificationContent {
  const isLong = d.side === "BUY";
  const sideLabel = isLong ? "LONG" : "SHORT";
  const sideEmoji = isLong ? "📈" : "📉";

  // Short message — uses · separators for compact rendering in navbar +
  // mobile push. Skips SL/TP if they weren't passed (legacy strategies).
  const parts = [
    d.strategyName,
    `Entry ${formatPrice(d.entry)}`,
  ];
  if (d.sl != null && Number.isFinite(d.sl)) parts.push(`SL ${formatPrice(d.sl)}`);
  if (d.tp != null && Number.isFinite(d.tp)) parts.push(`TP ${formatPrice(d.tp)}`);
  parts.push(`${d.leverage}x`);

  const title = `${sideEmoji} ${sideLabel} opened · ${d.pair}`;
  const message = parts.join(" · ");

  // Telegram rich block
  const header = isLong
    ? `📈 <b>LONG Opened</b>  •  ${escapeHtml(d.pair)}`
    : `📉 <b>SHORT Opened</b>  •  ${escapeHtml(d.pair)}`;
  const rows: Array<[string, string]> = [
    ["Strategy", d.strategyName],
    ["Entry", formatPrice(d.entry)],
    ["Quantity", `${formatQty(d.quantity)} ${basePair(d.pair)}`],
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
  const triggerLine = `<i>Trigger:  ${escapeHtml(d.trigger)}</i>`;
  const telegramHtml = [header, "", block, "", triggerLine].join("\n");

  return { title, message, telegramHtml };
}

// ─────────────────────────────────────────────────────────────────────
// 3. Trade Closed — TP / SL / Strategy exit
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

export function buildTradeClosedNotification(d: TradeClosedData): NotificationContent {
  const flavor = pickTradeClosedFlavor(d.reason);
  const sideLabel = d.side === "BUY" ? "LONG" : "SHORT";

  // Title surfaces the *event* (TP hit / SL hit / Closed) — the in-app
  // panel renders a PnL badge separately so we keep PnL out of the title
  // to avoid duplication. On mobile push the message picks up the slack.
  const titleEmoji = flavor === "tp" ? "✅" : flavor === "sl" ? "🛑" : "🔄";
  const titleVerb =
    flavor === "tp" ? "Take Profit" : flavor === "sl" ? "Stop Loss" : "Closed";
  const title = `${titleEmoji} ${titleVerb} · ${d.pair}`;

  // Message: strategy · SIDE pnl (pct) · held [· reason for strategy-exit]
  const parts = [
    d.strategyName,
    `${sideLabel} ${formatPnl(d.pnl)} (${formatPct(d.pnlPct)})`,
    `Held ${formatDuration(d.heldMs)}`,
  ];
  if (flavor === "other") parts.push(d.reason);
  const message = parts.join(" · ");

  const header =
    flavor === "tp"
      ? `✅ <b>Take Profit Hit</b>  •  ${escapeHtml(d.pair)}`
      : flavor === "sl"
        ? `🛑 <b>Stop Loss Hit</b>  •  ${escapeHtml(d.pair)}`
        : `🔄 <b>Position Closed</b>  •  ${escapeHtml(d.pair)}`;
  const rows: Array<[string, string]> = [
    ["Strategy", d.strategyName],
    ["Side", sideLabel],
    ["Entry", formatPrice(d.entry)],
    ["Exit", formatPrice(d.exit)],
    ["P&L", `${formatPnl(d.pnl)}   (${formatPct(d.pnlPct)})`],
    ["Held", formatDuration(d.heldMs)],
  ];
  if (flavor === "other") rows.push(["Reason", d.reason]);
  const telegramHtml = htmlTemplate(header, rows);

  return { title, message, telegramHtml };
}

// ─────────────────────────────────────────────────────────────────────
// 4. Order Failed
// ─────────────────────────────────────────────────────────────────────
export interface TradeErrorData {
  strategyName: string;
  pair: string;
  side: "BUY" | "SELL";
  error: string;
}

export function buildTradeErrorNotification(d: TradeErrorData): NotificationContent {
  // Truncate error to keep the in-app row visually tidy. Full text still
  // available via the Tap-to-read modal that reads notification.message.
  const errShort = d.error.length > 80 ? `${d.error.slice(0, 77)}…` : d.error;
  return {
    title: `⚠️ Order failed · ${d.pair}`,
    message: `${d.strategyName} · ${d.side} · ${errShort}`,
    telegramHtml: htmlTemplate(
      `⚠️ <b>Order Failed</b>  •  ${escapeHtml(d.pair)}`,
      [
        ["Strategy", d.strategyName],
        ["Side", d.side],
        ["Error", d.error],
      ],
      "Strategy continues running. The next signal will be attempted normally.",
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 5. Margin Call — insufficient capital
// ─────────────────────────────────────────────────────────────────────
export interface MarginCallData {
  strategyName: string;
  pair: string;
  attemptedMargin: number;
  minMargin: number;
}

export function buildMarginCallNotification(d: MarginCallData): NotificationContent {
  return {
    title: `⚠️ Need more capital`,
    message: `${d.strategyName} on ${d.pair} · attempted $${d.attemptedMargin.toFixed(2)} · need $${d.minMargin.toFixed(0)}+ per trade`,
    telegramHtml: htmlTemplate(
      `⚠️ <b>Insufficient Capital</b>`,
      [
        ["Strategy", d.strategyName],
        ["Pair", d.pair],
        ["Attempted", `$${d.attemptedMargin.toFixed(2)}`],
        ["Minimum", `$${d.minMargin.toFixed(2)}`],
      ],
      "Add more capital to your deployed strategy to resume trading.",
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 6. Strategy Paused
// ─────────────────────────────────────────────────────────────────────
export interface StrategyPausedData {
  strategyName: string;
  pair: string;
  closedCount: number;
  closedPnl: number;
}

export function buildStrategyPausedNotification(d: StrategyPausedData): NotificationContent {
  return {
    title: `⏸ Paused · ${d.strategyName}`,
    message: `${d.pair} · ${d.closedCount} closed · realized ${formatPnl(d.closedPnl)}`,
    telegramHtml: htmlTemplate(
      `⏸️ <b>Strategy Paused</b>  •  ${escapeHtml(d.pair)}`,
      [
        ["Strategy", d.strategyName],
        ["Positions", `${d.closedCount} closed`],
        ["Realized P&L", `${formatPnl(d.closedPnl)}`],
      ],
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 7. Strategy Resumed
// ─────────────────────────────────────────────────────────────────────
export interface StrategyResumedData {
  strategyName: string;
  pair: string;
}

export function buildStrategyResumedNotification(d: StrategyResumedData): NotificationContent {
  return {
    title: `▶️ Resumed · ${d.strategyName}`,
    message: `${d.pair} · scanning the market again`,
    telegramHtml: htmlTemplate(
      `▶️ <b>Strategy Resumed</b>  •  ${escapeHtml(d.pair)}`,
      [
        ["Strategy", d.strategyName],
        ["Status", "Active"],
      ],
      "Strategy is scanning the market again. You'll be notified on the next signal.",
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 8. Strategy Stopped
// ─────────────────────────────────────────────────────────────────────
export interface StrategyStoppedData {
  strategyName: string;
  pair: string;
  reason: string;
  closedCount: number;
  closedPnl: number;
}

export function buildStrategyStoppedNotification(d: StrategyStoppedData): NotificationContent {
  return {
    title: `⏹ Stopped · ${d.strategyName}`,
    message: `${d.pair} · ${d.reason} · ${d.closedCount} closed · ${formatPnl(d.closedPnl)}`,
    telegramHtml: htmlTemplate(
      `⏹️ <b>Strategy Stopped</b>  •  ${escapeHtml(d.pair)}`,
      [
        ["Strategy", d.strategyName],
        ["Reason", d.reason],
        ["Positions", `${d.closedCount} closed`],
        ["Realized P&L", `${formatPnl(d.closedPnl)}`],
      ],
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 9. Admin Broadcast — title/body come from the admin form verbatim
// ─────────────────────────────────────────────────────────────────────
export interface AdminBroadcastData {
  title: string;
  body: string;
}

export function buildAdminBroadcastNotification(d: AdminBroadcastData): NotificationContent {
  return {
    title: d.title,
    message: d.body,
    telegramHtml: [
      `📢 <b>AlgoPulse Announcement</b>`,
      "",
      `<b>${escapeHtml(d.title)}</b>`,
      "",
      escapeHtml(d.body),
      "",
      `<i>— AlgoPulse Team</i>`,
    ].join("\n"),
  };
}
