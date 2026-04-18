import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const systemStrategies = [
  {
    name: "Meri Strategy",
    description:
      "Multi-timeframe EMA crossover + RSI confirmation. BUY when EMA(9) crosses above EMA(21) on 5m with RSI > 60, confirmed by 15m bullish trend. SELL on death cross with RSI < 40 + 15m bearish.",
    category: "Meri Strategy",
    riskLevel: "MEDIUM" as const,
    config: { takeProfit: 4, stopLoss: -2, positionSize: 0.1 },
  },
  {
    name: "Meri Strategy V2",
    description:
      "Same 5m EMA(9/21) + RSI logic as V1, but sizes every entry at 50% of current equity (compounding). Dynamic position size tracks account balance growth.",
    category: "Meri Strategy",
    riskLevel: "MEDIUM" as const,
    config: { takeProfit: 4, stopLoss: -2, equityPercent: 0.5 },
  },
  {
    name: "Supertrend Strategy",
    description:
      "SuperTrend on 15m with ADX trend strength filter, EMA(50) alignment, RSI range filter, and 1h chart confirmation. Dynamic SL at SuperTrend line. Exits on ST flip or ADX fade below 20.",
    category: "Supertrend",
    riskLevel: "MEDIUM" as const,
    config: { tpPercent: 6, positionSize: 0.1 },
  },
  {
    name: "Ravi Strategy",
    description:
      "Buy when 1m candle closes above EMA(15), sell when it closes below. Simple trend-following with EMA crossover on 1-minute timeframe.",
    category: "Ravi Strategy",
    riskLevel: "MEDIUM" as const,
    config: { slPercent: 1, tpPercent: 2, positionSize: 0.1 },
  },
  {
    name: "Gann Matrix Momentum",
    description:
      "Gann angle-based momentum strategy. Enters on 15m momentum shifts with 90° pivot detection. Uses Gann geometric levels for SL (180° reversal) and TP (360° target) along with EMA cross exit.",
    category: "Gann / Momentum",
    riskLevel: "HIGH" as const,
    config: { leverage: 1, positionSizePercent: 100 },
  },
  {
    name: "Support/Resistance Breakout",
    description:
      "15m volume-confirmed pivot zones with 20-bar lookback and ATR(200)-wide boxes. BUY on fresh close above resistance, SELL on fresh close below support. Hard SL at the far edge of the broken zone, then KAMA(10,2,30) trail once KAMA is more favourable. Optional 1% candle-size filter.",
    category: "Breakout",
    riskLevel: "MEDIUM" as const,
    config: { leverage: 1, positionSizePercent: 25, candleSizeFilterPercent: 0 },
  },
];

async function seed() {
  console.log("Seeding database...");

  const allowedIds = systemStrategies.map((s) => s.name.toLowerCase().replace(/\s+/g, "-"));

  // Remove any system strategies that are no longer in the allowed list
  const removed = await prisma.strategy.deleteMany({
    where: {
      isSystem: true,
      id: { notIn: allowedIds },
    },
  });
  if (removed.count > 0) {
    console.log(`  ✗ Removed ${removed.count} stale system strategies`);
  }

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
