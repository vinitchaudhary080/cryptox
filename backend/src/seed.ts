import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const systemStrategies = [
  {
    name: "Grid Trading Bot",
    description: "Automatically places buy and sell orders at preset price intervals within a defined range. Profits from market volatility.",
    category: "Grid",
    riskLevel: "MEDIUM" as const,
    config: { gridSize: 5, gridSpacing: 0.5, takeProfit: 1.0, stopLoss: -2.0 },
  },
  {
    name: "Smart DCA Pro",
    description: "Enhanced dollar-cost averaging that buys at regular intervals. Accumulates positions over time to average out entry price.",
    category: "DCA",
    riskLevel: "LOW" as const,
    config: { intervalHours: 24, baseAmount: 50 },
  },
  {
    name: "Momentum Alpha",
    description: "Follows strong market trends using 24h momentum. Enters positions when price shows significant directional movement.",
    category: "Trend",
    riskLevel: "HIGH" as const,
    config: { momentumThreshold: 2, takeProfit: 5, stopLoss: -3, positionSize: 0.1 },
  },
  {
    name: "Mean Reversion Bot",
    description: "Identifies overbought/oversold conditions and trades the bounce back to the mean. Buys dips and sells rallies.",
    category: "Mean Reversion",
    riskLevel: "MEDIUM" as const,
    config: { deviationThreshold: -3, takeProfit: 2, stopLoss: -5 },
  },
  {
    name: "Scalping Turbo",
    description: "High-frequency strategy capturing small price movements. Quick in-and-out trades for consistent small gains.",
    category: "Scalping",
    riskLevel: "HIGH" as const,
    config: { gridSize: 10, gridSpacing: 0.2, takeProfit: 0.5, stopLoss: -0.5 },
  },
  {
    name: "Ravi Strategy",
    description: "Buy when 1m candle closes above EMA(15), sell when it closes below. Simple trend-following with EMA crossover on 1-minute timeframe.",
    category: "Ravi Strategy",
    riskLevel: "MEDIUM" as const,
    config: { slPercent: 1, tpPercent: 2, positionSize: 0.1 },
  },
  {
    name: "Quick Test Strategy",
    description: "Opens a small test trade every 2 minutes to verify broker connection is working. For testing only — not for real trading.",
    category: "Quick Test",
    riskLevel: "LOW" as const,
    config: { slPercent: 1, tpPercent: 1, positionSize: 0.5 },
  },
  {
    name: "CPR Pivot Strategy",
    description: "Intraday pivot strategy using Central Pivot Range. Narrow CPR = breakout trades above TC / below BC. Wide CPR = fade at PDH/PDL extremes. Dynamic SL at CPR levels.",
    category: "CPR Pivot",
    riskLevel: "MEDIUM" as const,
    config: { fadingSlPercent: 0.3, positionSize: 0.1 },
  },
  {
    name: "Supertrend Strategy",
    description: "SuperTrend on 15m with ADX trend strength filter, EMA(50) alignment, RSI range filter, and 1h chart confirmation. Dynamic SL at SuperTrend line. Exits on ST flip or ADX fade below 20.",
    category: "Supertrend",
    riskLevel: "MEDIUM" as const,
    config: { tpPercent: 6, positionSize: 0.1 },
  },
  {
    name: "Meri Strategy",
    description: "Multi-timeframe EMA crossover + RSI confirmation. BUY when EMA(9) crosses above EMA(21) on 5m with RSI > 60, confirmed by 15m bullish trend. SELL on death cross with RSI < 40 + 15m bearish.",
    category: "Meri Strategy",
    riskLevel: "MEDIUM" as const,
    config: { takeProfit: 4, stopLoss: -2, positionSize: 0.1 },
  },
  {
    name: "Conservative DCA",
    description: "Weekly buys with fixed amount. The simplest and safest long-term accumulation strategy.",
    category: "DCA",
    riskLevel: "LOW" as const,
    config: { intervalHours: 168, baseAmount: 25 },
  },
];

async function seed() {
  console.log("Seeding database...");

  for (const s of systemStrategies) {
    await prisma.strategy.upsert({
      where: { id: s.name.toLowerCase().replace(/\s+/g, "-") },
      update: { ...s, isSystem: true },
      create: { id: s.name.toLowerCase().replace(/\s+/g, "-"), ...s, isSystem: true },
    });
    console.log(`  ✓ ${s.name}`);
  }

  console.log("Seeding complete!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
