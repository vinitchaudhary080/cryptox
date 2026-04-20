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

export interface Signal {
  action: SignalAction;
  qty?: number;
  sl?: number;
  tp?: number;
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
  side: "BUY" | "SELL";
  leverage: number;
  sl: number | null;
  tp: number | null;
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
  exit_reason: "TP" | "SL" | "SIGNAL" | "END";
  status: "CLOSED";
}

// ── Backtest Config & Result Types ──────────────────────────────

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
