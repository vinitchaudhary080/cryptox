import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const systemStrategies = [
  {
    name: "Meri Strategy",
    description:
      "Multi-timeframe EMA crossover + RSI confirmation. BUY when EMA(9) crosses above EMA(21) on 5m with RSI > 60, confirmed by 15m bullish trend. SELL on death cross with RSI < 40 + 15m bearish.",
    category: "Meri Strategy",
    riskLevel: "MEDIUM" as const,
    config: { takeProfit: 4, stopLoss: -2 },
    defaultPositionSize: 10,
    positionSizeLocked: false,
  },
  {
    name: "Meri Strategy V2",
    description:
      "Same 5m EMA(9/21) + RSI logic as V1, but sizes every entry at 50% of current equity (compounding). Position size is fixed by the strategy code and cannot be overridden.",
    category: "Meri Strategy",
    riskLevel: "MEDIUM" as const,
    config: { takeProfit: 4, stopLoss: -2, equityPercent: 0.5 },
    defaultPositionSize: 50,
    positionSizeLocked: true,
  },
  {
    name: "Supertrend Strategy",
    description:
      "SuperTrend on 15m with ADX trend strength filter, EMA(50) alignment, RSI range filter, and 1h chart confirmation. Dynamic SL at SuperTrend line. Exits on ST flip or ADX fade below 20.",
    category: "Supertrend",
    riskLevel: "MEDIUM" as const,
    config: { tpPercent: 6 },
    defaultPositionSize: 10,
    positionSizeLocked: false,
  },
  {
    name: "Ravi Strategy",
    description:
      "Buy when 1m candle closes above EMA(15), sell when it closes below. Simple trend-following with EMA crossover on 1-minute timeframe.",
    category: "Ravi Strategy",
    riskLevel: "MEDIUM" as const,
    config: { slPercent: 1, tpPercent: 2 },
    defaultPositionSize: 10,
    positionSizeLocked: false,
  },
  {
    name: "Gann Matrix Momentum",
    description:
      "Gann angle-based momentum strategy. Enters on 15m momentum shifts with 90° pivot detection. Uses Gann geometric levels for SL (180° reversal) and TP (360° target). Position size is derived from leverage by the strategy and cannot be overridden.",
    category: "Gann / Momentum",
    riskLevel: "HIGH" as const,
    config: { leverage: 1 },
    defaultPositionSize: 100,
    positionSizeLocked: true,
  },
  {
    name: "Support/Resistance Breakout",
    description:
      "15m volume-confirmed pivot zones with 20-bar lookback and ATR(200)-wide boxes. BUY on fresh close above resistance, SELL on fresh close below support. Hard SL at the far edge of the broken zone, then KAMA(10,2,30) trail once KAMA is more favourable. Optional 1% candle-size filter.",
    category: "Breakout",
    riskLevel: "MEDIUM" as const,
    config: { leverage: 1, candleSizeFilterPercent: 0 },
    defaultPositionSize: 25,
    positionSizeLocked: false,
  },
  {
    name: "MACD Crossover Swing",
    description:
      "15m MACD(12,26,9) crossover swing with rising/falling histogram confirmation, EMA(50) trend filter, and RSI(14) zone filter. SL at the signal candle's low (BUY) or high (SELL), 2x ATR target, and automatic breakeven stop move once profit reaches 1x ATR. Exits on MACD reversal, SL, or TP.",
    category: "Momentum",
    riskLevel: "MEDIUM" as const,
    config: { leverage: 1 },
    defaultPositionSize: 25,
    positionSizeLocked: false,
  },
  {
    name: "Weekly Momentum Swing",
    description:
      "Weekly long-only breakout swing. Fires when weekly close prints a fresh 8-week high of closes AND weekly EMA10>EMA30 stack is bullish. Exits on first weekly close below EMA10 (soft) or -2x ATR disaster stop. No fixed TP - designed to catch the full cyclic bull wave (weeks to months). Typically 3-10 trades across 3 years.",
    category: "Momentum",
    riskLevel: "MEDIUM" as const,
    config: { leverage: 1 },
    defaultPositionSize: 80,
    positionSizeLocked: false,
  },
];

async function seed() {
  console.log("Seeding database...");

  const allowedIds = systemStrategies.map((s) => s.name.toLowerCase().replace(/\s+/g, "-"));

  // Hide (not delete) any existing system strategies that aren't in the
  // allowed list. Hiding keeps existing DeployedStrategy rows intact while
  // removing the strategy from the public strategy page.
  const hidden = await prisma.strategy.updateMany({
    where: {
      isSystem: true,
      id: { notIn: allowedIds },
    },
    data: { isVisible: false },
  });
  if (hidden.count > 0) {
    console.log(`  ⤵  Hid ${hidden.count} legacy system strategies (kept in DB for existing deployments)`);
  }

  for (const s of systemStrategies) {
    await prisma.strategy.upsert({
      where: { id: s.name.toLowerCase().replace(/\s+/g, "-") },
      update: { ...s, isSystem: true, isVisible: true },
      create: { id: s.name.toLowerCase().replace(/\s+/g, "-"), ...s, isSystem: true, isVisible: true },
    });
    console.log(`  ✓ ${s.name} (default ${s.defaultPositionSize}%${s.positionSizeLocked ? ", locked" : ""})`);
  }

  console.log("Seeding complete!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
