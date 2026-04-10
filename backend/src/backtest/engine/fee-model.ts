/** Apply slippage to a price */
export function applySlippage(price: number, side: "BUY" | "SELL", slippageRate: number): number {
  // Buy: price goes up (worse fill). Sell: price goes down (worse fill).
  return side === "BUY"
    ? price * (1 + slippageRate)
    : price * (1 - slippageRate);
}

/** Calculate fee for a trade */
export function calculateFee(price: number, qty: number, feeRate: number): number {
  return price * qty * feeRate;
}

/** Calculate PnL for a closed position */
export function calculatePnl(
  entryPrice: number,
  exitPrice: number,
  qty: number,
  side: "BUY" | "SELL",
  leverage: number,
  entryFee: number,
  exitFee: number,
): number {
  const rawPnl = side === "BUY"
    ? (exitPrice - entryPrice) * qty * leverage
    : (entryPrice - exitPrice) * qty * leverage;

  return rawPnl - entryFee - exitFee;
}
