/**
 * Pi42 adapter — mimics the subset of the CCXT Exchange interface that
 * CryptoX uses, talking to Pi42's futures-only REST API directly.
 *
 * Pi42 is an Indian futures-only exchange offering both INR-margined and
 * USDT-margined linear perps for the same base assets.
 *
 * References:
 *   - https://docs.pi42.com
 *   - Public:  https://api.pi42.com
 *   - Private: https://fapi.pi42.com
 */
import crypto from "crypto";
import type { Balances, Market, OHLCV, Order, Ticker } from "ccxt";

const PUBLIC_BASE = "https://api.pi42.com";
const PRIVATE_BASE = "https://fapi.pi42.com";

interface Pi42Filter {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  notional?: string;
  limit?: string;
}

interface Pi42Contract {
  name: string; // "BTCUSDT", "BTCINR"
  contractName: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: string;
  quantityPrecision: string;
  maxLeverage: string;
  contractType: string; // "PERPETUAL"
  orderTypes: string[];
  filters: Pi42Filter[];
  makerFee?: number;
  takerFee?: number;
}

interface Pi42ExchangeInfo {
  markets: string[];
  contracts: Pi42Contract[];
}

interface Pi42Ticker24Hr {
  data: {
    s: string; // symbol
    c: string; // close (last)
    h: string; // high
    l: string; // low
    p: string; // change
    P: string; // percent change
    o: string; // open
    v: string; // base volume
    q: string; // quote volume
    E: number; // event time (ms)
  };
}

interface Pi42Kline {
  startTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  endTime: string;
  volume: string;
}

interface Pi42WalletAsset {
  asset?: string;
  marginBalance?: string | number;
  availableBalance?: string | number;
  positionMargin?: string | number;
  orderMargin?: string | number;
  unrealisedPnl?: string | number;
}

interface Pi42WalletResponse {
  data?: Pi42WalletAsset[];
  // Some Pi42 endpoints wrap differently
  result?: Pi42WalletAsset[];
  walletData?: Pi42WalletAsset[];
}

interface Pi42Order {
  clientOrderId?: string;
  orderId?: string | number;
  id?: string | number;
  symbol?: string;
  pair?: string;
  status?: string;
  side?: string;
  type?: string;
  orderType?: string;
  quantity?: string | number;
  executedQty?: string | number;
  price?: string | number;
  avgPrice?: string | number;
  fee?: string | number;
  createdAt?: string;
  updatedAt?: string;
}

interface Pi42PlaceOrderResponse {
  data?: Pi42Order;
  result?: Pi42Order;
  orderId?: string;
  id?: string;
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
  "1w": "1w",
};

export class Pi42Adapter {
  public readonly id = "pi42";
  public readonly name = "Pi42";
  public urls: { api: { public: string; private: string } } = {
    api: { public: PUBLIC_BASE, private: PRIVATE_BASE },
  };
  public markets: Record<string, Market> = {};
  public symbols: string[] = [];

  // CCXT symbol "BTC/USDT:USDT" ↔ Pi42 contract name "BTCUSDT"
  private symbolToContract: Record<string, string> = {};
  private contractToSymbol: Record<string, string> = {};
  private contractCache: Record<string, Pi42Contract> = {};

  constructor(private readonly apiKey: string, private readonly apiSecret: string) {}

  // ─── HTTP helpers ──────────────────────────────────────────────────

  private async publicGet<T>(base: string, path: string): Promise<T> {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Pi42 GET ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  private async publicPost<T>(base: string, path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Pi42 POST ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Pi42 HMAC: signs the JSON body for POST/PUT/DELETE, query string for GET.
   * Headers: api-key, signature.
   */
  private sign(payload: string): string {
    return crypto.createHmac("sha256", this.apiSecret).update(payload).digest("hex");
  }

  private async authedRequest<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: { query?: Record<string, string | number>; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const timestamp = Date.now();
    let url = `${PRIVATE_BASE}${path}`;
    let signaturePayload = "";
    let bodyString = "";

    if (method === "GET" || method === "DELETE") {
      const q = { ...(opts.query ?? {}), timestamp };
      const queryString = Object.entries(q)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      url = `${url}?${queryString}`;
      signaturePayload = queryString;
    } else {
      const body = { ...(opts.body ?? {}), timestamp };
      bodyString = JSON.stringify(body);
      signaturePayload = bodyString;
    }

    const signature = this.sign(signaturePayload);
    const res = await fetch(url, {
      method,
      headers: {
        "api-key": this.apiKey,
        signature,
        ...(bodyString ? { "Content-Type": "application/json" } : {}),
      },
      body: bodyString || undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Pi42 ${method} ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  // ─── Symbol mapping ────────────────────────────────────────────────

  private requireContract(symbol: string): { contract: string; spec: Pi42Contract } {
    const contract = this.symbolToContract[symbol];
    const spec = contract ? this.contractCache[symbol] : undefined;
    if (!contract || !spec) {
      throw new Error(
        `Pi42: unsupported symbol "${symbol}". Expected "BASE/QUOTE:QUOTE" with QUOTE in {USDT, INR}.`,
      );
    }
    return { contract, spec };
  }

  // ─── CCXT-compatible methods ───────────────────────────────────────

  async loadMarkets(): Promise<Record<string, Market>> {
    if (Object.keys(this.markets).length > 0) return this.markets;

    const info = await this.publicGet<Pi42ExchangeInfo>(PUBLIC_BASE, "/v1/exchange/exchangeInfo");
    for (const c of info.contracts ?? []) {
      if (c.contractType !== "PERPETUAL") continue;
      const base = c.baseAsset;
      const quote = c.quoteAsset;
      if (!base || !quote) continue;
      const symbol = `${base}/${quote}:${quote}`;

      this.symbolToContract[symbol] = c.name;
      this.contractToSymbol[c.name] = symbol;
      this.contractCache[symbol] = c;

      const limitFilter = c.filters?.find((f) => f.filterType === "LIMIT_QTY_SIZE");
      const notionalFilter = c.filters?.find((f) => f.filterType === "MIN_NOTIONAL");
      const qtyPrecision = parseInt(c.quantityPrecision || "0", 10);
      const pxPrecision = parseInt(c.pricePrecision || "0", 10);
      const qtyStep = qtyPrecision > 0 ? Math.pow(10, -qtyPrecision) : 1;
      const pxStep = pxPrecision > 0 ? Math.pow(10, -pxPrecision) : 1;

      this.markets[symbol] = {
        id: c.name,
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
        precision: {
          amount: qtyStep,
          price: pxStep,
        },
        limits: {
          amount: {
            min: limitFilter?.minQty ? Number(limitFilter.minQty) : undefined,
            max: limitFilter?.maxQty ? Number(limitFilter.maxQty) : undefined,
          },
          cost: {
            min: notionalFilter?.notional ? Number(notionalFilter.notional) : undefined,
            max: undefined,
          },
          price: { min: undefined, max: undefined },
        },
        info: c as unknown as Record<string, unknown>,
      } as unknown as Market;
    }

    this.symbols = Object.keys(this.markets);
    return this.markets;
  }

  async fetchTicker(symbol: string): Promise<Ticker> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const { contract } = this.requireContract(symbol);
    const res = await this.publicGet<Pi42Ticker24Hr>(
      PUBLIC_BASE,
      `/v1/market/ticker24Hr/${contract}`,
    );
    return this.normalizeTicker(symbol, res.data);
  }

  async fetchTickers(symbols?: string[]): Promise<Record<string, Ticker>> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    // Pi42 bulk ticker shape varies; fall back to per-symbol fetches for the
    // pairs we actually need (CryptoX usually only asks for one).
    const targets = symbols && symbols.length > 0 ? symbols : Object.keys(this.markets).slice(0, 10);
    const out: Record<string, Ticker> = {};
    await Promise.all(
      targets.map(async (s) => {
        try {
          out[s] = await this.fetchTicker(s);
        } catch {
          /* swallow per-symbol errors */
        }
      }),
    );
    return out;
  }

  private normalizeTicker(symbol: string, t: Pi42Ticker24Hr["data"]): Ticker {
    const last = Number(t.c);
    const ts = Number(t.E) || Date.now();
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
      change: Number(t.p),
      percentage: Number(t.P),
      average: undefined,
      baseVolume: Number(t.v),
      quoteVolume: Number(t.q),
      info: t,
    } as unknown as Ticker;
  }

  async fetchOHLCV(symbol: string, timeframe = "1h", _since?: number, limit = 100): Promise<OHLCV[]> {
    if (Object.keys(this.markets).length === 0) await this.loadMarkets();
    const { contract } = this.requireContract(symbol);
    const interval = TIMEFRAME_MAP[timeframe] || timeframe;

    const res = await this.publicPost<Pi42Kline[]>(PUBLIC_BASE, "/v1/market/klines", {
      pair: contract,
      interval,
      limit,
    });
    return (res ?? [])
      .map(
        (k) =>
          [
            Number(k.startTime),
            Number(k.open),
            Number(k.high),
            Number(k.low),
            Number(k.close),
            Number(k.volume),
          ] as OHLCV,
      )
      .sort((a, b) => Number(a[0]) - Number(b[0]));
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
    const { spec } = this.requireContract(symbol);
    const limit = spec.filters?.find((f) => f.filterType === "LIMIT_QTY_SIZE");
    const notional = spec.filters?.find((f) => f.filterType === "MIN_NOTIONAL");
    const qtyPrecision = parseInt(spec.quantityPrecision || "0", 10);
    const pxPrecision = parseInt(spec.pricePrecision || "0", 10);
    return {
      minQty: limit?.minQty ? Number(limit.minQty) : 0,
      minNotional: notional?.notional ? Number(notional.notional) : 0,
      qtyIncrement: qtyPrecision > 0 ? Math.pow(10, -qtyPrecision) : 1,
      priceIncrement: pxPrecision > 0 ? Math.pow(10, -pxPrecision) : 1,
      maxLeverage: Number(spec.maxLeverage) || 0,
    };
  }

  // ─── Private endpoints ─────────────────────────────────────────────

  async fetchBalance(): Promise<Balances> {
    const raw = await this.authedRequest<Pi42WalletResponse>("GET", "/v1/wallet/futures-wallet/details");

    const list: Pi42WalletAsset[] = raw.data ?? raw.result ?? raw.walletData ?? [];

    const free: Record<string, number> = {};
    const used: Record<string, number> = {};
    const total: Record<string, number> = {};
    const perCurrency: Record<string, { free: number; used: number; total: number }> = {};

    for (const w of list) {
      const ccy = (w.asset || "").toUpperCase();
      if (!ccy) continue;
      const available = Number(w.availableBalance ?? 0);
      const locked = Number(w.positionMargin ?? 0) + Number(w.orderMargin ?? 0);
      const totalVal = Number(w.marginBalance ?? available + locked);
      free[ccy] = available;
      used[ccy] = locked;
      total[ccy] = totalVal;
      perCurrency[ccy] = { free: available, used: locked, total: totalVal };
    }

    return {
      info: raw,
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
    const { contract, spec } = this.requireContract(symbol);

    // Round qty to instrument step so the API doesn't reject with precision errors.
    const qtyPrecision = parseInt(spec.quantityPrecision || "0", 10);
    const step = qtyPrecision > 0 ? Math.pow(10, -qtyPrecision) : 1;
    let qty = amount;
    if (step > 0) {
      qty = Math.floor(qty / step) * step;
      qty = Number(qty.toFixed(qtyPrecision));
    }

    // Set leverage if requested (Pi42 allows per-symbol leverage updates).
    const leverage = Number(params.leverage ?? 0);
    if (leverage > 0) {
      try {
        await this.authedRequest("POST", "/v1/exchange/update/leverage", {
          body: { symbol: contract, leverage },
        });
      } catch (err) {
        console.warn(`[Pi42] setLeverage failed for ${symbol}:`, (err as Error).message);
      }
    }

    const orderBody: Record<string, unknown> = {
      symbol: contract,
      side: side.toUpperCase(),
      type: type === "market" ? "MARKET" : "LIMIT",
      quantity: qty,
      reduceOnly: false,
    };
    if (type === "limit" && price !== undefined) {
      const pxPrecision = parseInt(spec.pricePrecision || "0", 10);
      const pxStep = pxPrecision > 0 ? Math.pow(10, -pxPrecision) : 1;
      let px = price;
      if (pxStep > 0) {
        px = Math.round(px / pxStep) * pxStep;
        px = Number(px.toFixed(pxPrecision));
      }
      orderBody.price = px;
    }

    const res = await this.authedRequest<Pi42PlaceOrderResponse>(
      "POST",
      "/v1/order/place-order",
      { body: orderBody },
    );
    const o = res.data ?? res.result ?? (res as unknown as Pi42Order);
    if (!o) throw new Error("Pi42: place-order returned no order");
    return this.normalizeOrder(symbol, o);
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<unknown> {
    return this.authedRequest("DELETE", "/v1/order/delete-order", {
      body: { orderId, symbol: symbol ? this.symbolToContract[symbol] : undefined },
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
      const res = await this.authedRequest<{ data?: unknown[]; result?: unknown[] }>(
        "GET",
        "/v1/positions/OPEN",
      );
      return res.data ?? res.result ?? [];
    } catch {
      return [];
    }
  }

  private normalizeOrder(symbol: string, o: Pi42Order): Order {
    const total = Number(o.quantity ?? 0);
    const filled = Number(o.executedQty ?? 0);
    const price = Number(o.avgPrice ?? o.price ?? 0);
    const ts = o.updatedAt ? Date.parse(o.updatedAt) : o.createdAt ? Date.parse(o.createdAt) : Date.now();
    return {
      id: String(o.orderId ?? o.id ?? o.clientOrderId ?? ""),
      symbol,
      type: (o.type ?? o.orderType ?? "").toUpperCase() === "MARKET" ? "market" : "limit",
      side: ((o.side ?? "").toLowerCase() as "buy" | "sell"),
      price,
      average: price,
      amount: total,
      filled,
      remaining: total - filled,
      cost: price * filled,
      status: this.mapStatus(o.status ?? ""),
      fee: { cost: Number(o.fee ?? 0), currency: symbol.split(":")[1] || "USDT" },
      timestamp: ts,
      datetime: new Date(ts).toISOString(),
      info: o,
    } as unknown as Order;
  }

  private mapStatus(s: string): "open" | "closed" | "canceled" {
    const v = s.toLowerCase();
    if (v === "filled" || v === "closed") return "closed";
    if (v === "cancelled" || v === "canceled" || v === "rejected") return "canceled";
    return "open";
  }
}
