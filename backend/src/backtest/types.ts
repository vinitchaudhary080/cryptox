// ── Candle & CSV Types ──────────────────────────────────────────

export interface Candle {
  timestamp: number;  // unix ms
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm:ss
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Optional order-flow / futures extras (populated by the futures-extras
  // backfill from Binance futures klines + funding/OI endpoints; merged
  // into Candle by loadCandles when {COIN}_1m_extras.csv is present).
  // Indicators that require these fields must check for undefined.
  delta?: number;     // 2 × taker_buy_base − volume (per 1m kline)
  oi?: number;        // open interest snapshot at bar close (5m granularity, ffill)
  funding?: number;   // funding rate (8h cadence, ffill)
}

// ── Indicator Types ─────────────────────────────────────────────

export interface IndicatorConfig {
  name: string;       // "RSI", "EMA", "SMA", "MACD", "BB", "VWAP"
  period?: number;
  params?: Record<string, number>;
}

export interface IndicatorValues {
  rsi?: number[];
  ema?: Record<number, number[]>;   // keyed by period
  sma?: Record<number, number[]>;
  macd?: { macd: number[]; signal: number[]; histogram: number[] };
  bb?: { upper: number[]; middle: number[]; lower: number[] };
  vwap?: number[];
  adx?: number[];
  supertrend?: { value: number[]; direction: number[] };
}

// ── Strategy Types ──────────────────────────────────────────────

export type SignalAction = "BUY" | "SELL" | "CLOSE_LONG" | "CLOSE_SHORT" | "CLOSE_ALL";

/** A single take-profit level for multi-TP partial-close strategies.
 *  `portion` is the FRACTION of the original position qty to close when
 *  this level is hit (0 < portion ≤ 1). The sum of portions across all
 *  TPs in `Signal.tps` must be ≤ 1.0; remaining qty trails to SL or END.
 */
export interface TpLevel {
  price: number;
  portion: number;
}

export interface Signal {
  action: SignalAction;
  qty?: number;
  sl?: number;
  /** Single-TP shortcut. Equivalent to tps:[{price: tp, portion: 1}]. */
  tp?: number;
  /**
   * Multi-TP ladder (mutually exclusive with `tp`). When provided, the
   * engine partially closes `portion × originalQty` at each level in order.
   * Levels MUST be ordered in the trade direction (long: ascending; short:
   * descending). The engine ignores `tp` if `tps` is set.
   */
  tps?: TpLevel[];
  leverage?: number;
  reason?: string;
  /**
   * Optional explicit execution price. Multi-timeframe strategies make
   * decisions off the just-closed HTF bar (e.g., the 5m or 15m close)
   * but the engine iterates at 1m granularity. Without this field the
   * engine falls back to the current 1m candle close, which drifts from
   * the HTF close users see on their charts. Strategies that care about
   * matching chart prices should set this to the HTF bar's close.
   */
  entryPrice?: number;
}

export interface CandleContext {
  candle: Candle;
  index: number;
  indicators: IndicatorValues;
  positions: Position[];
  equity: number;
  config: Record<string, number | string>;
}

export interface BacktestStrategy {
  name: string;
  description: string;
  defaultConfig: Record<string, number | string>;
  requiredIndicators: IndicatorConfig[];
  onCandle(ctx: CandleContext): Signal[];
}

// ── UI Rule Types ───────────────────────────────────────────────

export type Operator = "<" | ">" | "<=" | ">=" | "==" | "crosses_above" | "crosses_below";

export interface RuleCondition {
  indicator: string;
  period?: number;
  key?: string;         // for MACD: "macd", "signal", "histogram"; for BB: "upper", "lower"
  operator: Operator;
  value: number;
}

export interface EntryRule {
  conditions: RuleCondition[];    // AND logic within a rule
  logic?: "AND" | "OR";
  action: "BUY" | "SELL";
  sl_percent: number;
  tp_percent: number;
  position_size_percent: number;
  leverage: number;
}

export interface ExitRule {
  conditions: RuleCondition[];
  close_side: "BUY" | "SELL" | "ALL";
}

export interface UIStrategyConfig {
  entry_rules: EntryRule[];
  exit_rules: ExitRule[];
}

// ── Position & Trade Types ──────────────────────────────────────

export interface Position {
  id: string;
  entryTime: number;
  entryPrice: number;
  qty: number;
  /** Original qty at the time the position was opened. Stays constant as
   *  partial closes shrink `qty`. Used to compute multi-TP portions.
   *  Optional for cross-version compatibility: older PositionManager code
   *  on production constructs Position objects without this field — the
   *  multi-TP code paths gracefully degrade to single-TP when undefined. */
  originalQty?: number;
  side: "BUY" | "SELL";
  leverage: number;
  sl: number | null;
  tp: number | null;
  /** Remaining (price, portion) levels not yet hit, in trigger order.
   *  Optional for the same compatibility reason as `originalQty`. */
  tps?: TpLevel[];
}

export interface BacktestTrade {
  entry_id: string;
  entry_time: number;
  entry_price: number;
  qty: number;
  side: "BUY" | "SELL";
  leverage: number;
  sl: number | null;
  tp: number | null;
  exit_id: string;
  exit_time: number;
  exit_price: number;
  pnl: number;
  fee: number;
  // Either a canonical bucket (TP/SL/END/MARGIN_CALL/LIQUIDATED) used by
  // metric filters, OR a free-form reason string emitted by the strategy
  // when it issues a CLOSE_LONG/SHORT/ALL signal (e.g. "5m ST flipped
  // RED (ADX 25.6)" or "ADX fading 18.4 < 20"). The string variant lets
  // the trade log surface WHY the strategy chose to exit rather than the
  // generic "SIGNAL" label.
  exit_reason:
    | "TP"
    | "SL"
    | "SIGNAL"
    | "END"
    | "MARGIN_CALL"
    | "LIQUIDATED"
    | string;
  /** For multi-TP positions: 1 = first TP, 2 = second, etc. Undefined for
   *  single-TP / SL / SIGNAL exits. */
  tp_level?: number;
  /** True when this trade row is a partial close (the position still had
   *  qty remaining when this leg fired). Helps the trade-log UI group legs
   *  by `entry_id`. */
  partial?: boolean;
  /**
   * CLOSED     = actual round-trip trade
   * MARGIN_CALL = trade attempt skipped because per-trade margin (qty × entry)
   *               was below the $50 platform minimum — surfaced in the report
   *               as a BLOWOUT event (the account couldn't sustain the trade)
   */
  status: "CLOSED" | "MARGIN_CALL";
  /** Required margin at the time of the skipped attempt — only set for MARGIN_CALL */
  attempted_margin?: number;
  /** Account equity at the moment of the margin-call skip — only set for MARGIN_CALL */
  equity_at_call?: number;
}

/** Platform-wide minimum margin per trade (USD). */
export const MIN_MARGIN_USD = 50;

// ── Backtest Config & Result Types ──────────────────────────────

/**
 * TradingView-style sizing modes. These are the three ways a backtest can
 * determine per-trade position size — strategies' own sizing math is
 * overridden by the engine once a mode is active.
 *
 *   contracts        — Every trade uses exactly `sizingValue` units of the
 *                      base asset (e.g., 0.01 BTC). Notional scales with price.
 *
 *   fixed_cash       — Every trade deploys exactly `sizingValue` dollars of
 *                      margin. qty = sizingValue / price.
 *
 *   percent_equity   — Every trade uses `sizingValue`% of current equity.
 *                      Profits compound into subsequent trades.
 */
export type SizingMode = "contracts" | "fixed_cash" | "percent_equity";

export interface BacktestConfig {
  coin: string;
  startDate: string;   // ISO date
  endDate: string;     // ISO date
  strategyType: "code" | "ui";
  strategyName: string;
  strategyConfig: Record<string, unknown>;
  initialCapital: number;
  makerFee?: number;    // default 0.0005 (0.05%)
  slippage?: number;    // default 0.0001 (0.01%)
  /** Optional. If set, engine overrides strategy-provided qty on every entry. */
  sizingMode?: SizingMode;
  /**
   * Numeric parameter for the sizing mode:
   *   contracts       → raw quantity (e.g., 0.001)
   *   fixed_cash      → dollars (e.g., 50)
   *   percent_equity  → percentage 1-100 (e.g., 50)
   */
  sizingValue?: number;
  /**
   * When true (default), any trade whose per-trade margin (qty × price) is
   * below MIN_MARGIN_USD is skipped as MARGIN_CALL. Set false to disable
   * the floor entirely (no MARGIN_CALL rows will be produced).
   */
  enforceMinMargin?: boolean;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface DrawdownPoint {
  time: number;
  drawdownPct: number;
}

export interface CumulativePnlPoint {
  time: number;
  pnl: number;
}

export interface TopTrade {
  entry_time: number;
  exit_time: number;
  side: "BUY" | "SELL";
  entry_price: number;
  exit_price: number;
  pnl: number;
  exit_reason: string;
}

export interface BacktestMetrics {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalPnl: number;       // net PnL (after fees)
  grossPnl: number;       // PnL before fees
  totalFees: number;      // total commission + slippage cost
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  avgTradeDuration: number;  // in minutes
  // ── New metrics ───────────────────────────────────────────────
  largestWinTrades: TopTrade[];         // top 5 winning trades by PnL
  largestLossTrades: TopTrade[];        // top 5 losing trades by PnL (most negative)
  avgBarsWinning: number;               // avg candle count of winning trades (legacy)
  avgBarsLosing: number;                // avg candle count of losing trades (legacy)
  avgDaysWinning: number;               // avg duration (in days) of winning trades
  avgDaysLosing: number;                // avg duration (in days) of losing trades
  drawdownCurve: DrawdownPoint[];       // full drawdown % timeseries
  cumulativePnlCurve: CumulativePnlPoint[];  // running total PnL timeseries
  mddRecoveryDays: number;             // max drawdown recovery period in days
  // ── Blowout / double counters ────────────────────────────────
  tradeBlowoutCount: number;           // trades that lost ≥100% of deployed capital
  tradeDoubleCount: number;            // trades that gained ≥100% of deployed capital
  equityBlowoutCount: number;          // times total equity crossed below 1% of initial
  equityDoubleCount: number;           // times total equity crossed above 2× initial
  peakEquity: number;                  // highest equity reached during backtest
  lowestEquity: number;                // lowest equity reached during backtest
  // ── Margin-call / blowout counters ────────────────────────────
  marginCallCount: number;             // trades skipped because margin < $50
  // Optional fields below — older metrics.ts on production doesn't
  // populate these; making them optional avoids forcing the entire
  // engine to be re-deployed alongside types.ts changes.
  /** Cumulative dollars user would have had to top up (to the $50 floor) to keep trading. */
  marginCallTopUpTo50Total?: number;
  /** Cumulative dollars user would have had to top up (back to initial capital) after each blowout. */
  marginCallTopUpToInitialTotal?: number;
  /** Lowest equity observed at the moment of any margin-call skip. */
  marginCallLowestEquity?: number;
  // ── Liquidation counter ───────────────────────────────────────
  liquidationCount?: number;            // positions force-closed by leverage liquidation
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  finalEquity: number;
  duration: number;  // ms
}

// ── Coin Config ─────────────────────────────────────────────────

export interface CoinConfig {
  symbol: string;     // CCXT format: "BTC/USD:USD"
  short: string;      // "BTC"
  name: string;       // "Bitcoin"
}

export const BACKTEST_COINS: CoinConfig[] = [
  { symbol: "BTC/USD:USD", short: "BTC", name: "Bitcoin" },
  { symbol: "ETH/USD:USD", short: "ETH", name: "Ethereum" },
  { symbol: "SOL/USD:USD", short: "SOL", name: "Solana" },
  { symbol: "XRP/USD:USD", short: "XRP", name: "XRP" },
  { symbol: "DOGE/USD:USD", short: "DOGE", name: "Dogecoin" },
  { symbol: "ADA/USD:USD", short: "ADA", name: "Cardano" },
  { symbol: "DOT/USD:USD", short: "DOT", name: "Polkadot" },
  { symbol: "SUI/USD:USD", short: "SUI", name: "Sui" },
  { symbol: "LINK/USD:USD", short: "LINK", name: "Chainlink" },
  { symbol: "AVAX/USD:USD", short: "AVAX", name: "Avalanche" },
  { symbol: "BNB/USD:USD", short: "BNB", name: "BNB" },
  { symbol: "PAXG/USD:USD", short: "PAXG", name: "PAX Gold" },
  { symbol: "LTC/USD:USD", short: "LTC", name: "Litecoin" },
  { symbol: "UNI/USD:USD", short: "UNI", name: "Uniswap" },
  { symbol: "NEAR/USD:USD", short: "NEAR", name: "NEAR Protocol" },
  { symbol: "INJ/USD:USD", short: "INJ", name: "Injective" },
  { symbol: "WIF/USD:USD", short: "WIF", name: "dogwifhat" },
  { symbol: "AAVE/USD:USD", short: "AAVE", name: "Aave" },
];
