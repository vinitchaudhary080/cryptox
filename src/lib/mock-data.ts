export const portfolioStats = {
  totalValue: 127845.32,
  totalPnl: 12453.21,
  totalPnlPercent: 10.78,
  dayPnl: 1234.56,
  dayPnlPercent: 0.97,
  activeStrategies: 8,
  winRate: 72.4,
  sharpeRatio: 2.31,
}

export const portfolioHistory = Array.from({ length: 90 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (89 - i))
  const base = 100000 + i * 300
  const noise = Math.sin(i * 0.3) * 3000 + Math.cos(i * 0.7) * 1500
  return {
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: Math.round(base + noise),
  }
})

export const allocationData = [
  { name: "BTC", value: 35, color: "#f7931a" },
  { name: "ETH", value: 25, color: "#627eea" },
  { name: "SOL", value: 15, color: "#9945ff" },
  { name: "AVAX", value: 10, color: "#e84142" },
  { name: "Others", value: 15, color: "#64748b" },
]

export const recentTrades = [
  { id: 1, pair: "BTC/USDT", side: "buy" as const, price: 67234.5, amount: 0.15, pnl: 234.12, time: "2 min ago", strategy: "Grid Bot" },
  { id: 2, pair: "ETH/USDT", side: "sell" as const, price: 3456.78, amount: 2.5, pnl: -45.67, time: "15 min ago", strategy: "DCA Pro" },
  { id: 3, pair: "SOL/USDT", side: "buy" as const, price: 178.45, amount: 50, pnl: 123.45, time: "32 min ago", strategy: "Momentum" },
  { id: 4, pair: "AVAX/USDT", side: "sell" as const, price: 42.18, amount: 100, pnl: 89.23, time: "1 hr ago", strategy: "Mean Rev." },
  { id: 5, pair: "LINK/USDT", side: "buy" as const, price: 18.92, amount: 200, pnl: -12.34, time: "2 hrs ago", strategy: "Grid Bot" },
]

export const strategies = [
  {
    id: "grid-bot",
    name: "Grid Trading Bot",
    description: "Automatically places buy and sell orders at preset price intervals within a defined range. Profits from market volatility.",
    category: "Grid",
    risk: "medium" as const,
    returnRate: 12.4,
    winRate: 78,
    trades: 1247,
    subscribers: 3420,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.4 + Math.sin(i * 0.5) * 2 })),
    tags: ["Popular", "Beginner Friendly"],
  },
  {
    id: "dca-pro",
    name: "Smart DCA Pro",
    description: "Enhanced dollar-cost averaging that adjusts buy amounts based on RSI and volatility indicators. Buys more during dips.",
    category: "DCA",
    risk: "low" as const,
    returnRate: 8.7,
    winRate: 85,
    trades: 892,
    subscribers: 5120,
    minInvestment: 100,
    pairs: ["BTC/USDT", "ETH/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.28 + Math.sin(i * 0.3) })),
    tags: ["Most Popular", "Low Risk"],
  },
  {
    id: "momentum-alpha",
    name: "Momentum Alpha",
    description: "Follows strong market trends using EMA crossovers and volume confirmation. Rides the momentum for maximum gains.",
    category: "Trend",
    risk: "high" as const,
    returnRate: 24.6,
    winRate: 62,
    trades: 456,
    subscribers: 1890,
    minInvestment: 1000,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.8 + Math.sin(i * 0.4) * 4 })),
    tags: ["High Return", "Advanced"],
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion Bot",
    description: "Identifies overbought/oversold conditions using Bollinger Bands and RSI. Trades the bounce back to the mean.",
    category: "Mean Reversion",
    risk: "medium" as const,
    returnRate: 15.2,
    winRate: 71,
    trades: 789,
    subscribers: 2340,
    minInvestment: 750,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.5 + Math.cos(i * 0.6) * 2.5 })),
    tags: ["Balanced", "Consistent"],
  },
  {
    id: "arbitrage-scanner",
    name: "Cross-Exchange Arbitrage",
    description: "Detects price differences across exchanges and executes simultaneous buy/sell for risk-free profit.",
    category: "Arbitrage",
    risk: "low" as const,
    returnRate: 5.8,
    winRate: 94,
    trades: 3456,
    subscribers: 980,
    minInvestment: 5000,
    pairs: ["BTC/USDT", "ETH/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.19 + Math.sin(i * 0.2) * 0.5 })),
    tags: ["Low Risk", "Institutional"],
  },
  {
    id: "scalping-turbo",
    name: "Scalping Turbo",
    description: "High-frequency strategy that captures small price movements. Executes dozens of trades per hour for consistent small gains.",
    category: "Scalping",
    risk: "high" as const,
    returnRate: 31.2,
    winRate: 58,
    trades: 12890,
    subscribers: 1560,
    minInvestment: 2000,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 1.0 + Math.sin(i * 0.8) * 5 })),
    tags: ["High Frequency", "Expert"],
  },
  {
    id: "ravi-strategy",
    name: "Ravi Strategy",
    description: "Buy when 1m candle closes above EMA(15), sell when it closes below. Simple trend-following with EMA crossover.",
    category: "Meri Strategy",
    risk: "medium" as const,
    returnRate: 14.2,
    winRate: 48,
    trades: 1820,
    subscribers: 650,
    minInvestment: 10,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "DOGE/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.45 + Math.sin(i * 0.7) * 3 })),
    tags: ["1-Minute", "EMA Crossover"],
  },
  {
    id: "quick-test-strategy",
    name: "Quick Test Strategy",
    description: "Opens a small test trade every 2 minutes to verify broker connection. For testing only.",
    category: "Meri Strategy",
    risk: "low" as const,
    returnRate: 0,
    winRate: 0,
    trades: 0,
    subscribers: 0,
    minInvestment: 1,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 })),
    tags: ["Testing", "Broker Check"],
  },
  {
    id: "cpr-pivot-strategy",
    name: "CPR Pivot Strategy",
    description: "Intraday pivot strategy using Central Pivot Range. Narrow CPR = breakout trades. Wide CPR = fade at PDH/PDL extremes. Dynamic SL at CPR levels.",
    category: "Meri Strategy",
    risk: "medium" as const,
    returnRate: 15.8,
    winRate: 61,
    trades: 580,
    subscribers: 890,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.5 + Math.sin(i * 0.6) * 2 })),
    tags: ["Intraday", "Pivot Based"],
  },
  {
    id: "supertrend-strategy",
    name: "Supertrend Strategy",
    description: "SuperTrend on 15m with ADX filter, EMA(50) alignment, RSI range filter, and 1h confirmation. Dynamic SL at SuperTrend line.",
    category: "Meri Strategy",
    risk: "medium" as const,
    returnRate: 18.4,
    winRate: 58,
    trades: 312,
    subscribers: 1240,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.7 + Math.cos(i * 0.4) * 2.5 })),
    tags: ["SuperTrend", "Multi-Timeframe"],
  },
  {
    id: "meri-strategy",
    name: "Meri Strategy",
    description: "Multi-timeframe EMA crossover + RSI. BUY when EMA(9) crosses above EMA(21) on 5m with RSI > 60, confirmed by 15m bullish trend. SELL on reverse with RSI < 40.",
    category: "Meri Strategy",
    risk: "medium" as const,
    returnRate: 22.7,
    winRate: 52,
    trades: 749,
    subscribers: 2180,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "DOGE/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.6 + Math.sin(i * 0.5) * 3 })),
    tags: ["Multi-Timeframe", "Custom"],
  },
  {
    id: "meri-strategy-v2",
    name: "Meri Strategy V2",
    description: "Same 5m EMA(9/21) + RSI logic as V1, sized at 50% of current equity per entry, so position size compounds with account growth.",
    category: "Meri Strategy",
    risk: "medium" as const,
    returnRate: 34.8,
    winRate: 54,
    trades: 632,
    subscribers: 1460,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.9 + Math.sin(i * 0.45) * 4 })),
    tags: ["Compounding", "Multi-Timeframe"],
  },
  {
    id: "gann-matrix-momentum",
    name: "Gann Matrix Momentum",
    description: "Gann angle-based momentum strategy on 15m. Enters on 90° pivot detection with geometric SL (180° reversal) and TP (360° target), with EMA cross exit.",
    category: "Gann / Momentum",
    risk: "high" as const,
    returnRate: 41.2,
    winRate: 46,
    trades: 894,
    subscribers: 1820,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 1.1 + Math.cos(i * 0.55) * 5 })),
    tags: ["Gann", "Momentum"],
  },
  {
    id: "support/resistance-breakout",
    name: "Support/Resistance Breakout",
    description: "15m volume-confirmed pivot zones with ATR(200)-wide boxes. Fresh breakouts above resistance / below support with hard SL at the far edge, then KAMA trail.",
    category: "Breakout",
    risk: "medium" as const,
    returnRate: 28.5,
    winRate: 51,
    trades: 412,
    subscribers: 980,
    minInvestment: 500,
    pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + i * 0.8 + Math.sin(i * 0.6) * 3.5 })),
    tags: ["Breakout", "KAMA Trail"],
  },
]

export const modelPortfolios = [
  {
    id: "blue-chip",
    name: "Blue Chip Crypto",
    description: "Top 5 cryptocurrencies by market cap. Conservative allocation with automatic quarterly rebalancing.",
    risk: "low" as const,
    returnRate: 45.2,
    period: "1Y",
    aum: 2450000,
    followers: 8920,
    allocation: [
      { name: "BTC", weight: 40, color: "#f7931a" },
      { name: "ETH", weight: 30, color: "#627eea" },
      { name: "SOL", weight: 15, color: "#9945ff" },
      { name: "BNB", weight: 10, color: "#f3ba2f" },
      { name: "XRP", weight: 5, color: "#00aae4" },
    ],
    performance: Array.from({ length: 12 }, (_, i) => ({ month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i], value: 100 + i * 3.8 + Math.sin(i * 0.5) * 5 })),
  },
  {
    id: "defi-yield",
    name: "DeFi Yield Hunter",
    description: "Focused on DeFi tokens with strong protocol revenue and yield-generating capabilities.",
    risk: "medium" as const,
    returnRate: 78.5,
    period: "1Y",
    aum: 1230000,
    followers: 4560,
    allocation: [
      { name: "ETH", weight: 25, color: "#627eea" },
      { name: "UNI", weight: 20, color: "#ff007a" },
      { name: "AAVE", weight: 20, color: "#b6509e" },
      { name: "MKR", weight: 15, color: "#1aab9b" },
      { name: "COMP", weight: 10, color: "#00d395" },
      { name: "CRV", weight: 10, color: "#ff4545" },
    ],
    performance: Array.from({ length: 12 }, (_, i) => ({ month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i], value: 100 + i * 6.5 + Math.sin(i * 0.7) * 8 })),
  },
  {
    id: "ai-narrative",
    name: "AI & Compute Tokens",
    description: "Emerging AI and compute narrative tokens. Higher risk, higher reward potential.",
    risk: "high" as const,
    returnRate: 156.3,
    period: "1Y",
    aum: 890000,
    followers: 6780,
    allocation: [
      { name: "RNDR", weight: 25, color: "#e54b4b" },
      { name: "FET", weight: 20, color: "#1d2951" },
      { name: "NEAR", weight: 20, color: "#00c08b" },
      { name: "TAO", weight: 15, color: "#333" },
      { name: "AKT", weight: 10, color: "#ff414c" },
      { name: "AR", weight: 10, color: "#222" },
    ],
    performance: Array.from({ length: 12 }, (_, i) => ({ month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i], value: 100 + i * 13 + Math.sin(i * 0.6) * 15 })),
  },
  {
    id: "layer1-index",
    name: "Layer 1 Index",
    description: "Diversified exposure to leading Layer 1 blockchains. Auto-rebalanced monthly.",
    risk: "medium" as const,
    returnRate: 62.1,
    period: "1Y",
    aum: 1780000,
    followers: 5230,
    allocation: [
      { name: "ETH", weight: 30, color: "#627eea" },
      { name: "SOL", weight: 25, color: "#9945ff" },
      { name: "AVAX", weight: 15, color: "#e84142" },
      { name: "NEAR", weight: 15, color: "#00c08b" },
      { name: "SUI", weight: 15, color: "#6fbcf0" },
    ],
    performance: Array.from({ length: 12 }, (_, i) => ({ month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i], value: 100 + i * 5.2 + Math.sin(i * 0.4) * 7 })),
  },
]

export const topTraders = [
  { id: 1, name: "CryptoWhale", avatar: "CW", pnl: 234567, pnlPercent: 156.3, winRate: 78, trades: 1234, followers: 8900, risk: "medium" as const, strategies: ["Grid", "DCA"], badge: "Top Performer" },
  { id: 2, name: "AlgoMaster", avatar: "AM", pnl: 189234, pnlPercent: 124.7, winRate: 82, trades: 987, followers: 6700, risk: "low" as const, strategies: ["DCA", "Arbitrage"], badge: "Consistent" },
  { id: 3, name: "DeFiHunter", avatar: "DH", pnl: 156789, pnlPercent: 98.4, winRate: 68, trades: 2345, followers: 5400, risk: "high" as const, strategies: ["Momentum", "Scalping"], badge: "High Return" },
  { id: 4, name: "SteadyEddie", avatar: "SE", pnl: 98765, pnlPercent: 67.2, winRate: 88, trades: 567, followers: 4200, risk: "low" as const, strategies: ["DCA", "Mean Reversion"], badge: "Low Risk" },
  { id: 5, name: "TrendRider", avatar: "TR", pnl: 145678, pnlPercent: 112.5, winRate: 71, trades: 1567, followers: 3800, risk: "high" as const, strategies: ["Momentum", "Grid"], badge: "Trending" },
  { id: 6, name: "QuantBot", avatar: "QB", pnl: 178432, pnlPercent: 134.1, winRate: 75, trades: 4532, followers: 7200, risk: "medium" as const, strategies: ["Arbitrage", "Scalping"], badge: "High Frequency" },
]

export type Broker = {
  id: string
  name: string
  shortName: string
  status: "connected" | "disconnected" | "error"
  apiKey: string
  connectedAt: string
  balance: number
  activeStrategies: number
  totalTrades: number
  totalPnl: number
  supportedPairs: string[]
  logo: string
}

export const brokers: Broker[] = [
  {
    id: "delta-1",
    name: "Delta Exchange",
    shortName: "DE",
    status: "connected",
    apiKey: "****...7x2f",
    connectedAt: "2025-12-15",
    balance: 45230.50,
    activeStrategies: 3,
    totalTrades: 567,
    totalPnl: 4523.12,
    supportedPairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "LINK/USDT"],
    logo: "DE",
  },
  {
    id: "binance-1",
    name: "Binance",
    shortName: "BN",
    status: "connected",
    apiKey: "****...m9kl",
    connectedAt: "2026-01-08",
    balance: 78450.20,
    activeStrategies: 4,
    totalTrades: 1234,
    totalPnl: 8920.45,
    supportedPairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT"],
    logo: "BN",
  },
  {
    id: "bybit-1",
    name: "Bybit",
    shortName: "BB",
    status: "disconnected",
    apiKey: "",
    connectedAt: "",
    balance: 0,
    activeStrategies: 0,
    totalTrades: 0,
    totalPnl: 0,
    supportedPairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    logo: "BB",
  },
]

// CryptoX is futures-only and supports exactly 4 brokers.
export const availableBrokers = [
  { id: "coindcx", name: "CoinDCX", shortName: "CD", description: "India's largest crypto exchange. USDT-margined perpetual futures.", features: ["USDT Perps", "Up to 20x"], region: "India" },
  { id: "delta", name: "Delta Exchange India", shortName: "DE", description: "India's leading crypto derivatives venue. USD-settled perpetual futures.", features: ["USD Perps", "Up to 200x"], region: "India" },
  { id: "pi42", name: "Pi42", shortName: "P4", description: "Futures-only Indian exchange with both USDT and INR-margined perpetuals.", features: ["USDT + INR Perps", "Up to 150x"], region: "India" },
  { id: "bybit", name: "Bybit", shortName: "BB", description: "Global derivatives venue with deep USDT perp liquidity.", features: ["USDT Perps", "Up to 100x"], region: "Global" },
]

export type DeployedStrategy = {
  id: string
  strategyName: string
  strategyType: string
  brokerId: string
  brokerName: string
  brokerShortName: string
  pair: string
  status: "active" | "paused" | "stopped"
  deployedAt: string
  investedAmount: number
  currentValue: number
  totalPnl: number
  totalPnlPercent: number
  todayPnl: number
  totalTrades: number
  winRate: number
  openPositions: number
  trades: {
    id: number
    pair: string
    side: "buy" | "sell"
    entryPrice: number
    exitPrice: number | null
    quantity: number
    pnl: number
    fee: number
    status: "open" | "closed"
    openedAt: string
    closedAt: string | null
  }[]
  pnlHistory: { date: string; pnl: number }[]
}

export const deployedStrategies: DeployedStrategy[] = [
  {
    id: "dep-1",
    strategyName: "Grid Trading Bot",
    strategyType: "Grid",
    brokerId: "delta-1",
    brokerName: "Delta Exchange",
    brokerShortName: "DE",
    pair: "BTC/USDT",
    status: "active",
    deployedAt: "2026-02-10",
    investedAmount: 10000,
    currentValue: 11245.67,
    totalPnl: 1245.67,
    totalPnlPercent: 12.46,
    todayPnl: 89.32,
    totalTrades: 156,
    winRate: 74,
    openPositions: 3,
    trades: [
      { id: 1, pair: "BTC/USDT", side: "buy", entryPrice: 67120.50, exitPrice: null, quantity: 0.02, pnl: 45.20, fee: 1.34, status: "open", openedAt: "2026-04-08 14:32", closedAt: null },
      { id: 2, pair: "BTC/USDT", side: "sell", entryPrice: 67450.00, exitPrice: 67120.50, quantity: 0.02, pnl: -6.59, fee: 1.35, status: "closed", openedAt: "2026-04-08 12:15", closedAt: "2026-04-08 14:30" },
      { id: 3, pair: "BTC/USDT", side: "buy", entryPrice: 66890.25, exitPrice: 67450.00, quantity: 0.03, pnl: 16.79, fee: 2.01, status: "closed", openedAt: "2026-04-08 09:45", closedAt: "2026-04-08 12:10" },
      { id: 4, pair: "BTC/USDT", side: "buy", entryPrice: 66520.00, exitPrice: null, quantity: 0.015, pnl: 28.50, fee: 1.00, status: "open", openedAt: "2026-04-07 22:10", closedAt: null },
      { id: 5, pair: "BTC/USDT", side: "sell", entryPrice: 67200.75, exitPrice: 66520.00, quantity: 0.025, pnl: 17.02, fee: 1.68, status: "closed", openedAt: "2026-04-07 18:30", closedAt: "2026-04-07 22:05" },
      { id: 6, pair: "BTC/USDT", side: "buy", entryPrice: 66100.00, exitPrice: 67200.75, quantity: 0.02, pnl: 22.02, fee: 1.34, status: "closed", openedAt: "2026-04-07 14:20", closedAt: "2026-04-07 18:25" },
      { id: 7, pair: "BTC/USDT", side: "buy", entryPrice: 65890.50, exitPrice: null, quantity: 0.01, pnl: 12.30, fee: 0.66, status: "open", openedAt: "2026-04-07 10:00", closedAt: null },
      { id: 8, pair: "BTC/USDT", side: "sell", entryPrice: 66700.00, exitPrice: 65890.50, quantity: 0.03, pnl: 24.29, fee: 2.00, status: "closed", openedAt: "2026-04-06 20:15", closedAt: "2026-04-07 09:55" },
    ],
    pnlHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Math.round((i * 42 + Math.sin(i * 0.5) * 120) * 100) / 100 }
    }),
  },
  {
    id: "dep-2",
    strategyName: "Smart DCA Pro",
    strategyType: "DCA",
    brokerId: "delta-1",
    brokerName: "Delta Exchange",
    brokerShortName: "DE",
    pair: "ETH/USDT",
    status: "active",
    deployedAt: "2026-01-20",
    investedAmount: 5000,
    currentValue: 5435.20,
    totalPnl: 435.20,
    totalPnlPercent: 8.70,
    todayPnl: 23.45,
    totalTrades: 48,
    winRate: 83,
    openPositions: 1,
    trades: [
      { id: 1, pair: "ETH/USDT", side: "buy", entryPrice: 3420.50, exitPrice: null, quantity: 0.5, pnl: 18.25, fee: 1.71, status: "open", openedAt: "2026-04-08 10:00", closedAt: null },
      { id: 2, pair: "ETH/USDT", side: "buy", entryPrice: 3380.00, exitPrice: 3420.50, quantity: 0.8, pnl: 32.40, fee: 2.70, status: "closed", openedAt: "2026-04-07 10:00", closedAt: "2026-04-08 09:55" },
      { id: 3, pair: "ETH/USDT", side: "buy", entryPrice: 3350.25, exitPrice: 3400.00, quantity: 0.6, pnl: 29.85, fee: 2.01, status: "closed", openedAt: "2026-04-06 10:00", closedAt: "2026-04-07 09:50" },
      { id: 4, pair: "ETH/USDT", side: "buy", entryPrice: 3290.00, exitPrice: 3350.25, quantity: 1.0, pnl: 60.25, fee: 3.29, status: "closed", openedAt: "2026-04-05 10:00", closedAt: "2026-04-06 09:55" },
      { id: 5, pair: "ETH/USDT", side: "buy", entryPrice: 3250.50, exitPrice: 3290.00, quantity: 0.7, pnl: 27.65, fee: 2.28, status: "closed", openedAt: "2026-04-04 10:00", closedAt: "2026-04-05 09:55" },
    ],
    pnlHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Math.round((i * 14.5 + Math.sin(i * 0.3) * 40) * 100) / 100 }
    }),
  },
  {
    id: "dep-3",
    strategyName: "Momentum Alpha",
    strategyType: "Trend",
    brokerId: "binance-1",
    brokerName: "Binance",
    brokerShortName: "BN",
    pair: "SOL/USDT",
    status: "active",
    deployedAt: "2026-03-01",
    investedAmount: 8000,
    currentValue: 9968.40,
    totalPnl: 1968.40,
    totalPnlPercent: 24.61,
    todayPnl: 156.78,
    totalTrades: 89,
    winRate: 64,
    openPositions: 2,
    trades: [
      { id: 1, pair: "SOL/USDT", side: "buy", entryPrice: 175.40, exitPrice: null, quantity: 12, pnl: 36.00, fee: 2.11, status: "open", openedAt: "2026-04-08 11:20", closedAt: null },
      { id: 2, pair: "SOL/USDT", side: "buy", entryPrice: 172.80, exitPrice: null, quantity: 8, pnl: 20.80, fee: 1.38, status: "open", openedAt: "2026-04-07 16:45", closedAt: null },
      { id: 3, pair: "SOL/USDT", side: "sell", entryPrice: 178.50, exitPrice: 172.80, quantity: 15, pnl: -85.50, fee: 2.68, status: "closed", openedAt: "2026-04-06 09:00", closedAt: "2026-04-07 16:40" },
      { id: 4, pair: "SOL/USDT", side: "buy", entryPrice: 168.20, exitPrice: 178.50, quantity: 10, pnl: 103.00, fee: 1.68, status: "closed", openedAt: "2026-04-05 14:30", closedAt: "2026-04-06 08:55" },
      { id: 5, pair: "SOL/USDT", side: "buy", entryPrice: 165.00, exitPrice: 170.50, quantity: 20, pnl: 110.00, fee: 3.30, status: "closed", openedAt: "2026-04-04 11:00", closedAt: "2026-04-05 14:25" },
    ],
    pnlHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Math.round((i * 65 + Math.sin(i * 0.7) * 200 - 100) * 100) / 100 }
    }),
  },
  {
    id: "dep-4",
    strategyName: "Grid Trading Bot",
    strategyType: "Grid",
    brokerId: "binance-1",
    brokerName: "Binance",
    brokerShortName: "BN",
    pair: "ETH/USDT",
    status: "paused",
    deployedAt: "2026-02-25",
    investedAmount: 6000,
    currentValue: 5780.30,
    totalPnl: -219.70,
    totalPnlPercent: -3.66,
    todayPnl: 0,
    totalTrades: 78,
    winRate: 55,
    openPositions: 0,
    trades: [
      { id: 1, pair: "ETH/USDT", side: "buy", entryPrice: 3500.00, exitPrice: 3380.00, quantity: 0.5, pnl: -60.00, fee: 1.75, status: "closed", openedAt: "2026-03-28 15:00", closedAt: "2026-03-29 09:30" },
      { id: 2, pair: "ETH/USDT", side: "sell", entryPrice: 3420.00, exitPrice: 3500.00, quantity: 0.4, pnl: -32.00, fee: 1.37, status: "closed", openedAt: "2026-03-27 11:00", closedAt: "2026-03-28 14:55" },
      { id: 3, pair: "ETH/USDT", side: "buy", entryPrice: 3350.50, exitPrice: 3420.00, quantity: 0.6, pnl: 41.70, fee: 2.01, status: "closed", openedAt: "2026-03-26 09:00", closedAt: "2026-03-27 10:55" },
    ],
    pnlHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Math.round((i * 5 - i * i * 0.4 + Math.sin(i * 0.4) * 30) * 100) / 100 }
    }),
  },
  {
    id: "dep-5",
    strategyName: "Smart DCA Pro",
    strategyType: "DCA",
    brokerId: "binance-1",
    brokerName: "Binance",
    brokerShortName: "BN",
    pair: "BTC/USDT",
    status: "active",
    deployedAt: "2026-01-05",
    investedAmount: 15000,
    currentValue: 16890.50,
    totalPnl: 1890.50,
    totalPnlPercent: 12.60,
    todayPnl: 67.80,
    totalTrades: 95,
    winRate: 82,
    openPositions: 1,
    trades: [
      { id: 1, pair: "BTC/USDT", side: "buy", entryPrice: 66800.00, exitPrice: null, quantity: 0.05, pnl: 32.00, fee: 3.34, status: "open", openedAt: "2026-04-08 10:00", closedAt: null },
      { id: 2, pair: "BTC/USDT", side: "buy", entryPrice: 66200.00, exitPrice: 66800.00, quantity: 0.08, pnl: 48.00, fee: 5.30, status: "closed", openedAt: "2026-04-07 10:00", closedAt: "2026-04-08 09:55" },
      { id: 3, pair: "BTC/USDT", side: "buy", entryPrice: 65500.00, exitPrice: 66200.00, quantity: 0.06, pnl: 42.00, fee: 3.93, status: "closed", openedAt: "2026-04-06 10:00", closedAt: "2026-04-07 09:55" },
    ],
    pnlHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Math.round((i * 63 + Math.sin(i * 0.4) * 80) * 100) / 100 }
    }),
  },
  {
    id: "dep-6",
    strategyName: "Mean Reversion Bot",
    strategyType: "Mean Reversion",
    brokerId: "delta-1",
    brokerName: "Delta Exchange",
    brokerShortName: "DE",
    pair: "SOL/USDT",
    status: "stopped",
    deployedAt: "2026-01-15",
    investedAmount: 3000,
    currentValue: 2650.80,
    totalPnl: -349.20,
    totalPnlPercent: -11.64,
    todayPnl: 0,
    totalTrades: 42,
    winRate: 48,
    openPositions: 0,
    trades: [
      { id: 1, pair: "SOL/USDT", side: "buy", entryPrice: 190.00, exitPrice: 178.50, quantity: 5, pnl: -57.50, fee: 0.95, status: "closed", openedAt: "2026-02-20 14:00", closedAt: "2026-02-22 09:30" },
      { id: 2, pair: "SOL/USDT", side: "sell", entryPrice: 185.00, exitPrice: 190.00, quantity: 8, pnl: -40.00, fee: 1.48, status: "closed", openedAt: "2026-02-18 10:00", closedAt: "2026-02-20 13:55" },
    ],
    pnlHistory: Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Math.round((-i * 12 + Math.sin(i * 0.6) * 50) * 100) / 100 }
    }),
  },
]

export const analyticsData = {
  monthlyReturns: [
    { month: "Jan", return: 5.2 },
    { month: "Feb", return: -2.1 },
    { month: "Mar", return: 8.4 },
    { month: "Apr", return: 3.7 },
    { month: "May", return: -1.5 },
    { month: "Jun", return: 12.3 },
    { month: "Jul", return: 6.8 },
    { month: "Aug", return: -4.2 },
    { month: "Sep", return: 9.1 },
    { month: "Oct", return: 7.5 },
    { month: "Nov", return: -0.8 },
    { month: "Dec", return: 11.2 },
  ],
  drawdownData: Array.from({ length: 90 }, (_, i) => ({
    day: i + 1,
    drawdown: -(Math.abs(Math.sin(i * 0.15)) * 12 + Math.random() * 3),
  })),
  riskMetrics: {
    sharpeRatio: 2.31,
    sortinoRatio: 3.14,
    maxDrawdown: -15.4,
    volatility: 18.2,
    beta: 0.85,
    alpha: 12.3,
    calmarRatio: 1.67,
    informationRatio: 0.92,
  },
  strategyBreakdown: [
    { name: "Grid Bot", pnl: 4567, trades: 450, winRate: 78 },
    { name: "DCA Pro", pnl: 3210, trades: 120, winRate: 85 },
    { name: "Momentum", pnl: 2890, trades: 89, winRate: 62 },
    { name: "Mean Rev.", pnl: 1786, trades: 234, winRate: 71 },
  ],
}
