import ccxt, { type Exchange, type Order, type Balances, type Ticker, type OHLCV } from "ccxt";
import { AppError } from "../middleware/error-handler.js";
import { CoinDCXAdapter } from "./adapters/coindcx-adapter.js";
import { DeltaIndiaAdapter } from "./adapters/delta-india-adapter.js";
import { Pi42Adapter } from "./adapters/pi42-adapter.js";

// CryptoX supports exactly 4 brokers, all futures-only.
//   coindcx  — custom adapter (CoinDCX futures REST)
//   delta    — custom adapter (Delta India v2 REST)
//   pi42     — custom adapter (Pi42 fapi REST)
//   bybit    — CCXT, category=linear (USDT perps)
const EXCHANGE_MAP: Record<string, string> = {
  bybit: "bybit",
  coindcx: "coindcx", // handled by CoinDCXAdapter
  delta: "delta-india", // handled by DeltaIndiaAdapter
  pi42: "pi42", // handled by Pi42Adapter
};

export class ExchangeService {
  private instances = new Map<string, Exchange>();

  /**
   * Get or create a CCXT exchange instance for a broker
   */
  getExchange(brokerId: string, exchangeId: string, apiKey: string, apiSecret: string, passphrase?: string): Exchange {
    if (this.instances.has(brokerId)) {
      return this.instances.get(brokerId)!;
    }

    const ccxtId = EXCHANGE_MAP[exchangeId];
    if (!ccxtId) {
      throw new AppError(400, `Unsupported exchange: ${exchangeId}`);
    }

    // Custom adapters for venues CCXT doesn't cover (or covers poorly).
    if (exchangeId === "coindcx") {
      const adapter = new CoinDCXAdapter(apiKey, apiSecret) as unknown as Exchange;
      this.instances.set(brokerId, adapter);
      return adapter;
    }
    if (exchangeId === "delta") {
      const adapter = new DeltaIndiaAdapter(apiKey, apiSecret) as unknown as Exchange;
      this.instances.set(brokerId, adapter);
      return adapter;
    }
    if (exchangeId === "pi42") {
      const adapter = new Pi42Adapter(apiKey, apiSecret) as unknown as Exchange;
      this.instances.set(brokerId, adapter);
      return adapter;
    }

    // Bybit goes through CCXT with category=linear for USDT perps.
    if (exchangeId !== "bybit") {
      throw new AppError(400, `Unsupported exchange: ${exchangeId}`);
    }
    const ccxtAny = ccxt as unknown as Record<string, new (config: Record<string, unknown>) => Exchange>;
    const ExchangeClass = ccxtAny.bybit;
    if (!ExchangeClass) {
      throw new AppError(500, "ccxt.bybit not available");
    }
    const exchange = new ExchangeClass({
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {
        defaultType: "swap", // perpetual futures
        defaultSubType: "linear", // USDT-margined
      },
    });
    this.instances.set(brokerId, exchange);
    return exchange;
  }

  /**
   * Remove cached exchange instance
   */
  removeExchange(brokerId: string): void {
    this.instances.delete(brokerId);
  }

  /**
   * Test connection by fetching balance
   * Returns { ok, error } — ok=true means credentials work
   */
  async testConnection(exchange: Exchange): Promise<{ ok: boolean; error?: string }> {
    try {
      await exchange.fetchBalance();
      return { ok: true };
    } catch (err) {
      const msg = (err as Error).message || "";
      console.error("[ExchangeService] Connection test failed:", msg);

      // IP whitelist error — credentials are valid, just IP blocked
      if (msg.includes("ip_not_whitelisted")) {
        return { ok: true, error: "IP not whitelisted — add your IP on the exchange dashboard" };
      }

      return { ok: false, error: msg };
    }
  }

  /**
   * Fetch wallet balances
   */
  async getBalance(exchange: Exchange): Promise<Balances> {
    try {
      return await exchange.fetchBalance();
    } catch (err) {
      throw new AppError(502, `Failed to fetch balance: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch ticker for a symbol
   */
  async getTicker(exchange: Exchange, symbol: string): Promise<Ticker> {
    try {
      return await exchange.fetchTicker(symbol);
    } catch (err) {
      throw new AppError(502, `Failed to fetch ticker for ${symbol}: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch multiple tickers
   */
  async getTickers(exchange: Exchange, symbols?: string[]): Promise<Record<string, Ticker>> {
    try {
      return await exchange.fetchTickers(symbols);
    } catch (err) {
      throw new AppError(502, `Failed to fetch tickers: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch available markets/pairs
   */
  async getMarkets(exchange: Exchange) {
    try {
      await exchange.loadMarkets();
      return exchange.markets;
    } catch (err) {
      throw new AppError(502, `Failed to load markets: ${(err as Error).message}`);
    }
  }

  /**
   * Return a flat list of CCXT-style perp symbols this broker supports,
   * suitable for the deploy dialog pair picker.
   */
  async getPairs(exchange: Exchange): Promise<string[]> {
    try {
      await exchange.loadMarkets();
      const out: string[] = [];
      for (const [symbol, market] of Object.entries(exchange.markets ?? {})) {
        const m = market as { swap?: boolean; contract?: boolean; active?: boolean };
        if (m?.active === false) continue;
        if (m?.swap || m?.contract) out.push(symbol);
      }
      return out.sort();
    } catch (err) {
      throw new AppError(502, `Failed to load pairs: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch per-instrument trading rules used by the deploy dialog to validate
   * user input live (min notional, qty step, max leverage etc.).
   */
  async getInstrumentInfo(
    exchange: Exchange,
    symbol: string,
  ): Promise<{
    symbol: string;
    minQty: number;
    minNotional: number;
    qtyIncrement: number;
    priceIncrement: number;
    maxLeverage: number;
  }> {
    try {
      await exchange.loadMarkets();
      const market = exchange.markets?.[symbol] as
        | {
            limits?: { amount?: { min?: number }; cost?: { min?: number } };
            precision?: { amount?: number; price?: number };
            info?: Record<string, unknown>;
          }
        | undefined;

      // Custom adapters (CoinDCXAdapter, future Delta/Pi42) expose
      // getInstrumentInfo() directly because they have richer data.
      const ad = exchange as unknown as {
        getInstrumentInfo?: (s: string) => Promise<{
          minQty: number;
          minNotional: number;
          qtyIncrement: number;
          priceIncrement: number;
          maxLeverage: number;
        }>;
      };
      if (typeof ad.getInstrumentInfo === "function") {
        const info = await ad.getInstrumentInfo(symbol);
        return { symbol, ...info };
      }

      // CCXT fallback — use limits + precision from loadMarkets()
      const minQty = Number(market?.limits?.amount?.min ?? 0);
      const minNotional = Number(market?.limits?.cost?.min ?? 0);
      const qtyIncrement = Number(market?.precision?.amount ?? 0);
      const priceIncrement = Number(market?.precision?.price ?? 0);
      const info = (market?.info ?? {}) as Record<string, unknown>;
      const maxLeverage = Number(
        info.maxLeverage ?? info.max_leverage ?? info.leverageMax ?? 100,
      );
      return { symbol, minQty, minNotional, qtyIncrement, priceIncrement, maxLeverage };
    } catch (err) {
      throw new AppError(502, `Failed to fetch instrument info: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch OHLCV candles
   */
  async getCandles(exchange: Exchange, symbol: string, timeframe = "1h", limit = 100): Promise<OHLCV[]> {
    try {
      return await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (err) {
      throw new AppError(502, `Failed to fetch candles: ${(err as Error).message}`);
    }
  }

  /**
   * Place a market order. `params.leverage` is forwarded to adapters that
   * support futures leverage (CoinDCX futures adapter).
   */
  async placeMarketOrder(
    exchange: Exchange,
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    params: Record<string, unknown> = {},
  ): Promise<Order> {
    try {
      return await exchange.createOrder(symbol, "market", side, amount, undefined, params);
    } catch (err) {
      throw new AppError(502, `Failed to place market order: ${(err as Error).message}`);
    }
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(
    exchange: Exchange,
    symbol: string,
    side: "buy" | "sell",
    amount: number,
    price: number,
    params: Record<string, unknown> = {},
  ): Promise<Order> {
    try {
      return await exchange.createOrder(symbol, "limit", side, amount, price, params);
    } catch (err) {
      throw new AppError(502, `Failed to place limit order: ${(err as Error).message}`);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(exchange: Exchange, orderId: string, symbol: string): Promise<void> {
    try {
      await exchange.cancelOrder(orderId, symbol);
    } catch (err) {
      throw new AppError(502, `Failed to cancel order: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch open orders
   */
  async getOpenOrders(exchange: Exchange, symbol?: string): Promise<Order[]> {
    try {
      return await exchange.fetchOpenOrders(symbol);
    } catch (err) {
      throw new AppError(502, `Failed to fetch open orders: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch order history
   */
  async getOrderHistory(exchange: Exchange, symbol?: string, limit = 50): Promise<Order[]> {
    try {
      return await exchange.fetchClosedOrders(symbol, undefined, limit);
    } catch (err) {
      throw new AppError(502, `Failed to fetch order history: ${(err as Error).message}`);
    }
  }

  /**
   * Fetch positions (for derivatives exchanges)
   */
  async getPositions(exchange: Exchange, symbols?: string[]) {
    try {
      if (typeof exchange.fetchPositions === "function") {
        return await exchange.fetchPositions(symbols);
      }
      return [];
    } catch (err) {
      throw new AppError(502, `Failed to fetch positions: ${(err as Error).message}`);
    }
  }
}

// Singleton
export const exchangeService = new ExchangeService();
