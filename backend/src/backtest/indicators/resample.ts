import type { Candle } from "../types.js";

/**
 * Resample 1-minute candles into higher timeframe candles.
 * @param candles - 1-minute candles (must be sorted by timestamp ascending)
 * @param intervalMinutes - target interval (5 for 5m, 15 for 15m, etc.)
 */
export function resampleCandles(candles: Candle[], intervalMinutes: number): Candle[] {
  if (candles.length === 0) return [];

  const intervalMs = intervalMinutes * 60_000;
  const resampled: Candle[] = [];

  let bucketStart = Math.floor(candles[0].timestamp / intervalMs) * intervalMs;
  let open = candles[0].open;
  let high = candles[0].high;
  let low = candles[0].low;
  let close = candles[0].close;
  let volume = 0;

  for (const candle of candles) {
    const bucket = Math.floor(candle.timestamp / intervalMs) * intervalMs;

    if (bucket !== bucketStart) {
      // Push completed bucket
      const d = new Date(bucketStart);
      resampled.push({
        timestamp: bucketStart,
        date: d.toISOString().slice(0, 10),
        time: d.toISOString().slice(11, 19),
        open,
        high,
        low,
        close,
        volume,
      });

      // Start new bucket
      bucketStart = bucket;
      open = candle.open;
      high = candle.high;
      low = candle.low;
      volume = 0;
    }

    high = Math.max(high, candle.high);
    low = Math.min(low, candle.low);
    close = candle.close;
    volume += candle.volume;
  }

  // Push last bucket
  const d = new Date(bucketStart);
  resampled.push({
    timestamp: bucketStart,
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 19),
    open,
    high,
    low,
    close,
    volume,
  });

  return resampled;
}
