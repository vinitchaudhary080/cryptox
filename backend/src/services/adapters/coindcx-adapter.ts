/**
 * CoinDCX Futures adapter — mimics the subset of the CCXT Exchange interface
 * that CryptoX actually uses, talking to CoinDCX's derivatives/futures REST
 * API directly.
 *
 * Platform policy: CryptoX trades exclusively on futures markets. This adapter
 * only supports perpetual futures — no spot, no INR margin conversion.
 *
 * References:
 *   - https://docs.coindcx.com
 *   - https://gist.github.com/Quantaindew/09c0443e1cf935d774204d47815d6e1b
 */
import crypto from "crypto";
import type { Balances, Market, OHLCV, Order, Ticker } from "ccxt";

const PUBLIC_BASE = "https://public.coindcx.com";
const PRIVATE_BASE = "https://api.coindcx.com";

// CoinDCX futures pair format: "<prefix>-<base>_<quote>" e.g. "B-BTC_USDT",
// "I-BTC_INR" (INR-margined). Prefix denotes the venue/source CoinDCX proxies.
const PAIR_RE = /^([A-Z]+)-([A-Z0-9]+)_([A-Z]+)$/;

interface CoinDCXInstrumentDetail {
  pair: string;
  underlying_currency_short_name: string;
  quote_currency_short_name: string;
  settle_currency_short_name: string;
  margin_currency_short_name: string;
  status: string;
  kind: string;
  max_leverage_long: number;
  max_leverage_short: number;
  price_increment: number;
  quantity_increment: number;
  min_trade_size: number;
  min_quantity: number;
  max_quantity: number;
  min_notional: number;
  order_types: string[];
}

interface CoinDCXFuturesTickerEntry {
  fr: number;
  h: number;
  l: number;
  v: number;
  ls: number;
  pc: number;
  mkt: string;
  mp: number;
  bmST?: number;
  cmRT?: number;
  ctRT?: number;
}

interface CoinDCXFuturesTickerResponse {
  ts: number;
  vs: number;
  prices: Record<string, CoinDCXFuturesTickerEntry>;
}

interface CoinDCXCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface CoinDCXCandleResponse {
  s: string;
  data: CoinDCXCandle[];
}

interface CoinDCXBalanceEntry {
  currency: string;
  balance: string;
  locked_balance: string;
}

interface CoinDCXFuturesOrder {
  id: string;
  status: string;
  pair: string;
  order_type: string;
  side: string;
  price: number;
  total_quantity: number;
  remaining_quantity?: number;
  avg_price?: number;
  fee?: number;
  created_at?: string | number;
  updated_at?: string | number;
  leverage?: number;
}

interface CoinDCXFuturesOrderResponse {
  orders?: CoinDCXFuturesOrder[];
  order?: CoinDCXFuturesOrder;
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
  private pairToSymbol: Record<string, string> = {};
  private instrumentCache: Record<string, CoinDCXInstrumentDetail> = {};

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

  private pairToCcxtSymbol(pair: string): string | null {
    const m = PAIR_RE.exec(pair);
    if (!m) return null;
    const base = m[2];
    const quote = m[3];
    return `${base}/${quote}:${quote}`;
  }

  private requirePair(symbol: string): string {
    const pair = this.symbolToPair[symbol];
    if (!pair) {
      throw new Error(
        `CoinDCX futures: unsupported symbol "${symbol}". ` +
          `Expected format "BASE/USDT:USDT" (e.g. "BTC/USDT:USDT").`,
      );
    }
    return pair;
  }

  private async loadInstrumentDetail(pair: string): Promise<CoinDCXInstrumentDetail> {
    const cached = this.instrumentCache[pair];
    if (cached) return cached;
    const res = await this.publicGet<{ instrument: CoinDCXInstrumentDetail }>(
      PRIVATE_BASE,
      `/exchange/v1/derivatives/futures/data/instrument?pair=${encodeURIComponent(pair)}`,
    );
    this.instrumentCache[pair] = res.instrument;
    return res.instrument;
  }

  // ─── CCXT-compatible methods ───────────────────────────────────────

  async loadMarkets(): Promise<Record<string, Market>> {
    if (Object.keys(this.markets).length > 0) return this.markets;

    const list = await this.publicGet<string[]>(
      PRIVATE_BASE,
      "/exchange/v1/derivatives/futures/data/active_instruments",
    );

    for (const pair of list) {
      const symbol = this.pairToCcxtSymbol(pair);
      if (!symbol) continue;
      const m = PAIR_RE.exec(pair)!;
      const base = m[2];
      const quote = m[3];

      this.symbolToPair[symbol] = pair;
      this.pairToSymbol[pair] = symbol;

      this.markets[symbol] = {
        id: pair,
        symbol,
        base,
        quote,
        settle: quote,
        baseId: base,
        quoteId: quote,
        settleId: quote,
        active: true,
        type: "swap",
        spot: false,
        margin: false,
        swap: true,
        future: false,
        option: false,
        contract: true,
        linear: true,
        inverse: false,
        precision: { amount: undefined, price: undefined },
        limits: {
          amount: { min: undefined, max: undefined },
          cost: { min: undefined, max: undefined },
          price: { min: undefined, max: undefined },
        },
        info: { pair },
      } as unknown as Market;
    }

    this.symbols = Object.keys(this.markets);
    return this.markets;
  }

  async fetchTickers(symbols?: string[]): Promise<Record<string, Ticker>> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();

    const res = await this.publicGet<CoinDCXFuturesTickerResponse>(
      PUBLIC_BASE,
      "/market_data/v3/current_prices/futures/rt",
    );
    const out: Record<string, Ticker> = {};

    for (const [pair, t] of Object.entries(res.prices ?? {})) {
      const symbol = this.pairToSymbol[pair];
      if (!symbol) continue;
      if (symbols && symbols.length > 0 && !symbols.includes(symbol)) continue;
      out[symbol] = this.normalizeTicker(symbol, t);
    }
    return out;
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    this.requirePair(symbol);
    const all = await this.fetchTickers([symbol]);
    const t = all[symbol];
    if (!t) throw new Error(`CoinDCX futures: ticker not found for ${symbol}`);
    return t;
  }

  private normalizeTicker(symbol: string, t: CoinDCXFuturesTickerEntry): Ticker {
    const last = Number(t.ls);
    const ts = Number(t.cmRT ?? t.ctRT ?? t.bmST ?? Date.now());
    return {
      symbol,
      timestamp: ts,
      datetime: new Date(ts).toISOString(),
      high: Number(t.h),
      low: Number(t.l),
      bid: last,
      ask: last,
      last,
      close: last,
      previousClose: undefined,
      change: undefined,
      percentage: Number(t.pc),
      average: undefined,
      baseVolume: Number(t.v),
      quoteVolume: undefined,
      info: t,
    } as unknown as Ticker;
  }

  async fetchOHLCV(symbol: string, timeframe = "1h", since?: number, limit = 100): Promise<OHLCV[]> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const pair = this.requirePair(symbol);
    const interval = TIMEFRAME_MAP[timeframe] || timeframe;

    const now = Math.floor(Date.now() / 1000);
    const tfSeconds = this.timeframeToSeconds(interval);
    const fromSec = since !== undefined ? Math.floor(since / 1000) : now - tfSeconds * limit;

    const params = new URLSearchParams({
      pair,
      from: String(fromSec),
      to: String(now),
      resolution: interval,
      pcode: "f",
    });
    const res = await this.publicGet<CoinDCXCandleResponse>(
      PUBLIC_BASE,
      `/market_data/candlesticks?${params.toString()}`,
    );
    const rows = res.data ?? [];
    return rows
      .map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume] as OHLCV)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .slice(-limit);
  }

  private async getMarkPrice(pair: string): Promise<number> {
    try {
      const res = await this.publicGet<CoinDCXFuturesTickerResponse>(
        PUBLIC_BASE,
        "/market_data/v3/current_prices/futures/rt",
      );
      const t = res.prices?.[pair];
      return Number(t?.mp ?? t?.ls ?? 0);
    } catch {
      return 0;
    }
  }

  private timeframeToSeconds(tf: string): number {
    const unit = tf.slice(-1);
    const n = parseInt(tf.slice(0, -1), 10) || 1;
    if (unit === "m") return n * 60;
    if (unit === "h") return n * 3600;
    if (unit === "d") return n * 86400;
    if (unit === "w") return n * 604800;
    if (unit === "M") return n * 2592000;
    return 3600;
  }

  /**
   * Public method used by ExchangeService.getInstrumentInfo() to power the
   * deploy dialog's live "min required" calculator. Returns normalized rules
   * for a single pair without leaking CoinDCX-specific field names.
   */
  async getInstrumentInfo(symbol: string): Promise<{
    minQty: number;
    minNotional: number;
    qtyIncrement: number;
    priceIncrement: number;
    maxLeverage: number;
  }> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const pair = this.requirePair(symbol);
    const inst = await this.loadInstrumentDetail(pair);
    return {
      minQty: Number(inst.min_quantity) || 0,
      minNotional: Number(inst.min_notional) || 0,
      qtyIncrement: Number(inst.quantity_increment) || 0,
      priceIncrement: Number(inst.price_increment) || 0,
      maxLeverage: Math.max(
        Number(inst.max_leverage_long) || 0,
        Number(inst.max_leverage_short) || 0,
      ),
    };
  }

  // ─── Private endpoints ─────────────────────────────────────────────

  async fetchBalance(): Promise<Balances> {
    // CoinDCX exposes one unified balance list for the account. There is no
    // separate /derivatives/futures/wallets endpoint — positions/orders lock
    // margin from this same USDT/INR balance.
    const list = await this.privatePost<CoinDCXBalanceEntry[]>(
      "/exchange/v1/users/balances",
    );

    const free: Record<string, number> = {};
    const used: Record<string, number> = {};
    const total: Record<string, number> = {};
    const perCurrency: Record<string, { free: number; used: number; total: number }> = {};

    for (const b of list ?? []) {
      const ccy = (b.currency || "").toUpperCase();
      if (!ccy) continue;
      const f = parseFloat(b.balance);
      const u = parseFloat(b.locked_balance);
      free[ccy] = f;
      used[ccy] = u;
      total[ccy] = f + u;
      perCurrency[ccy] = { free: f, used: u, total: f + u };
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
    params: Record<string, unknown> = {},
  ): Promise<Order> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const pair = this.requirePair(symbol);
    const instrument = await this.loadInstrumentDetail(pair);

    const leverageRaw = Number(params.leverage ?? 1);
    const maxLev = Math.max(instrument.max_leverage_long, instrument.max_leverage_short);
    const leverage = Math.min(Math.max(1, leverageRaw), maxLev || 20);

    // Round quantity to the exchange's step size so the API doesn't reject
    // with "Quantity should be divisible by X". This is a format requirement,
    // not a min/max gate — the deploy dialog enforces min_notional/min_qty
    // upfront so we don't need to block here.
    const step = Number(instrument.quantity_increment) || 0;
    let qty = amount;
    if (step > 0) {
      const decimals = Math.max(0, -Math.floor(Math.log10(step)));
      qty = Math.floor(qty / step) * step;
      qty = Number(qty.toFixed(decimals));
    }

    const orderBody: Record<string, unknown> = {
      side,
      pair,
      order_type: type === "market" ? "market_order" : "limit_order",
      total_quantity: qty,
      leverage,
      margin_currency_short_name: instrument.margin_currency_short_name || "USDT",
    };
    if (type === "limit" && price !== undefined) {
      const priceStep = Number(instrument.price_increment) || 0;
      let px = price;
      if (priceStep > 0) {
        const pdec = Math.max(0, -Math.floor(Math.log10(priceStep)));
        px = Math.round(px / priceStep) * priceStep;
        px = Number(px.toFixed(pdec));
      }
      orderBody.price = px;
    }

    const res = await this.privatePost<unknown>(
      "/exchange/v1/derivatives/futures/orders/create",
      { order: orderBody },
    );

    // CoinDCX's futures create-order response shape is undocumented; tolerate
    // every variant we've seen in the wild: { orders: [...] }, { order: {...} },
    // a bare object, or a bare array.
    let o: CoinDCXFuturesOrder | undefined;
    if (Array.isArray(res)) {
      o = res[0] as CoinDCXFuturesOrder;
    } else if (res && typeof res === "object") {
      const obj = res as {
        orders?: CoinDCXFuturesOrder[];
        order?: CoinDCXFuturesOrder;
        data?: CoinDCXFuturesOrder | CoinDCXFuturesOrder[];
        id?: string;
      };
      if (Array.isArray(obj.orders) && obj.orders[0]) o = obj.orders[0];
      else if (obj.order) o = obj.order;
      else if (Array.isArray(obj.data) && obj.data[0]) o = obj.data[0];
      else if (obj.data && typeof obj.data === "object") o = obj.data as CoinDCXFuturesOrder;
      else if (obj.id) o = obj as unknown as CoinDCXFuturesOrder;
    }

    if (!o) {
      console.error("[CoinDCX] Unexpected create-order response shape:", JSON.stringify(res));
      throw new Error(
        `CoinDCX futures: create order returned unknown shape: ${JSON.stringify(res).slice(0, 300)}`,
      );
    }
    return this.normalizeOrder(symbol, o);
  }

  async cancelOrder(orderId: string, _symbol?: string): Promise<unknown> {
    return this.privatePost("/exchange/v1/derivatives/futures/orders/cancel", { id: orderId });
  }

  async fetchOpenOrders(_symbol?: string): Promise<Order[]> {
    return [];
  }

  async fetchClosedOrders(_symbol?: string, _since?: number, _limit = 50): Promise<Order[]> {
    return [];
  }

  async fetchPositions(_symbols?: string[]): Promise<unknown[]> {
    const res = await this.privatePost<unknown>(
      "/exchange/v1/derivatives/futures/positions",
      { page: 1, size: 50 },
    );
    if (Array.isArray(res)) return res;
    if (res && typeof res === "object") {
      const obj = res as { positions?: unknown[] };
      if (Array.isArray(obj.positions)) return obj.positions;
    }
    return [];
  }

  private normalizeOrder(symbol: string, o: CoinDCXFuturesOrder): Order {
    const filled = Number(o.total_quantity) - Number(o.remaining_quantity ?? 0);
    const price = Number(o.avg_price ?? o.price ?? 0);
    const tsRaw = o.updated_at ?? o.created_at;
    const ts =
      typeof tsRaw === "number"
        ? tsRaw
        : typeof tsRaw === "string"
          ? Date.parse(tsRaw)
          : Date.now();
    return {
      id: String(o.id),
      symbol,
      type: o.order_type === "market_order" ? "market" : "limit",
      side: o.side as "buy" | "sell",
      price,
      average: Number(o.avg_price ?? 0),
      amount: Number(o.total_quantity),
      filled,
      remaining: Number(o.remaining_quantity ?? 0),
      cost: price * filled,
      status: this.mapStatus(o.status),
      fee: { cost: Number(o.fee ?? 0), currency: "USDT" },
      timestamp: ts,
      datetime: new Date(ts).toISOString(),
      info: o,
    } as unknown as Order;
  }

  private mapStatus(s: string): "open" | "closed" | "canceled" {
    const v = s.toLowerCase();
    if (v === "filled") return "closed";
    if (v === "cancelled" || v === "canceled" || v === "rejected") return "canceled";
    return "open";
  }
}
