import ccxt, { type Exchange, type Order, type Balances, type Ticker, type OHLCV } from "ccxt";
import { AppError } from "../middleware/error-handler.js";
import { CoinDCXAdapter } from "./adapters/coindcx-adapter.js";

// Map our broker exchangeId to ccxt exchange class names
const EXCHANGE_MAP: Record<string, string> = {
  delta: "delta",
  binance: "binance",
  bybit: "bybit",
  okx: "okx",
  kucoin: "kucoin",
  bitget: "bitget",
  coindcx: "coindcx", // handled by CoinDCXAdapter, not a real CCXT class
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

    // CoinDCX is not in CCXT — use our custom adapter that mimics the Exchange interface.
    if (exchangeId === "coindcx") {
      const adapter = new CoinDCXAdapter(apiKey, apiSecret) as unknown as Exchange;
      this.instances.set(brokerId, adapter);
      return adapter;
    }

    const ccxtAny = ccxt as unknown as Record<string, new (config: Record<string, unknown>) => Exchange>;
    const ExchangeClass = ccxtAny[ccxtId];
    if (!ExchangeClass) {
      throw new AppError(400, `Exchange class not found for: ${ccxtId}`);
    }

    const config: Record<string, unknown> = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: {},
    };

    if (passphrase) {
      config.password = passphrase;
    }

    const exchange = new ExchangeClass(config);

    // Delta Exchange India — override URLs after construction
    if (exchangeId === "delta") {
      (exchange.urls as Record<string, unknown>)["api"] = {
        public: "https://api.india.delta.exchange",
        private: "https://api.india.delta.exchange",
      };
    }
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
