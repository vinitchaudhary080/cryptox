import { PrismaClient, type DeployedStrategy, type Strategy } from "@prisma/client";
import { exchangeService } from "../services/exchange.service.js";
import type { Ticker } from "ccxt";

const prisma = new PrismaClient();

/**
 * Strategy executor — runs deployed strategies as background intervals.
 * Each active strategy gets its own interval loop that checks conditions
 * and executes trades based on the strategy type.
 */
class StrategyWorker {
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly TICK_INTERVAL = 30_000; // 30 seconds

  /**
   * Start running a deployed strategy
   */
  async startStrategy(deployedId: string): Promise<void> {
    // Don't double-start
    if (this.intervals.has(deployedId)) return;

    console.log(`[Worker] Starting strategy: ${deployedId}`);

    // Run immediately once, then on interval
    await this.tick(deployedId);

    const interval = setInterval(async () => {
      try {
        await this.tick(deployedId);
      } catch (err) {
        console.error(`[Worker] Error in strategy ${deployedId}:`, (err as Error).message);
      }
    }, this.TICK_INTERVAL);

    this.intervals.set(deployedId, interval);
  }

  /**
   * Stop a strategy worker
   */
  stopStrategy(deployedId: string): void {
    const interval = this.intervals.get(deployedId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(deployedId);
      console.log(`[Worker] Stopped strategy: ${deployedId}`);
    }
  }

  /**
   * Resume all active strategies on server start
   */
  async resumeAll(): Promise<void> {
    const active = await prisma.deployedStrategy.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    console.log(`[Worker] Resuming ${active.length} active strategies`);
    for (const d of active) {
      await this.startStrategy(d.id);
    }
  }

  /**
   * Single tick — check conditions and maybe trade
   */
  private async tick(deployedId: string): Promise<void> {
    const deployed = await prisma.deployedStrategy.findUnique({
      where: { id: deployedId },
      include: {
        strategy: true,
        broker: true,
        trades: { where: { status: "OPEN" }, orderBy: { openedAt: "desc" } },
      },
    });

    if (!deployed || deployed.status !== "ACTIVE") {
      this.stopStrategy(deployedId);
      return;
    }

    const exchange = exchangeService.getExchange(
      deployed.brokerId,
      deployed.broker.exchangeId,
      deployed.broker.apiKey,
      deployed.broker.apiSecret,
      deployed.broker.passphrase || undefined,
    );

    try {
      const ticker = await exchangeService.getTicker(exchange, deployed.pair);

      // Route to strategy-specific logic
      switch (deployed.strategy.category.toLowerCase()) {
        case "grid":
          await this.executeGrid(deployed, deployed.strategy, ticker);
          break;
        case "dca":
          await this.executeDCA(deployed, deployed.strategy, ticker);
          break;
        case "trend":
          await this.executeTrend(deployed, deployed.strategy, ticker);
          break;
        case "mean reversion":
          await this.executeMeanReversion(deployed, deployed.strategy, ticker);
          break;
        default:
          // Generic: just log ticker for monitoring
          console.log(`[Worker] ${deployed.pair} @ ${ticker.last} — no specific handler for ${deployed.strategy.category}`);
      }

      // Update current value based on open trades + remaining capital
      await this.updatePortfolioValue(deployed, ticker);

    } catch (err) {
      console.error(`[Worker] Tick error for ${deployed.pair}:`, (err as Error).message);
    }
  }

  /**
   * Grid strategy: place buy/sell orders at intervals
   */
  private async executeGrid(
    deployed: DeployedStrategy & { trades: Array<{ id: string; status: string; entryPrice: number; quantity: number; side: string }> },
    strategy: Strategy,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const gridSize = config.gridSize || 5; // number of grid levels
    const gridSpacing = config.gridSpacing || 0.5; // percentage between levels
    const positionSize = config.positionSize || (deployed.investedAmount / gridSize);
    const currentPrice = ticker.last || 0;

    if (!currentPrice) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");

    // Check if we should open a new position
    if (openTrades.length < gridSize) {
      // Check if price moved enough from last trade
      const lastTrade = openTrades[0];
      if (lastTrade) {
        const priceDiff = Math.abs(currentPrice - lastTrade.entryPrice) / lastTrade.entryPrice * 100;
        if (priceDiff < gridSpacing) return; // Not enough movement
      }

      // Determine side based on price movement
      const side = !lastTrade || currentPrice < lastTrade.entryPrice ? "BUY" : "SELL";
      const quantity = positionSize / currentPrice;

      console.log(`[Grid] ${deployed.pair}: ${side} ${quantity.toFixed(6)} @ ${currentPrice}`);

      await prisma.trade.create({
        data: {
          deployedStrategyId: deployed.id,
          pair: deployed.pair,
          side,
          entryPrice: currentPrice,
          quantity,
          status: "OPEN",
        },
      });
    }

    // Check open positions for take-profit
    for (const trade of openTrades) {
      const pnlPercent = trade.side === "BUY"
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      const takeProfit = config.takeProfit || 1.0; // default 1%
      const stopLoss = config.stopLoss || -2.0; // default -2%

      if (pnlPercent >= takeProfit || pnlPercent <= stopLoss) {
        const pnl = (currentPrice - trade.entryPrice) * trade.quantity * (trade.side === "BUY" ? 1 : -1);
        console.log(`[Grid] ${deployed.pair}: Closing ${trade.side} @ ${currentPrice}, PnL: ${pnl.toFixed(2)}`);

        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            exitPrice: currentPrice,
            pnl: Math.round(pnl * 100) / 100,
            status: "CLOSED",
            closedAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * DCA strategy: buy at regular intervals, more on dips
   */
  private async executeDCA(
    deployed: DeployedStrategy & { trades: Array<{ id: string; openedAt: Date }> },
    strategy: Strategy,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const intervalHours = config.intervalHours || 24; // buy every N hours
    const baseAmount = config.baseAmount || (deployed.investedAmount * 0.05); // 5% per buy
    const currentPrice = ticker.last || 0;

    if (!currentPrice) return;

    // Check last buy time
    const lastTrade = deployed.trades[0];
    if (lastTrade) {
      const hoursSinceLast = (Date.now() - lastTrade.openedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < intervalHours) return;
    }

    const quantity = baseAmount / currentPrice;

    console.log(`[DCA] ${deployed.pair}: BUY ${quantity.toFixed(6)} @ ${currentPrice}`);

    await prisma.trade.create({
      data: {
        deployedStrategyId: deployed.id,
        pair: deployed.pair,
        side: "BUY",
        entryPrice: currentPrice,
        quantity,
        status: "OPEN",
      },
    });
  }

  /**
   * Trend following: buy when price momentum is up
   */
  private async executeTrend(
    deployed: DeployedStrategy & { trades: Array<{ id: string; status: string; entryPrice: number; quantity: number; side: string }> },
    strategy: Strategy,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const currentPrice = ticker.last || 0;
    const change24h = ticker.percentage || 0;
    const threshold = config.momentumThreshold || 2; // 2% move triggers entry
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);

    if (!currentPrice) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");

    // Enter on strong momentum
    if (openTrades.length === 0 && Math.abs(change24h) > threshold) {
      const side = change24h > 0 ? "BUY" : "SELL";
      const quantity = positionSize / currentPrice;

      console.log(`[Trend] ${deployed.pair}: ${side} ${quantity.toFixed(6)} @ ${currentPrice} (24h: ${change24h.toFixed(1)}%)`);

      await prisma.trade.create({
        data: {
          deployedStrategyId: deployed.id,
          pair: deployed.pair,
          side,
          entryPrice: currentPrice,
          quantity,
          status: "OPEN",
        },
      });
    }

    // Check exits
    for (const trade of openTrades) {
      const pnlPercent = trade.side === "BUY"
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      const takeProfit = config.takeProfit || 5;
      const stopLoss = config.stopLoss || -3;

      if (pnlPercent >= takeProfit || pnlPercent <= stopLoss) {
        const pnl = (currentPrice - trade.entryPrice) * trade.quantity * (trade.side === "BUY" ? 1 : -1);

        await prisma.trade.update({
          where: { id: trade.id },
          data: { exitPrice: currentPrice, pnl: Math.round(pnl * 100) / 100, status: "CLOSED", closedAt: new Date() },
        });
      }
    }
  }

  /**
   * Mean reversion: trade when price deviates from average
   */
  private async executeMeanReversion(
    deployed: DeployedStrategy & { trades: Array<{ id: string; status: string; entryPrice: number; quantity: number; side: string }> },
    strategy: Strategy,
    ticker: Ticker,
  ): Promise<void> {
    const config = (deployed.config as Record<string, number>) || {};
    const currentPrice = ticker.last || 0;
    const change24h = ticker.percentage || 0;
    const deviationThreshold = config.deviationThreshold || -3; // Enter when -3% from mean
    const positionSize = config.positionSize || (deployed.investedAmount * 0.1);

    if (!currentPrice) return;

    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");

    // Buy on significant dip (mean reversion bet)
    if (openTrades.length === 0 && change24h < deviationThreshold) {
      const quantity = positionSize / currentPrice;
      console.log(`[MeanRev] ${deployed.pair}: BUY ${quantity.toFixed(6)} @ ${currentPrice} (deviation: ${change24h.toFixed(1)}%)`);

      await prisma.trade.create({
        data: {
          deployedStrategyId: deployed.id,
          pair: deployed.pair,
          side: "BUY",
          entryPrice: currentPrice,
          quantity,
          status: "OPEN",
        },
      });
    }

    // Check exits
    for (const trade of openTrades) {
      const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
      const takeProfit = config.takeProfit || 2;
      const stopLoss = config.stopLoss || -5;

      if (pnlPercent >= takeProfit || pnlPercent <= stopLoss) {
        const pnl = (currentPrice - trade.entryPrice) * trade.quantity;
        await prisma.trade.update({
          where: { id: trade.id },
          data: { exitPrice: currentPrice, pnl: Math.round(pnl * 100) / 100, status: "CLOSED", closedAt: new Date() },
        });
      }
    }
  }

  /**
   * Update the portfolio value for a deployed strategy
   */
  private async updatePortfolioValue(
    deployed: DeployedStrategy & { trades: Array<{ status: string; entryPrice: number; quantity: number; pnl: number; side: string }> },
    ticker: Ticker,
  ): Promise<void> {
    const currentPrice = ticker.last || 0;

    // Realized PnL from closed trades
    const closedTrades = await prisma.trade.findMany({
      where: { deployedStrategyId: deployed.id, status: "CLOSED" },
      select: { pnl: true },
    });
    const realizedPnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);

    // Unrealized PnL from open trades
    const openTrades = deployed.trades.filter((t) => t.status === "OPEN");
    const unrealizedPnl = openTrades.reduce((sum, t) => {
      const direction = t.side === "BUY" ? 1 : -1;
      return sum + (currentPrice - t.entryPrice) * t.quantity * direction;
    }, 0);

    const currentValue = deployed.investedAmount + realizedPnl + unrealizedPnl;

    await prisma.deployedStrategy.update({
      where: { id: deployed.id },
      data: { currentValue: Math.round(currentValue * 100) / 100 },
    });
  }
}

export const strategyWorker = new StrategyWorker();
