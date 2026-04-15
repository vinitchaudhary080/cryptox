/**
 * One-off script: fetch 3 years of 1m historical data for the 8 new backtest
 * coins added in the 17-coin batch (BTC/ETH/SOL/XRP/DOGE/ADA/DOT/LINK/AVAX
 * were already synced). Existing CSVs are not touched.
 *
 * Run with: npx tsx scripts/fetch-new-coins.ts
 * Safe to re-run — fetcher appends only candles newer than the last CSV row.
 */
import { BACKTEST_COINS } from "../src/backtest/types.js";
import { fetchHistoricalData } from "../src/backtest/data/historical-fetcher.js";

const NEW_COINS_SHORT = new Set(["BNB", "PAXG", "LTC", "UNI", "NEAR", "INJ", "WIF", "AAVE"]);

async function main() {
  const toFetch = BACKTEST_COINS.filter((c) => NEW_COINS_SHORT.has(c.short));
  console.log(`[fetch-new-coins] ${toFetch.length} coins queued:`, toFetch.map((c) => c.short).join(", "));

  for (const coin of toFetch) {
    const startedAt = Date.now();
    console.log(`\n[fetch-new-coins] ━━━ ${coin.short} (${coin.name}) ━━━`);
    let lastLogged = 0;
    try {
      const result = await fetchHistoricalData(coin, (p) => {
        // Log every ~50k candles to keep output readable.
        if (p.fetched - lastLogged >= 50_000) {
          lastLogged = p.fetched;
          const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
          console.log(
            `[fetch-new-coins]   ${coin.short}: ${p.fetched.toLocaleString()} candles @ ${p.lastDate} (${mins} min)`,
          );
        }
      });
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      if (result.error) {
        console.error(`[fetch-new-coins] ✗ ${coin.short} FAILED after ${mins} min: ${result.error}`);
      } else {
        console.log(
          `[fetch-new-coins] ✓ ${coin.short} done: ${result.totalCandles.toLocaleString()} candles in ${mins} min`,
        );
      }
    } catch (err) {
      console.error(`[fetch-new-coins] ✗ ${coin.short} FAILED:`, (err as Error).message);
    }
  }
  console.log(`\n[fetch-new-coins] all done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fetch-new-coins] fatal:", err);
  process.exit(1);
});
