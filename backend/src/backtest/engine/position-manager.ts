import { randomUUID } from "crypto";
import type { Position, BacktestTrade, Candle, TpLevel } from "../types.js";
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

  /** Open a new position.
   *
   *  `tps` is the optional multi-TP ladder. When provided, `tp` is the
   *  FIRST tp price (kept on the position only as a label / display); the
   *  engine consults `tps` for partial-close logic. When `tps` is empty or
   *  omitted, behaviour is single-TP (the legacy `tp` value).
   */
  openPosition(
    candle: Candle,
    side: "BUY" | "SELL",
    qty: number,
    leverage: number,
    sl: number | null,
    tp: number | null,
    tps: TpLevel[] = [],
  ): Position {
    const entryPrice = applySlippage(candle.close, side, this.config.slippage);

    const position: Position = {
      id: randomUUID(),
      entryTime: candle.timestamp,
      entryPrice,
      qty,
      originalQty: qty,
      side,
      leverage,
      sl,
      tp,
      tps: [...tps],
    };

    this.positions.push(position);
    return position;
  }

  /** Close a specific position fully. */
  closePosition(
    position: Position,
    candle: Candle,
    exitPrice: number,
    exitReason: "TP" | "SL" | "SIGNAL" | "END" | "LIQUIDATED" | string,
  ): BacktestTrade {
    return this.recordExitLeg(position, candle, exitPrice, position.qty, exitReason, false);
  }

  /** Partially close a position. Reduces `position.qty` by `closeQty` and
   *  records a partial trade leg sharing the position's entry_id. The
   *  position remains in the open-positions list as long as qty > 0. */
  partialClosePosition(
    position: Position,
    candle: Candle,
    exitPrice: number,
    closeQty: number,
    exitReason: "TP" | "SL" | "SIGNAL" | "END" | "LIQUIDATED" | string,
    tpLevel?: number,
  ): BacktestTrade {
    const safeQty = Math.min(closeQty, position.qty);
    const isFinalLeg = safeQty >= position.qty - 1e-12;
    const trade = this.recordExitLeg(
      position,
      candle,
      exitPrice,
      safeQty,
      exitReason,
      !isFinalLeg,
      tpLevel,
    );
    return trade;
  }

  /** Internal: records a trade row for a (full or partial) exit leg.
   *  Updates `position.qty` and removes the position when fully closed.
   *  The fee model bills both entry and exit fees on the LEG qty — i.e.,
   *  fees scale proportionally with the partial close.
   */
  private recordExitLeg(
    position: Position,
    candle: Candle,
    exitPrice: number,
    legQty: number,
    exitReason: "TP" | "SL" | "SIGNAL" | "END" | "LIQUIDATED" | string,
    isPartial: boolean,
    tpLevel?: number,
  ): BacktestTrade {
    const closeSide = position.side === "BUY" ? "SELL" : "BUY";
    const slippedExitPrice = applySlippage(exitPrice, closeSide, this.config.slippage);

    const entryFee = calculateFee(position.entryPrice, legQty, this.config.makerFee);
    const exitFee = calculateFee(slippedExitPrice, legQty, this.config.makerFee);

    const pnl = calculatePnl(
      position.entryPrice,
      slippedExitPrice,
      legQty,
      position.side,
      position.leverage,
      entryFee,
      exitFee,
    );

    const trade: BacktestTrade = {
      entry_id: position.id,
      entry_time: position.entryTime,
      entry_price: position.entryPrice,
      qty: legQty,
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
    if (tpLevel !== undefined) trade.tp_level = tpLevel;
    if (isPartial) trade.partial = true;

    this.closedTrades.push(trade);
    this._realizedPnl += trade.pnl;

    position.qty -= legQty;
    if (position.qty <= 1e-12) {
      this.positions = this.positions.filter((p) => p.id !== position.id);
    }
    return trade;
  }

  /**
   * Liquidation price (futures, isolated margin, ~5% maintenance buffer).
   *   LONG  — price drops to ~(1 − 0.95/leverage) × entry → position wiped
   *   SHORT — price rises to ~(1 + 0.95/leverage) × entry → position wiped
   * Returns null when leverage = 1 (spot-like, no liquidation).
   */
  private liquidationPrice(pos: Position): number | null {
    if (pos.leverage <= 1) return null;
    const buffer = 0.95 / pos.leverage;
    return pos.side === "BUY"
      ? pos.entryPrice * (1 - buffer)
      : pos.entryPrice * (1 + buffer);
  }

  /**
   * Check all positions for LIQUIDATION (first — most urgent) then SL/TP
   * against candle high/low. A liquidation event force-closes at the liq
   * price regardless of SL/TP placement.
   */
  checkStopLossAndTakeProfit(candle: Candle): BacktestTrade[] {
    const triggered: BacktestTrade[] = [];

    // Iterate over a copy since closePosition modifies the array
    for (const pos of [...this.positions]) {
      // ── Liquidation check (runs first; beats SL/TP) ──────────
      const liq = this.liquidationPrice(pos);
      if (liq !== null) {
        if (pos.side === "BUY" && candle.low <= liq) {
          triggered.push(this.closePosition(pos, candle, liq, "LIQUIDATED"));
          continue;
        }
        if (pos.side === "SELL" && candle.high >= liq) {
          triggered.push(this.closePosition(pos, candle, liq, "LIQUIDATED"));
          continue;
        }
      }

      if (pos.side === "BUY") {
        // Long: SL triggers when low <= sl, TPs trigger when high >= price
        if (pos.sl !== null && candle.low <= pos.sl) {
          triggered.push(this.closePosition(pos, candle, pos.sl, "SL"));
          continue;
        }

        // Multi-TP ladder (preferred). Levels are stored in trigger order
        // (ascending for longs); fire each one whose price the bar swept
        // through, oldest first. Closed levels are removed from the list.
        if (pos.tps!.length > 0) {
          // Snapshot the level count BEFORE we start firing — so tp_level
          // numbers stay 1-indexed by ORIGINAL ladder position even after
          // earlier levels have already been removed in prior bars.
          const levelOffset = (pos.originalQty! > 0 ? this.tpLevelOffset(pos) : 0);
          let i = 0;
          while (i < pos.tps!.length) {
            const t = pos.tps![i];
            if (candle.high >= t.price) {
              const closeQty = Math.min(pos.originalQty! * t.portion, pos.qty);
              const tpLevel = levelOffset + i + 1;
              triggered.push(
                this.partialClosePosition(pos, candle, t.price, closeQty, "TP", tpLevel),
              );
              pos.tps!.splice(i, 1);
              if (pos.qty <= 1e-12) break;
              continue; // re-evaluate same i (now next level after splice)
            }
            i++;
          }
        } else if (pos.tp !== null && candle.high >= pos.tp) {
          // Legacy single-TP path
          triggered.push(this.closePosition(pos, candle, pos.tp, "TP"));
        }
      } else {
        // Short: SL triggers when high >= sl, TPs trigger when low <= price
        if (pos.sl !== null && candle.high >= pos.sl) {
          triggered.push(this.closePosition(pos, candle, pos.sl, "SL"));
          continue;
        }

        if (pos.tps!.length > 0) {
          const levelOffset = (pos.originalQty! > 0 ? this.tpLevelOffset(pos) : 0);
          let i = 0;
          while (i < pos.tps!.length) {
            const t = pos.tps![i];
            if (candle.low <= t.price) {
              const closeQty = Math.min(pos.originalQty! * t.portion, pos.qty);
              const tpLevel = levelOffset + i + 1;
              triggered.push(
                this.partialClosePosition(pos, candle, t.price, closeQty, "TP", tpLevel),
              );
              pos.tps!.splice(i, 1);
              if (pos.qty <= 1e-12) break;
              continue;
            }
            i++;
          }
        } else if (pos.tp !== null && candle.low <= pos.tp) {
          triggered.push(this.closePosition(pos, candle, pos.tp, "TP"));
        }
      }
    }

    return triggered;
  }

  /** How many TP levels of this position have ALREADY been hit (and thus
   *  removed from `pos.tps!`). Used to keep `tp_level` numbering stable
   *  across bars: TP1 always means the strategy's first declared level. */
  private tpLevelOffset(pos: Position): number {
    return this.closedTrades.filter(
      (t) => t.entry_id === pos.id && t.exit_reason === "TP",
    ).length;
  }

  /** Close all open positions. Default reason "END" is for end-of-backtest
   *  finalization. Strategy-triggered CLOSE_ALL signals should pass the
   *  strategy's reason text instead so the trade log explains the cause. */
  closeAllPositions(candle: Candle, reason: string = "END"): BacktestTrade[] {
    const trades: BacktestTrade[] = [];
    for (const pos of [...this.positions]) {
      trades.push(this.closePosition(pos, candle, candle.close, reason));
    }
    return trades;
  }

  /** Close all positions of a given side. `reason` defaults to the
   *  generic "SIGNAL" bucket; callers SHOULD pass the strategy's actual
   *  reason text so the trade log explains why the close fired (e.g.
   *  "5m ST flipped RED (ADX 25.6)"). */
  closePositionsBySide(
    side: "BUY" | "SELL",
    candle: Candle,
    reason: string = "SIGNAL",
  ): BacktestTrade[] {
    const trades: BacktestTrade[] = [];
    for (const pos of [...this.positions]) {
      if (pos.side === side) {
        trades.push(this.closePosition(pos, candle, candle.close, reason));
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
    equityAtCall: number,
  ): BacktestTrade {
    // qty is the leveraged notional-qty; actual margin = notional / leverage.
    const notional = attemptedQty * attemptedPrice;
    const margin = notional / Math.max(1, leverage);
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
      equity_at_call: equityAtCall,
    };
    this.closedTrades.push(trade);
    return trade;
  }

  /** Get unrealized PnL for all open positions (qty is already leveraged). */
  getUnrealizedPnl(currentPrice: number): number {
    return this.positions.reduce((total, pos) => {
      const rawPnl = pos.side === "BUY"
        ? (currentPrice - pos.entryPrice) * pos.qty
        : (pos.entryPrice - currentPrice) * pos.qty;
      return total + rawPnl;
    }, 0);
  }
}
