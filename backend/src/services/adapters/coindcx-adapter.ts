/**
 * CoinDCX adapter — mimics the subset of the CCXT Exchange interface that
 * CryptoX actually uses, talking to CoinDCX's REST API directly.
 *
 * Reference: https://docs.coindcx.com
 */
import crypto from "crypto";
import type { Balances, Market, OHLCV, Order, Ticker } from "ccxt";

const PUBLIC_BASE = "https://public.coindcx.com";
const PRIVATE_BASE = "https://api.coindcx.com";

interface CoinDCXMarketDetail {
  symbol: string; // e.g. "BTCUSDT"
  pair: string; // e.g. "B-BTC_USDT"
  target_currency_short_name: string; // "BTC"
  base_currency_short_name: string; // "USDT"
  ecode: string; // "B" / "I" / "HB" / etc
  status?: string;
  min_quantity?: number;
  min_notional?: number;
  step?: number;
}

interface CoinDCXTickerEntry {
  market: string;
  change_24_hour: string;
  high: string;
  low: string;
  volume: string;
  last_price: string;
  bid: string;
  ask: string;
  timestamp: number;
}

interface CoinDCXBalance {
  currency: string;
  balance: string;
  locked_balance: string;
}

interface CoinDCXOrder {
  id: string;
  status: string;
  market: string;
  order_type: string;
  side: string;
  price_per_unit: number;
  total_quantity: number;
  remaining_quantity: number;
  avg_price: number;
  fee_amount: number;
  created_at?: string;
  updated_at?: string;
  timestamp?: number;
}

interface CoinDCXOrdersResponse {
  orders?: CoinDCXOrder[];
}

interface CoinDCXCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAME_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "8h": "8h",
  "1d": "1d",
  "3d": "3d",
  "1w": "1w",
  "1M": "1M",
};

export class CoinDCXAdapter {
  public readonly id = "coindcx";
  public readonly name = "CoinDCX";
  public urls: { api: { public: string; private: string } } = {
    api: { public: PUBLIC_BASE, private: PRIVATE_BASE },
  };
  public markets: Record<string, Market> = {};
  public symbols: string[] = [];

  private symbolToPair: Record<string, string> = {};
  private symbolToMarket: Record<string, string> = {};
  private marketToSymbol: Record<string, string> = {};

  constructor(private readonly apiKey: string, private readonly apiSecret: string) {}

  // ─── HTTP helpers ──────────────────────────────────────────────────

  private async publicGet<T>(base: string, path: string): Promise<T> {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CoinDCX GET ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  private async privatePost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const payload = { ...body, timestamp: Date.now() };
    const json = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", this.apiSecret).update(json).digest("hex");

    const res = await fetch(`${PRIVATE_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-APIKEY": this.apiKey,
        "X-AUTH-SIGNATURE": signature,
      },
      body: json,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CoinDCX POST ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  // ─── Symbol mapping ────────────────────────────────────────────────

  private requirePair(symbol: string): string {
    const pair = this.symbolToPair[symbol];
    if (!pair) throw new Error(`CoinDCX: unknown symbol ${symbol}`);
    return pair;
  }

  private requireMarket(symbol: string): string {
    const market = this.symbolToMarket[symbol];
    if (!market) throw new Error(`CoinDCX: unknown symbol ${symbol}`);
    return market;
  }

  // ─── CCXT-compatible methods ───────────────────────────────────────

  async loadMarkets(): Promise<Record<string, Market>> {
    if (Object.keys(this.markets).length > 0) return this.markets;

    const list = await this.publicGet<CoinDCXMarketDetail[]>(PRIVATE_BASE, "/exchange/v1/markets_details");

    for (const m of list) {
      const base = m.target_currency_short_name;
      const quote = m.base_currency_short_name;
      if (!base || !quote) continue;
      const symbol = `${base}/${quote}`;

      this.symbolToPair[symbol] = m.pair;
      this.symbolToMarket[symbol] = m.symbol;
      this.marketToSymbol[m.symbol] = symbol;

      this.markets[symbol] = {
        id: m.pair,
        symbol,
        base,
        quote,
        baseId: base,
        quoteId: quote,
        active: m.status !== "inactive",
        type: "spot",
        spot: true,
        margin: false,
        swap: false,
        future: false,
        option: false,
        contract: false,
        precision: { amount: undefined, price: undefined },
        limits: {
          amount: { min: m.min_quantity, max: undefined },
          cost: { min: m.min_notional, max: undefined },
          price: { min: undefined, max: undefined },
        },
        info: m,
      } as unknown as Market;
    }

    this.symbols = Object.keys(this.markets);
    return this.markets;
  }

  async fetchTickers(symbols?: string[]): Promise<Record<string, Ticker>> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();

    const list = await this.publicGet<CoinDCXTickerEntry[]>(PRIVATE_BASE, "/exchange/ticker");
    const result: Record<string, Ticker> = {};

    for (const t of list) {
      const symbol = this.marketToSymbol[t.market];
      if (!symbol) continue;
      if (symbols && symbols.length > 0 && !symbols.includes(symbol)) continue;
      result[symbol] = this.normalizeTicker(symbol, t);
    }

    return result;
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    const all = await this.fetchTickers([symbol]);
    const t = all[symbol];
    if (!t) throw new Error(`CoinDCX: ticker not found for ${symbol}`);
    return t;
  }

  private normalizeTicker(symbol: string, t: CoinDCXTickerEntry): Ticker {
    const last = parseFloat(t.last_price);
    return {
      symbol,
      timestamp: t.timestamp,
      datetime: new Date(t.timestamp).toISOString(),
      high: parseFloat(t.high),
      low: parseFloat(t.low),
      bid: parseFloat(t.bid),
      ask: parseFloat(t.ask),
      last,
      close: last,
      previousClose: undefined,
      change: undefined,
      percentage: parseFloat(t.change_24_hour),
      average: undefined,
      baseVolume: parseFloat(t.volume),
      quoteVolume: undefined,
      info: t,
    } as unknown as Ticker;
  }

  async fetchOHLCV(symbol: string, timeframe = "1h", since?: number, limit = 100): Promise<OHLCV[]> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const pair = this.requirePair(symbol);
    const interval = TIMEFRAME_MAP[timeframe] || timeframe;

    const params = new URLSearchParams({ pair, interval, limit: String(limit) });
    if (since !== undefined) params.set("startTime", String(since));

    const data = await this.publicGet<CoinDCXCandle[]>(
      PUBLIC_BASE,
      `/market_data/candles?${params.toString()}`,
    );

    return data
      .map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume] as OHLCV)
      .sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  async fetchBalance(): Promise<Balances> {
    const list = await this.privatePost<CoinDCXBalance[]>("/exchange/v1/users/balances");

    const free: Record<string, number> = {};
    const used: Record<string, number> = {};
    const total: Record<string, number> = {};
    const perCurrency: Record<string, { free: number; used: number; total: number }> = {};

    for (const b of list) {
      const f = parseFloat(b.balance);
      const u = parseFloat(b.locked_balance);
      free[b.currency] = f;
      used[b.currency] = u;
      total[b.currency] = f + u;
      perCurrency[b.currency] = { free: f, used: u, total: f + u };
    }

    return {
      info: list,
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
  ): Promise<Order> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const market = this.requireMarket(symbol);

    const body: Record<string, unknown> = {
      market,
      total_quantity: amount,
      side,
      order_type: type === "market" ? "market_order" : "limit_order",
    };
    if (type === "limit" && price !== undefined) {
      body.price_per_unit = price;
    }

    const res = await this.privatePost<CoinDCXOrdersResponse>("/exchange/v1/orders/create", body);
    const o = res.orders?.[0];
    if (!o) throw new Error("CoinDCX: create order returned no order");
    return this.normalizeOrder(symbol, o);
  }

  async cancelOrder(orderId: string, _symbol?: string): Promise<unknown> {
    return this.privatePost("/exchange/v1/orders/cancel", { id: orderId });
  }

  async fetchOpenOrders(symbol?: string): Promise<Order[]> {
    const body: Record<string, unknown> = {};
    if (symbol) {
      if (Object.keys(this.markets).length === 0) await this.loadMarkets();
      body.market = this.requireMarket(symbol);
    }
    const res = await this.privatePost<CoinDCXOrdersResponse>(
      "/exchange/v1/orders/active_orders",
      body,
    );
    return (res.orders ?? []).map((o) =>
      this.normalizeOrder(this.marketToSymbol[o.market] ?? o.market, o),
    );
  }

  async fetchClosedOrders(_symbol?: string, _since?: number, limit = 50): Promise<Order[]> {
    const res = await this.privatePost<CoinDCXOrdersResponse>("/exchange/v1/orders/trade_history", {
      limit,
    });
    return (res.orders ?? []).map((o) =>
      this.normalizeOrder(this.marketToSymbol[o.market] ?? o.market, o),
    );
  }

  async fetchPositions(): Promise<unknown[]> {
    // Spot only — no positions to report. Futures support is a future phase.
    return [];
  }

  private normalizeOrder(symbol: string, o: CoinDCXOrder): Order {
    const filled = o.total_quantity - o.remaining_quantity;
    const price = o.avg_price || o.price_per_unit;
    const ts = o.timestamp ?? (o.created_at ? Date.parse(o.created_at) : Date.now());
    return {
      id: o.id,
      symbol,
      type: o.order_type === "market_order" ? "market" : "limit",
      side: o.side as "buy" | "sell",
      price,
      average: o.avg_price,
      amount: o.total_quantity,
      filled,
      remaining: o.remaining_quantity,
      cost: price * filled,
      status: this.mapStatus(o.status),
      fee: { cost: o.fee_amount, currency: symbol.split("/")[1] ?? "USDT" },
      timestamp: ts,
      datetime: new Date(ts).toISOString(),
      info: o,
    } as unknown as Order;
  }

  private mapStatus(s: string): "open" | "closed" | "canceled" {
    if (s === "filled") return "closed";
    if (s === "cancelled" || s === "canceled" || s === "rejected") return "canceled";
    return "open";
  }
}
