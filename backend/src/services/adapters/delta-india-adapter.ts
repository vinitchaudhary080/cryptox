/**
 * Delta Exchange India adapter — mimics the subset of the CCXT Exchange
 * interface that CryptoX uses, talking to the India branch's REST v2 API.
 *
 * Platform policy: futures-only. This adapter only loads perpetual_futures
 * products from /v2/products and ignores spot, options, and dated futures.
 *
 * References:
 *   - https://docs.delta.exchange (same docs cover global + India; swap host)
 *   - Base: https://api.india.delta.exchange
 */
import crypto from "crypto";
import type { Balances, Market, OHLCV, Order, Ticker } from "ccxt";

const BASE = "https://api.india.delta.exchange";
const USER_AGENT = "cryptox/1.0";

interface DeltaProduct {
  id: number;
  symbol: string; // "BTCUSD"
  contract_type: string; // "perpetual_futures"
  state: string; // "live"
  underlying_asset: { symbol: string } | string;
  quoting_asset: { symbol: string } | string;
  settling_asset: { symbol: string } | string;
  tick_size: number | string;
  contract_value: number | string; // base units per 1 contract
  contract_unit_currency: string;
  min_size?: number | null;
  default_leverage?: number | string;
  initial_margin?: number | string;
  position_size_limit?: number | string;
}

interface DeltaProductsResponse {
  success: boolean;
  result: DeltaProduct[];
}

interface DeltaTickerEntry {
  symbol: string;
  close: number | string;
  mark_price: number | string;
  spot_price?: number | string;
  high: number | string;
  low: number | string;
  volume?: number | string;
  timestamp: number; // microseconds
  quotes?: { best_ask?: string; best_bid?: string };
}

interface DeltaTickerResponse {
  success: boolean;
  result: DeltaTickerEntry | DeltaTickerEntry[];
}

interface DeltaCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number; // unix seconds
}

interface DeltaCandlesResponse {
  success: boolean;
  result: DeltaCandle[];
}

interface DeltaWalletEntry {
  asset_id?: number;
  asset_symbol?: string;
  balance?: string | number;
  available_balance?: string | number;
  position_margin?: string | number;
  order_margin?: string | number;
  unrealized_pnl?: string | number;
}

interface DeltaWalletResponse {
  success: boolean;
  result: DeltaWalletEntry[];
}

interface DeltaOrder {
  id: number | string;
  product_id: number;
  product_symbol?: string;
  state: string; // "open" | "closed" | "cancelled"
  side: string; // "buy" | "sell"
  order_type: string; // "market_order" | "limit_order"
  size: number;
  unfilled_size?: number;
  average_fill_price?: number | string;
  limit_price?: number | string;
  paid_commission?: number | string;
  created_at?: string;
  updated_at?: string;
}

interface DeltaOrderResponse {
  success: boolean;
  result: DeltaOrder;
}

const TIMEFRAME_MAP: Record<string, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "1d": "1d",
  "7d": "7d",
  "1w": "7d",
  "30d": "30d",
};

function assetSymbol(a: { symbol: string } | string | undefined): string {
  if (!a) return "";
  return typeof a === "string" ? a : a.symbol;
}

export class DeltaIndiaAdapter {
  public readonly id = "delta";
  public readonly name = "Delta Exchange India";
  public urls: { api: { public: string; private: string } } = {
    api: { public: BASE, private: BASE },
  };
  public markets: Record<string, Market> = {};
  public symbols: string[] = [];

  // CCXT symbol "BTC/USD:USD" → product_id (int) and Delta symbol "BTCUSD"
  private symbolToProductId: Record<string, number> = {};
  private symbolToDeltaSymbol: Record<string, string> = {};
  private deltaSymbolToSymbol: Record<string, string> = {};
  private productCache: Record<string, DeltaProduct> = {};

  constructor(private readonly apiKey: string, private readonly apiSecret: string) {}

  // ─── HTTP helpers ──────────────────────────────────────────────────

  private async publicGet<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Delta GET ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Delta India HMAC: sign = method + timestamp(seconds) + requestPath +
   * queryString(no leading '?') + body. Signature is hex SHA256.
   */
  private sign(method: string, requestPath: string, query: string, body: string, timestamp: string): string {
    const payload = method + timestamp + requestPath + query + body;
    return crypto.createHmac("sha256", this.apiSecret).update(payload).digest("hex");
  }

  private async authedRequest<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: { query?: Record<string, string | number>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    // Delta signs the query string WITH a leading '?' (matches their Python SDK).
    const queryString = opts.query
      ? "?" +
        Object.entries(opts.query)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";
    const bodyString = opts.body ? JSON.stringify(opts.body) : "";
    const signature = this.sign(method, path, queryString, bodyString, timestamp);

    const url = `${BASE}${path}${queryString}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
        signature,
        timestamp,
        "User-Agent": USER_AGENT,
      },
      body: bodyString || undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Translate Delta India's opaque error codes into user-facing hints.
      if (text.includes("invalid_api_key")) {
        throw new Error(
          `Delta India rejected the API key (invalid_api_key). ` +
            `Make sure the key was created on india.delta.exchange (NOT the ` +
            `global delta.exchange site — they are separate accounts). ` +
            `Also verify the key has "Trading" permission enabled and no IP ` +
            `whitelist that blocks the server.`,
        );
      }
      if (text.includes("signature_expired") || text.includes("expired_signature")) {
        throw new Error(
          `Delta India: signature expired (server clock drift). Retry or ` +
            `sync the server clock.`,
        );
      }
      throw new Error(`Delta ${method} ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  // ─── Symbol mapping ────────────────────────────────────────────────

  private requireProduct(symbol: string): { productId: number; deltaSymbol: string } {
    const productId = this.symbolToProductId[symbol];
    const deltaSymbol = this.symbolToDeltaSymbol[symbol];
    if (!productId || !deltaSymbol) {
      throw new Error(
        `Delta India: unsupported symbol "${symbol}". ` +
          `Expected CCXT format "BASE/USD:USD" (e.g. "BTC/USD:USD").`,
      );
    }
    return { productId, deltaSymbol };
  }

  // ─── CCXT-compatible methods ───────────────────────────────────────

  async loadMarkets(): Promise<Record<string, Market>> {
    if (Object.keys(this.markets).length > 0) return this.markets;

    const res = await this.publicGet<DeltaProductsResponse>(
      "/v2/products?contract_types=perpetual_futures&states=live",
    );
    if (!res.success) throw new Error("Delta India: /v2/products returned success=false");

    for (const p of res.result) {
      const base = assetSymbol(p.underlying_asset);
      const quote = assetSymbol(p.quoting_asset);
      const settle = assetSymbol(p.settling_asset) || quote;
      if (!base || !quote) continue;
      const symbol = `${base}/${quote}:${settle}`;

      this.symbolToProductId[symbol] = p.id;
      this.symbolToDeltaSymbol[symbol] = p.symbol;
      this.deltaSymbolToSymbol[p.symbol] = symbol;
      this.productCache[symbol] = p;

      const contractSize = Number(p.contract_value) || 0;
      const tickSize = Number(p.tick_size) || 0;

      this.markets[symbol] = {
        id: p.symbol,
        symbol,
        base,
        quote,
        settle,
        baseId: base,
        quoteId: quote,
        settleId: settle,
        active: p.state === "live",
        type: "swap",
        spot: false,
        margin: false,
        swap: true,
        future: false,
        option: false,
        contract: true,
        // Inverse if settling in the base currency (rare on India), linear otherwise.
        linear: settle !== base,
        inverse: settle === base,
        contractSize,
        precision: {
          amount: 1, // size is in integer contracts
          price: tickSize,
        },
        limits: {
          amount: { min: 1, max: undefined },
          cost: { min: undefined, max: undefined },
          price: { min: undefined, max: undefined },
        },
        info: p as unknown as Record<string, unknown>,
      } as unknown as Market;
    }

    this.symbols = Object.keys(this.markets);
    return this.markets;
  }

  async fetchTickers(symbols?: string[]): Promise<Record<string, Ticker>> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const res = await this.publicGet<DeltaTickerResponse>("/v2/tickers");
    const list = Array.isArray(res.result) ? res.result : [res.result];
    const out: Record<string, Ticker> = {};
    for (const t of list) {
      const symbol = this.deltaSymbolToSymbol[t.symbol];
      if (!symbol) continue;
      if (symbols && symbols.length > 0 && !symbols.includes(symbol)) continue;
      out[symbol] = this.normalizeTicker(symbol, t);
    }
    return out;
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const { deltaSymbol } = this.requireProduct(symbol);
    const res = await this.publicGet<DeltaTickerResponse>(`/v2/tickers/${deltaSymbol}`);
    const t = Array.isArray(res.result) ? res.result[0] : res.result;
    if (!t) throw new Error(`Delta India: no ticker for ${symbol}`);
    return this.normalizeTicker(symbol, t);
  }

  private normalizeTicker(symbol: string, t: DeltaTickerEntry): Ticker {
    const last = Number(t.close);
    // Delta timestamps are MICROseconds — divide by 1000 for ms.
    const ts = Math.floor(Number(t.timestamp) / 1000);
    const bid = Number(t.quotes?.best_bid ?? last);
    const ask = Number(t.quotes?.best_ask ?? last);
    return {
      symbol,
      timestamp: ts,
      datetime: new Date(ts).toISOString(),
      high: Number(t.high),
      low: Number(t.low),
      bid,
      ask,
      last,
      close: last,
      previousClose: undefined,
      change: undefined,
      percentage: undefined,
      average: undefined,
      baseVolume: t.volume !== undefined ? Number(t.volume) : undefined,
      quoteVolume: undefined,
      info: t,
    } as unknown as Ticker;
  }

  async fetchOHLCV(symbol: string, timeframe = "1h", since?: number, limit = 100): Promise<OHLCV[]> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const { deltaSymbol } = this.requireProduct(symbol);
    const resolution = TIMEFRAME_MAP[timeframe] || timeframe;

    const tfSeconds = this.timeframeToSeconds(resolution);
    const now = Math.floor(Date.now() / 1000);
    const start = since !== undefined ? Math.floor(since / 1000) : now - tfSeconds * limit;

    const params = new URLSearchParams({
      symbol: deltaSymbol,
      resolution,
      start: String(start),
      end: String(now),
    });
    const res = await this.publicGet<DeltaCandlesResponse>(
      `/v2/history/candles?${params.toString()}`,
    );
    const rows = res.result ?? [];
    return rows
      .map((c) => [c.time * 1000, c.open, c.high, c.low, c.close, c.volume] as OHLCV)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .slice(-limit);
  }

  private timeframeToSeconds(tf: string): number {
    const unit = tf.slice(-1);
    const n = parseInt(tf.slice(0, -1), 10) || 1;
    if (unit === "m") return n * 60;
    if (unit === "h") return n * 3600;
    if (unit === "d") return n * 86400;
    if (unit === "w") return n * 604800;
    return 3600;
  }

  // ─── Public method used by ExchangeService for the deploy dialog ───

  async getInstrumentInfo(symbol: string): Promise<{
    minQty: number;
    minNotional: number;
    qtyIncrement: number;
    priceIncrement: number;
    maxLeverage: number;
  }> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const product = this.productCache[symbol];
    if (!product) {
      throw new Error(`Delta India: no product cached for ${symbol}`);
    }
    const contractValue = Number(product.contract_value) || 0;
    const tickSize = Number(product.tick_size) || 0;

    // Min order = 1 contract; min notional = contract_value × current price
    let currentPrice = 0;
    try {
      const t = await this.fetchTicker(symbol);
      currentPrice = Number(t.last) || 0;
    } catch {
      currentPrice = 0;
    }

    // Delta's max leverage is governed by initial_margin %: max = 100/initial_margin
    const initialMarginPct = Number(product.initial_margin) || 0;
    const maxLeverage = initialMarginPct > 0 ? Math.floor(100 / initialMarginPct) : 100;

    return {
      minQty: contractValue, // 1 contract worth of base currency
      minNotional: contractValue * currentPrice,
      qtyIncrement: contractValue, // step is also 1 contract
      priceIncrement: tickSize,
      maxLeverage,
    };
  }

  // ─── Private endpoints ─────────────────────────────────────────────

  async fetchBalance(): Promise<Balances> {
    const res = await this.authedRequest<DeltaWalletResponse>("GET", "/v2/wallet/balances");

    const free: Record<string, number> = {};
    const used: Record<string, number> = {};
    const total: Record<string, number> = {};
    const perCurrency: Record<string, { free: number; used: number; total: number }> = {};

    for (const w of res.result ?? []) {
      const ccy = (w.asset_symbol || "").toUpperCase();
      if (!ccy) continue;
      const available = Number(w.available_balance ?? 0);
      const locked = Number(w.position_margin ?? 0) + Number(w.order_margin ?? 0);
      const totalVal = Number(w.balance ?? available + locked);
      free[ccy] = available;
      used[ccy] = locked;
      total[ccy] = totalVal;
      perCurrency[ccy] = { free: available, used: locked, total: totalVal };
    }

    return {
      info: res,
      free,
      used,
      total,
      ...perCurrency,
    } as unknown as Balances;
  }

  async createOrder(
    symbol: string,
    type: "market" | "limit",
    side: "buy" | "sell",
    amount: number,
    price?: number,
    params: Record<string, unknown> = {},
  ): Promise<Order> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const { productId } = this.requireProduct(symbol);
    const product = this.productCache[symbol];

    // Delta sizes are integer contracts. Caller passes base-currency amount,
    // we convert to contracts using contract_value. floor to never over-order.
    const contractValue = Number(product?.contract_value) || 1;
    const size = Math.max(0, Math.floor(amount / contractValue));
    if (size === 0) {
      throw new Error(
        `Delta India: amount ${amount} ${symbol.split("/")[0]} below 1 contract (${contractValue}).`,
      );
    }

    // Set leverage if caller passed one (Delta wants this set per-product, not per-order).
    const leverage = Number(params.leverage ?? 0);
    if (leverage > 0) {
      try {
        await this.authedRequest("POST", `/v2/products/${productId}/orders/leverage`, {
          body: { leverage: String(leverage) },
        });
      } catch (err) {
        // Non-fatal — order may still go through with previous leverage setting.
        console.warn(`[Delta] setLeverage failed for ${symbol}:`, (err as Error).message);
      }
    }

    const orderBody: Record<string, unknown> = {
      product_id: productId,
      size,
      side,
      order_type: type === "market" ? "market_order" : "limit_order",
    };
    if (type === "limit" && price !== undefined) {
      orderBody.limit_price = String(price);
    }

    const res = await this.authedRequest<DeltaOrderResponse>("POST", "/v2/orders", { body: orderBody });
    if (!res.success || !res.result) {
      throw new Error("Delta India: create order returned no result");
    }
    return this.normalizeOrder(symbol, res.result);
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<unknown> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    if (!symbol) throw new Error("Delta India: cancelOrder requires symbol");
    const { productId } = this.requireProduct(symbol);
    return this.authedRequest("DELETE", "/v2/orders", {
      body: { id: Number(orderId), product_id: productId },
    });
  }

  async fetchOpenOrders(_symbol?: string): Promise<Order[]> {
    return [];
  }

  async fetchClosedOrders(_symbol?: string, _since?: number, _limit = 50): Promise<Order[]> {
    return [];
  }

  async fetchPositions(_symbols?: string[]): Promise<unknown[]> {
    try {
      const res = await this.authedRequest<{ success: boolean; result: unknown[] }>(
        "GET",
        "/v2/positions/margined",
      );
      return res.result ?? [];
    } catch {
      return [];
    }
  }

  private normalizeOrder(symbol: string, o: DeltaOrder): Order {
    const product = this.productCache[symbol];
    const contractValue = Number(product?.contract_value) || 1;
    const filledContracts = Number(o.size) - Number(o.unfilled_size ?? 0);
    const filled = filledContracts * contractValue;
    const total = Number(o.size) * contractValue;
    const price = Number(o.average_fill_price ?? o.limit_price ?? 0);
    const ts = o.updated_at
      ? Date.parse(o.updated_at)
      : o.created_at
        ? Date.parse(o.created_at)
        : Date.now();
    return {
      id: String(o.id),
      symbol,
      type: o.order_type === "market_order" ? "market" : "limit",
      side: o.side as "buy" | "sell",
      price,
      average: price,
      amount: total,
      filled,
      remaining: total - filled,
      cost: price * filled,
      status: this.mapStatus(o.state),
      fee: { cost: Number(o.paid_commission ?? 0), currency: symbol.split(":")[1] || "USD" },
      timestamp: ts,
      datetime: new Date(ts).toISOString(),
      info: o,
    } as unknown as Order;
  }

  private mapStatus(s: string): "open" | "closed" | "canceled" {
    const v = s.toLowerCase();
    if (v === "closed" || v === "filled") return "closed";
    if (v === "cancelled" || v === "canceled" || v === "rejected") return "canceled";
    return "open";
  }
}
