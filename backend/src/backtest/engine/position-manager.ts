import { randomUUID } from "crypto";
import type { Position, BacktestTrade, Candle } from "../types.js";
import { applySlippage, calculateFee, calculatePnl } from "./fee-model.js";

/** Platform-wide minimum margin per trade (USD). */
export const MIN_MARGIN_USD = 50;

interface PositionManagerConfig {
  makerFee: number;     // 0.0005 = 0.05%
  slippage: number;     // 0.0001 = 0.01%
}

export class PositionManager {
  private positions: Position[] = [];
  private closedTrades: BacktestTrade[] = [];
  private config: PositionManagerConfig;
  private _realizedPnl = 0; // running total — O(1) per candle instead of O(trades)

  constructor(config: PositionManagerConfig) {
    this.config = config;
  }

  /** O(1) — returns cached running total instead of summing all trades. */
  getRealizedPnl(): number {
    return this._realizedPnl;
  }

  getPositions(): Position[] {
    return [...this.positions];
  }

  getClosedTrades(): BacktestTrade[] {
    return this.closedTrades;
  }

  /** Open a new position */
  openPosition(
    candle: Candle,
    side: "BUY" | "SELL",
    qty: number,
    leverage: number,
    sl: number | null,
    tp: number | null,
  ): Position {
    const entryPrice = applySlippage(candle.close, side, this.config.slippage);

    const position: Position = {
      id: randomUUID(),
      entryTime: candle.timestamp,
      entryPrice,
      qty,
      side,
      leverage,
      sl,
      tp,
    };

    this.positions.push(position);
    return position;
  }

  /** Close a specific position */
  closePosition(
    position: Position,
    candle: Candle,
    exitPrice: number,
    exitReason: "TP" | "SL" | "SIGNAL" | "END",
  ): BacktestTrade {
    const closeSide = position.side === "BUY" ? "SELL" : "BUY";
    const slippedExitPrice = applySlippage(exitPrice, closeSide, this.config.slippage);

    const entryFee = calculateFee(position.entryPrice, position.qty, this.config.makerFee);
    const exitFee = calculateFee(slippedExitPrice, position.qty, this.config.makerFee);

    const pnl = calculatePnl(
      position.entryPrice,
      slippedExitPrice,
      position.qty,
      position.side,
      position.leverage,
      entryFee,
      exitFee,
    );

    const trade: BacktestTrade = {
      entry_id: position.id,
      entry_time: position.entryTime,
      entry_price: position.entryPrice,
      qty: position.qty,
      side: position.side,
      leverage: position.leverage,
      sl: position.sl,
      tp: position.tp,
      exit_id: randomUUID(),
      exit_time: candle.timestamp,
      exit_price: slippedExitPrice,
      pnl,
      fee: entryFee + exitFee,
      exit_reason: exitReason,
      status: "CLOSED",
    };

    this.closedTrades.push(trade);
    this._realizedPnl += trade.pnl;
    this.positions = this.positions.filter((p) => p.id !== position.id);
    return trade;
  }

  /** Check all positions for SL/TP hits against candle high/low */
  checkStopLossAndTakeProfit(candle: Candle): BacktestTrade[] {
    const triggered: BacktestTrade[] = [];

    // Iterate over a copy since closePosition modifies the array
    for (const pos of [...this.positions]) {
      if (pos.side === "BUY") {
        // Long: SL triggers when low <= sl, TP triggers when high >= tp
        if (pos.sl !== null && candle.low <= pos.sl) {
          triggered.push(this.closePosition(pos, candle, pos.sl, "SL"));
        } else if (pos.tp !== null && candle.high >= pos.tp) {
          triggered.push(this.closePosition(pos, candle, pos.tp, "TP"));
        }
      } else {
        // Short: SL triggers when high >= sl, TP triggers when low <= tp
        if (pos.sl !== null && candle.high >= pos.sl) {
          triggered.push(this.closePosition(pos, candle, pos.sl, "SL"));
        } else if (pos.tp !== null && candle.low <= pos.tp) {
          triggered.push(this.closePosition(pos, candle, pos.tp, "TP"));
        }
      }
    }

    return triggered;
  }

  /** Close all open positions at market price (end of backtest) */
  closeAllPositions(candle: Candle): BacktestTrade[] {
    const trades: BacktestTrade[] = [];
    for (const pos of [...this.positions]) {
      trades.push(this.closePosition(pos, candle, candle.close, "END"));
    }
    return trades;
  }

  /** Close all positions of a given side */
  closePositionsBySide(side: "BUY" | "SELL", candle: Candle): BacktestTrade[] {
    const trades: BacktestTrade[] = [];
    for (const pos of [...this.positions]) {
      if (pos.side === side) {
        trades.push(this.closePosition(pos, candle, candle.close, "SIGNAL"));
      }
    }
    return trades;
  }

  /**
   * Record a trade attempt that was skipped because the per-trade margin
   * (qty × entry) fell below the platform minimum. Produces a phantom trade
   * row with status=MARGIN_CALL so the trades table + metrics can surface it.
   */
  recordMarginCall(
    candle: Candle,
    side: "BUY" | "SELL",
    attemptedQty: number,
    attemptedPrice: number,
    leverage: number,
  ): BacktestTrade {
    const margin = attemptedQty * attemptedPrice;
    const trade: BacktestTrade = {
      entry_id: randomUUID(),
      entry_time: candle.timestamp,
      entry_price: attemptedPrice,
      qty: attemptedQty,
      side,
      leverage,
      sl: null,
      tp: null,
      exit_id: randomUUID(),
      exit_time: candle.timestamp,
      exit_price: attemptedPrice,
      pnl: 0,
      fee: 0,
      exit_reason: "MARGIN_CALL",
      status: "MARGIN_CALL",
      attempted_margin: margin,
    };
    this.closedTrades.push(trade);
    return trade;
  }

  /** Get unrealized PnL for all open positions */
  getUnrealizedPnl(currentPrice: number): number {
    return this.positions.reduce((total, pos) => {
      const rawPnl = pos.side === "BUY"
        ? (currentPrice - pos.entryPrice) * pos.qty * pos.leverage
        : (pos.entryPrice - currentPrice) * pos.qty * pos.leverage;
      return total + rawPnl;
    }, 0);
  }
}
