import type { BacktestStrategy, CandleContext, Signal, Candle } from "../../types.js";

/**
 * Ichimoku Renko Trend-Follower
 *
 * 1m candles → Renko bricks (default fixed 5-pt box, configurable). Standard
 * Ichimoku (9, 26, 52, displacement 26) computed ON THE BRICK SERIES — the
 * way TradingView's Ichimoku indicator renders on a Renko chart.
 *
 * Both entry and exit fire ONLY on the 1m close that finalised a new brick.
 *
 * ENTRY
 *   • LONG  → brick close > Kumo top  AND brick close > Kijun
 *   • SHORT → brick close < Kumo bot  AND brick close < Kijun
 *   • If brick close is INSIDE the Kumo (between span A and span B) — no
 *     new entry, even if it is on the right side of Kijun.
 *
 * EXIT  ("Renkoed")
 *   • Long  → brick closes < Kijun  OR brick re-enters / crosses the cloud.
 *   • Short → brick closes > Kijun  OR brick re-enters / crosses the cloud.
 *
 * "Brick body" highs / lows are used for the Ichimoku rolling H/L:
 *   highs[i] = max(brick.open, brick.close)
 *   lows[i]  = min(brick.open, brick.close)
 *
 * Standard Ichimoku displacement (26 bricks) is applied to the cloud:
 *   spanA[i] = (Tenkan[i-26] + Kijun[i-26]) / 2
 *   spanB[i] = midpoint over (52 bricks ending at i-26)
 *
 * NO SL / TP — pure brick-driven exit, matching the spec.
 */

const DEFAULT_BOX_SIZE = 5;
const DEFAULT_TENKAN_PERIOD = 9;
const DEFAULT_KIJUN_PERIOD = 26;
const DEFAULT_SENKOU_B_PERIOD = 52;
const DEFAULT_DISPLACEMENT = 26;

interface BrickData {
  open: number;
  close: number;
  closeBarIdx: number;
  closeTimestamp: number;
  direction: 1 | -1;
}

interface BrickEvent {
  brick: BrickData;
  brickIdx: number;
}

interface Ichimoku {
  tenkan: number[];
  kijun: number[];
  spanA: number[];
  spanB: number[];
}

interface Precomputed {
  candles1m: Candle[];
  bricks: BrickData[];
  ichimoku: Ichimoku;
  /** Per 1m bar — brick event that finalised at this bar (or null). */
  lastBrickAt: (BrickEvent | null)[];
  /** Per 1m bar — index of most recently closed brick (or -1). */
  brickIdxAtBar: Int32Array;
}

let precomputed: Precomputed | null = null;
let cachedBoxSize = DEFAULT_BOX_SIZE;
let cachedIchiKey = `${DEFAULT_TENKAN_PERIOD}|${DEFAULT_KIJUN_PERIOD}|${DEFAULT_SENKOU_B_PERIOD}|${DEFAULT_DISPLACEMENT}`;

export function resetIchimokuRenkoTrendCache(): void {
  precomputed = null;
  cachedBoxSize = DEFAULT_BOX_SIZE;
  cachedIchiKey = `${DEFAULT_TENKAN_PERIOD}|${DEFAULT_KIJUN_PERIOD}|${DEFAULT_SENKOU_B_PERIOD}|${DEFAULT_DISPLACEMENT}`;
}

// ── Renko brick construction (close-based, 2× reversal) ──────────

function computeRenkoBricks(
  candles: Candle[],
  boxSize: number,
): { bricks: BrickData[]; lastBrickAt: (BrickEvent | null)[]; brickIdxAtBar: Int32Array } {
  const len = candles.length;
  const lastBrickAt = new Array<BrickEvent | null>(len).fill(null);
  const brickIdxAtBar = new Int32Array(len).fill(-1);
  const bricks: BrickData[] = [];
  if (len === 0 || boxSize <= 0) return { bricks, lastBrickAt, brickIdxAtBar };

  // Anchor on grid (Traditional Renko) so brick closes line up with
  // round multiples of boxSize.
  let lastBrickClose = Math.round(candles[0].close / boxSize) * boxSize;
  let dir: 0 | 1 | -1 = 0;

  for (let i = 0; i < len; i++) {
    const bar = candles[i];
    const c = bar.close;
    let lastEv: BrickEvent | null = null;

    const finalize = (close: number, open: number, dirN: 1 | -1) => {
      const b: BrickData = {
        open,
        close,
        closeBarIdx: i,
        closeTimestamp: bar.timestamp,
        direction: dirN,
      };
      bricks.push(b);
      lastEv = { brick: b, brickIdx: bricks.length - 1 };
    };

    if (dir === 0) {
      while (c >= lastBrickClose + boxSize) {
        const o = lastBrickClose;
        lastBrickClose += boxSize;
        finalize(lastBrickClose, o, 1);
        dir = 1;
      }
      if (dir === 0) {
        while (c <= lastBrickClose - boxSize) {
          const o = lastBrickClose;
          lastBrickClose -= boxSize;
          finalize(lastBrickClose, o, -1);
          dir = -1;
        }
      }
    } else if (dir === 1) {
      while (c >= lastBrickClose + boxSize) {
        const o = lastBrickClose;
        lastBrickClose += boxSize;
        finalize(lastBrickClose, o, 1);
      }
      if (c <= lastBrickClose - 2 * boxSize) {
        const o = lastBrickClose;
        lastBrickClose -= 2 * boxSize;
        finalize(lastBrickClose, o, -1);
        dir = -1;
        while (c <= lastBrickClose - boxSize) {
          const o2 = lastBrickClose;
          lastBrickClose -= boxSize;
          finalize(lastBrickClose, o2, -1);
        }
      }
    } else {
      while (c <= lastBrickClose - boxSize) {
        const o = lastBrickClose;
        lastBrickClose -= boxSize;
        finalize(lastBrickClose, o, -1);
      }
      if (c >= lastBrickClose + 2 * boxSize) {
        const o = lastBrickClose;
        lastBrickClose += 2 * boxSize;
        finalize(lastBrickClose, o, 1);
        dir = 1;
        while (c >= lastBrickClose + boxSize) {
          const o2 = lastBrickClose;
          lastBrickClose += boxSize;
          finalize(lastBrickClose, o2, 1);
        }
      }
    }

    lastBrickAt[i] = lastEv;
  }

  // brickIdxAtBar carries the most recent brick idx forward across 1m
  // bars where no brick closed.
  let cur = -1;
  for (let i = 0; i < len; i++) {
    const ev = lastBrickAt[i];
    if (ev) cur = ev.brickIdx;
    brickIdxAtBar[i] = cur;
  }

  return { bricks, lastBrickAt, brickIdxAtBar };
}

// ── Ichimoku on brick series ────────────────────────────────────

function computeIchimokuOnBricks(
  bricks: BrickData[],
  tenkanPeriod: number,
  kijunPeriod: number,
  senkouBPeriod: number,
  displacement: number,
): Ichimoku {
  const n = bricks.length;
  const tenkan = new Array<number>(n).fill(NaN);
  const kijun = new Array<number>(n).fill(NaN);
  const spanA = new Array<number>(n).fill(NaN);
  const spanB = new Array<number>(n).fill(NaN);
  if (n === 0) return { tenkan, kijun, spanA, spanB };

  // Brick body H/L — that's what TV's Ichimoku-on-Renko sees.
  const highs = new Array<number>(n);
  const lows = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    highs[i] = Math.max(bricks[i].open, bricks[i].close);
    lows[i] = Math.min(bricks[i].open, bricks[i].close);
  }

  // Naive rolling H/L midpoint. O(n × period) — fine for typical brick
  // counts (a year of 1m data on ETH ≈ a few thousand bricks at boxSize=5).
  const midpoint = (period: number, i: number): number => {
    if (period <= 0 || i < period - 1) return NaN;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    return (hh + ll) / 2;
  };

  for (let i = 0; i < n; i++) {
    tenkan[i] = midpoint(tenkanPeriod, i);
    kijun[i] = midpoint(kijunPeriod, i);
  }

  // Cloud at brick i is computed from brick (i - displacement). This is
  // standard Ichimoku — span A/B you see "right now" was calculated 26
  // bars ago and shifted forward.
  for (let i = 0; i < n; i++) {
    const src = i - displacement;
    if (src < 0) continue;
    const t = tenkan[src];
    const k = kijun[src];
    if (Number.isFinite(t) && Number.isFinite(k)) spanA[i] = (t + k) / 2;
    spanB[i] = midpoint(senkouBPeriod, src);
  }

  return { tenkan, kijun, spanA, spanB };
}

// ── Precompute pipeline ─────────────────────────────────────────

export function precomputeIchimokuRenkoTrend(allCandles: Candle[]): void {
  const candles1m = allCandles;
  const { bricks, lastBrickAt, brickIdxAtBar } = computeRenkoBricks(
    candles1m,
    DEFAULT_BOX_SIZE,
  );
  const ichimoku = computeIchimokuOnBricks(
    bricks,
    DEFAULT_TENKAN_PERIOD,
    DEFAULT_KIJUN_PERIOD,
    DEFAULT_SENKOU_B_PERIOD,
    DEFAULT_DISPLACEMENT,
  );

  precomputed = {
    candles1m,
    bricks,
    ichimoku,
    lastBrickAt,
    brickIdxAtBar,
  };
  cachedBoxSize = DEFAULT_BOX_SIZE;
  cachedIchiKey = `${DEFAULT_TENKAN_PERIOD}|${DEFAULT_KIJUN_PERIOD}|${DEFAULT_SENKOU_B_PERIOD}|${DEFAULT_DISPLACEMENT}`;
}

// ── Strategy ────────────────────────────────────────────────────

export const ichimokuRenkoTrendStrategy: BacktestStrategy = {
  name: "Ichimoku Renko Trend-Follower",
  description:
    "Renko (default fixed 5-pt box, configurable via boxSize) on 1m. Standard Ichimoku (9, 26, 52, displacement 26) computed on the brick series — the way TradingView shows Ichimoku on a Renko chart. LONG on a brick that closes ABOVE the Kumo cloud AND above Kijun. SHORT mirrors. NO entries while the brick is inside the cloud (neutral zone). Exit (\"Renkoed\") when a brick closes against Kijun or re-enters / crosses the cloud. Pure brick-driven — no SL, no TP, no time-based stop.",
  defaultConfig: {
    leverage: 5,
    positionSizePercent: 100,
    /** Renko box size in $. Default 5. Ignored when boxPercent > 0. */
    boxSize: DEFAULT_BOX_SIZE,
    /** If > 0, box size = (first-bar close) × (boxPercent / 100). Makes the
     *  strategy comparable across coins of different price scales. Default 0
     *  preserves the literal "fixed 5" spec. */
    boxPercent: 0,
    /** If > 0, hard SL placed at (entry ∓ slBoxMultiple × effectiveBox). 0 =
     *  pure signal-driven exit (spec default). */
    slBoxMultiple: 0,
    /** Ichimoku Tenkan-sen lookback (bricks). Default 9. */
    tenkanPeriod: DEFAULT_TENKAN_PERIOD,
    /** Ichimoku Kijun-sen lookback (bricks). Default 26. */
    kijunPeriod: DEFAULT_KIJUN_PERIOD,
    /** Ichimoku Senkou Span B lookback (bricks). Default 52. */
    senkouBPeriod: DEFAULT_SENKOU_B_PERIOD,
    /** Cloud displacement forward (bricks). Default 26. */
    displacement: DEFAULT_DISPLACEMENT,
  },
  requiredIndicators: [],

  onCandle(ctx: CandleContext): Signal[] {
    if (!precomputed) return [];
    const { candle, index, positions, equity, config } = ctx;

    const rawBoxSize = Math.max(0.000001, Number(config.boxSize ?? DEFAULT_BOX_SIZE));
    const boxPercent = Math.max(0, Number(config.boxPercent ?? 0));
    // Percent-mode: box = startPrice × pct. Computed once from first 1m close
    // so a single, fixed-throughout-the-run brick size matches the spirit of
    // "fixed box" but scales meaningfully across coins.
    const startPrice = precomputed.candles1m.length > 0 ? precomputed.candles1m[0].close : 0;
    const effectiveBoxSize =
      boxPercent > 0 && startPrice > 0
        ? Math.max(0.000001, startPrice * (boxPercent / 100))
        : rawBoxSize;
    const slBoxMultiple = Math.max(0, Number(config.slBoxMultiple ?? 0));
    const tenkanPeriod = Math.max(1, Math.floor(Number(config.tenkanPeriod ?? DEFAULT_TENKAN_PERIOD)));
    const kijunPeriod = Math.max(1, Math.floor(Number(config.kijunPeriod ?? DEFAULT_KIJUN_PERIOD)));
    const senkouBPeriod = Math.max(1, Math.floor(Number(config.senkouBPeriod ?? DEFAULT_SENKOU_B_PERIOD)));
    const displacement = Math.max(0, Math.floor(Number(config.displacement ?? DEFAULT_DISPLACEMENT)));
    const leverage = Number(config.leverage ?? 5);
    const sizePct = Math.max(1, Math.min(100, Number(config.positionSizePercent ?? 25))) / 100;

    // ── Lazy recompute on box size or Ichimoku param change ─────
    const ichiKey = `${tenkanPeriod}|${kijunPeriod}|${senkouBPeriod}|${displacement}`;
    let bricksRecomputed = false;
    if (effectiveBoxSize !== cachedBoxSize) {
      const r = computeRenkoBricks(precomputed.candles1m, effectiveBoxSize);
      precomputed.bricks = r.bricks;
      precomputed.lastBrickAt = r.lastBrickAt;
      precomputed.brickIdxAtBar = r.brickIdxAtBar;
      cachedBoxSize = effectiveBoxSize;
      bricksRecomputed = true;
    }
    if (bricksRecomputed || ichiKey !== cachedIchiKey) {
      precomputed.ichimoku = computeIchimokuOnBricks(
        precomputed.bricks,
        tenkanPeriod,
        kijunPeriod,
        senkouBPeriod,
        displacement,
      );
      cachedIchiKey = ichiKey;
    }

    const { lastBrickAt, brickIdxAtBar, bricks, ichimoku } = precomputed;
    const newBrick = lastBrickAt[index];

    // No new brick this bar → nothing to do (brick-driven only).
    if (!newBrick) return [];

    const brickIdx = brickIdxAtBar[index]; // == newBrick.brickIdx by construction
    const brick = bricks[brickIdx];
    const brickClose = brick.close;
    const kijun = ichimoku.kijun[brickIdx];
    const sA = ichimoku.spanA[brickIdx];
    const sB = ichimoku.spanB[brickIdx];

    // Need all three to make a decision. Early bricks (before the cloud
    // is defined) get skipped silently.
    if (!Number.isFinite(kijun) || !Number.isFinite(sA) || !Number.isFinite(sB)) {
      return [];
    }

    const kumoTop = Math.max(sA, sB);
    const kumoBot = Math.min(sA, sB);
    const aboveCloud = brickClose > kumoTop;
    const belowCloud = brickClose < kumoBot;
    const insideCloud = !aboveCloud && !belowCloud;

    const longPos = positions.find((p) => p.side === "BUY");
    const shortPos = positions.find((p) => p.side === "SELL");
    const signals: Signal[] = [];

    // ── EXITS (Renkoed) ─────────────────────────────────────────
    // Long  : brick close < Kijun OR brick is no longer ABOVE the cloud.
    // Short : brick close > Kijun OR brick is no longer BELOW the cloud.
    let longJustClosed = false;
    let shortJustClosed = false;

    if (longPos) {
      const kijunFail = brickClose < kijun;
      const cloudFail = !aboveCloud; // entered or crossed
      if (kijunFail || cloudFail) {
        const why = kijunFail
          ? `brick ${brickClose.toFixed(2)} < Kijun ${kijun.toFixed(2)}`
          : `brick ${brickClose.toFixed(2)} ${insideCloud ? "INSIDE" : "below"} cloud (top ${kumoTop.toFixed(2)}, bot ${kumoBot.toFixed(2)})`;
        signals.push({
          action: "CLOSE_LONG",
          entryPrice: candle.close,
          reason: `Renkoed exit: ${why}`,
        });
        longJustClosed = true;
      }
    }
    if (shortPos) {
      const kijunFail = brickClose > kijun;
      const cloudFail = !belowCloud;
      if (kijunFail || cloudFail) {
        const why = kijunFail
          ? `brick ${brickClose.toFixed(2)} > Kijun ${kijun.toFixed(2)}`
          : `brick ${brickClose.toFixed(2)} ${insideCloud ? "INSIDE" : "above"} cloud (top ${kumoTop.toFixed(2)}, bot ${kumoBot.toFixed(2)})`;
        signals.push({
          action: "CLOSE_SHORT",
          entryPrice: candle.close,
          reason: `Renkoed exit: ${why}`,
        });
        shortJustClosed = true;
      }
    }

    // ── ENTRIES ─────────────────────────────────────────────────
    // No new entry while inside the cloud (neutral zone).
    if (!insideCloud) {
      const haveLong = longPos != null && !longJustClosed;
      const haveShort = shortPos != null && !shortJustClosed;
      const entry = candle.close;

      if (aboveCloud && brickClose > kijun && !haveLong && !haveShort) {
        // shortJustClosed && longCriteria → natural stop-and-reverse: the
        // CLOSE_SHORT we emitted above runs first, then this BUY opens.
        const qty = (equity * sizePct) / entry;
        const sl = slBoxMultiple > 0 ? entry - slBoxMultiple * effectiveBoxSize : undefined;
        signals.push({
          action: "BUY",
          qty,
          leverage,
          entryPrice: entry,
          ...(sl !== undefined && sl > 0 ? { sl } : {}),
          reason: `Renko UP brick ${brickClose.toFixed(2)} > Kumo top ${kumoTop.toFixed(2)} AND > Kijun ${kijun.toFixed(2)}${sl !== undefined ? ` | SL ${sl.toFixed(2)}` : ""}`,
        });
      } else if (belowCloud && brickClose < kijun && !haveLong && !haveShort) {
        const qty = (equity * sizePct) / entry;
        const sl = slBoxMultiple > 0 ? entry + slBoxMultiple * effectiveBoxSize : undefined;
        signals.push({
          action: "SELL",
          qty,
          leverage,
          entryPrice: entry,
          ...(sl !== undefined ? { sl } : {}),
          reason: `Renko DOWN brick ${brickClose.toFixed(2)} < Kumo bot ${kumoBot.toFixed(2)} AND < Kijun ${kijun.toFixed(2)}${sl !== undefined ? ` | SL ${sl.toFixed(2)}` : ""}`,
        });
      }
    }

    return signals;
  },
};
