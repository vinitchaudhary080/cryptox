"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Play,
  Loader2,
  ChevronDown,
  Plus,
  Trash2,
  FlaskConical,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { backtestApi } from "@/lib/api"

const COINS = [
  { short: "BTC", name: "Bitcoin" },
  { short: "ETH", name: "Ethereum" },
  { short: "SOL", name: "Solana" },
  { short: "XRP", name: "XRP" },
  { short: "DOGE", name: "Dogecoin" },
  { short: "ADA", name: "Cardano" },
  { short: "DOT", name: "Polkadot" },
  { short: "SUI", name: "Sui" },
  { short: "LINK", name: "Chainlink" },
  { short: "AVAX", name: "Avalanche" },
  { short: "BNB", name: "BNB" },
  { short: "PAXG", name: "PAX Gold" },
  { short: "LTC", name: "Litecoin" },
  { short: "UNI", name: "Uniswap" },
  { short: "NEAR", name: "NEAR Protocol" },
  { short: "INJ", name: "Injective" },
  { short: "WIF", name: "dogwifhat" },
  { short: "AAVE", name: "Aave" },
]

interface BuiltinStrategy {
  /** Slug used as the API identifier (e.g. "07-zscore-mean-reversion-15m"). */
  name: string
  /** Human-friendly name from the DB row, used as the dropdown label. */
  displayName?: string
  description: string
  defaultConfig: Record<string, unknown>
}

export function BacktestConfigForm({
  onRunStarted,
}: {
  onRunStarted: (id: string) => void
}) {
  // Multi-coin selection — backtest fires once per coin in parallel.
  // Same params (capital, sizing, dates, strategy) apply to every run.
  const [coins, setCoins] = useState<string[]>(["ETH"])
  const MAX_COINS = 5
  // `allMode = true` ignores `coins` and runs every coin in COINS; after
  // all complete, sanity-check + composite-rank, keep top-5, delete rest.
  const [allMode, setAllMode] = useState(false)
  const [batchProgress, setBatchProgress] = useState<string | null>(null)
  const toggleCoin = (c: string) => {
    setCoins((prev) =>
      prev.includes(c)
        ? prev.filter((x) => x !== c)
        : prev.length >= MAX_COINS
          ? prev
          : [...prev, c],
    )
  }
  const [startDate, setStartDate] = useState("2023-01-01")
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [strategyName, setStrategyName] = useState("")
  const [sizingMode, setSizingMode] = useState<"contracts" | "fixed_cash" | "percent_equity">("percent_equity")
  const [sizingValueQty, setSizingValueQty] = useState(0.001)   // contracts mode
  const [sizingValueCash, setSizingValueCash] = useState(50)     // fixed_cash mode (USD)
  const [sizingValuePct, setSizingValuePct] = useState(50)       // percent_equity mode (%)
  const [enforceMinMargin, setEnforceMinMargin] = useState(false)
  const [initialCapital, setInitialCapital] = useState(250)
  const [commission, setCommission] = useState(0.05)   // 0.05% per trade
  const [slippageVal, setSlippageVal] = useState(0)    // 0% per trade
  const [isRunning, setIsRunning] = useState(false)

  // Built-in strategy state
  const [builtinStrategies, setBuiltinStrategies] = useState<BuiltinStrategy[]>([])
  const [strategyConfig, setStrategyConfig] = useState<Record<string, unknown>>({})

  // UI rules state

  useEffect(() => {
    backtestApi.getStrategies().then((res) => {
      if (res.success && res.data) {
        setBuiltinStrategies(res.data as BuiltinStrategy[])
        if ((res.data as BuiltinStrategy[]).length > 0) {
          const first = (res.data as BuiltinStrategy[])[0]
          setStrategyName(first.name)
          setStrategyConfig(first.defaultConfig)
        }
      }
    })
  }, [])

  const handleStrategyChange = (name: string) => {
    setStrategyName(name)
    const strat = builtinStrategies.find((s) => s.name === name)
    if (strat) setStrategyConfig({ ...strat.defaultConfig })
  }

  const handleConfigChange = (key: string, value: string) => {
    setStrategyConfig((prev) => ({
      ...prev,
      [key]: isNaN(Number(value)) ? value : Number(value),
    }))
  }

  // Strategy-config keys that should render as a fixed-option dropdown
  // instead of a free-text input. Add a key here to upgrade its UI.
  const ENUM_OPTIONS: Record<string, { label: string; value: string }[]> = {
    trailMode: [
      { label: "Supertrend (10, 3)", value: "supertrend" },
      { label: "EMA", value: "ema" },
      { label: "KAMA (10, 2, 30)", value: "kama" },
      { label: "None (no 5m trail)", value: "none" },
    ],
    vwapAnchor: [
      { label: "Session (daily, 00:00 UTC)", value: "session" },
      { label: "Weekly (Mon 00:00 UTC)", value: "weekly" },
      { label: "Monthly (1st of month)", value: "monthly" },
    ],
  }

  const handleRun = async () => {
    const coinsToRun = allMode ? COINS.map((c) => c.short) : coins
    if (coinsToRun.length === 0) return
    setIsRunning(true)
    setBatchProgress(null)
    try {
      const sizingValue =
        sizingMode === "contracts" ? sizingValueQty :
        sizingMode === "fixed_cash" ? sizingValueCash :
        sizingValuePct

      const baseConfig = {
        startDate,
        endDate,
        strategyType: "code" as const,
        strategyName,
        strategyConfig,
        initialCapital,
        makerFee: commission / 100,
        slippage: slippageVal / 100,
        sizingMode,
        sizingValue,
        enforceMinMargin,
      }

      // 1) Fire one backtest per coin in parallel.
      setBatchProgress(`Starting ${coinsToRun.length} backtest${coinsToRun.length > 1 ? "s" : ""}…`)
      const starts = await Promise.all(
        coinsToRun.map((c) => backtestApi.run({ ...baseConfig, coin: c })),
      )
      const runIds: string[] = starts
        .map((r) => (r.success && r.data ? (r.data as { id: string }).id : null))
        .filter((id): id is string => id !== null)

      const firstId = runIds[0]
      if (firstId) onRunStarted(firstId)

      // For manual mode (1–5 coins) we leave the History list to refresh
      // on its own as each run completes — no curation needed.
      if (!allMode) return

      // 2) ALL-mode: poll every run until COMPLETED or FAILED.
      setBatchProgress(`Running ${runIds.length} backtests…`)
      const finals = await Promise.all(
        runIds.map((id) => pollRun(id)),
      )

      // 3) Sanity-check each completed run; drop anything with engine
      // artifacts (inverted SLs, pnl mismatches, etc).
      setBatchProgress("Sanity-checking results…")
      const sanity = await Promise.all(
        finals.map(async (f) => {
          if (!f || f.status !== "COMPLETED") return { id: f?.id, ok: false }
          const sc = await backtestApi.sanityCheck(f.id)
          const okFlag = !!(sc.success && sc.data && (sc.data as { ok: boolean }).ok)
          return { id: f.id, ok: okFlag, run: f }
        }),
      )

      const clean = sanity.filter((s) => s.ok && s.run)
      const dirty = sanity.filter((s) => !s.ok)

      // 4) Composite rank: returnPct ↓, drawdown% ↑, PF ↓, win/loss ↓, winRate ↓.
      clean.sort((a, b) => {
        const ar = a.run!
        const br = b.run!
        const aRet = ar.initialCapital > 0 ? (ar.totalPnl / ar.initialCapital) * 100 : 0
        const bRet = br.initialCapital > 0 ? (br.totalPnl / br.initialCapital) * 100 : 0
        if (bRet !== aRet) return bRet - aRet
        // Normalize drawdown to % of initial capital for fair cross-coin comparison
        const aDdPct = ar.initialCapital > 0 ? (ar.maxDrawdown / ar.initialCapital) * 100 : 0
        const bDdPct = br.initialCapital > 0 ? (br.maxDrawdown / br.initialCapital) * 100 : 0
        if (aDdPct !== bDdPct) return aDdPct - bDdPct
        if (br.profitFactor !== ar.profitFactor) return br.profitFactor - ar.profitFactor
        const aWL = ar.avgLoss !== 0 ? Math.abs(ar.avgWin / ar.avgLoss) : 0
        const bWL = br.avgLoss !== 0 ? Math.abs(br.avgWin / br.avgLoss) : 0
        if (bWL !== aWL) return bWL - aWL
        return br.winRate - ar.winRate
      })

      const keep = clean.slice(0, 5).map((s) => s.id!)
      const toDelete = [
        ...clean.slice(5).map((s) => s.id!),
        ...dirty.map((s) => s.id).filter((id): id is string => !!id),
      ]

      // 5) Delete the rest. Parallel — these are independent.
      setBatchProgress(`Keeping top ${keep.length}, removing ${toDelete.length}…`)
      await Promise.all(toDelete.map((id) => backtestApi.deleteRun(id)))

      setBatchProgress(`Done. ${keep.length} top result${keep.length === 1 ? "" : "s"} kept.`)
      // Re-trigger parent's history refresh by re-calling onRunStarted
      // with one of the kept IDs (parent's poll-then-refresh path).
      if (keep[0]) onRunStarted(keep[0])
    } catch (err) {
      console.error("Backtest run failed:", err)
      setBatchProgress(`Error: ${(err as Error).message}`)
    } finally {
      setIsRunning(false)
    }
  }

  /** Poll a backtest run until it's no longer RUNNING. Hard timeout 5min. */
  const pollRun = async (id: string): Promise<{
    id: string; status: string; totalPnl: number; winRate: number;
    maxDrawdown: number; profitFactor: number; avgWin: number;
    avgLoss: number; initialCapital: number;
  } | null> => {
    const start = Date.now()
    while (Date.now() - start < 5 * 60_000) {
      const res = await backtestApi.getRun(id)
      if (res.success && res.data) {
        const r = res.data as { status: string } & Record<string, number>
        if (r.status !== "RUNNING") return { id, ...r } as never
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    return null
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FlaskConical className="h-5 w-5 text-primary" />
          Backtest Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Coin multi-pick (max 5) — or "All coins" auto-curated mode */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label>
              {allMode
                ? `All ${COINS.length} coins (top 5 auto-kept)`
                : `Coins (${coins.length}/${MAX_COINS})`}
            </Label>
            <div className="flex items-center gap-2">
              <Switch checked={allMode} onCheckedChange={setAllMode} id="all-mode" />
              <Label htmlFor="all-mode" className="cursor-pointer text-xs text-muted-foreground">
                Test all & keep top 5
              </Label>
            </div>
          </div>
          {allMode ? (
            <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
              Strategy will run on all {COINS.length} coins in parallel. After
              every run completes, results are sanity-checked (no inverted-SL
              artifacts, pnl math consistent) and ranked by composite score:
              <span className="mt-1 block">
                <span className="text-foreground">return% ↓ → drawdown% ↑ → profit factor ↓ → win/loss ratio ↓ → win rate ↓</span>
              </span>
              Top 5 stay in history. The other {COINS.length - 5} (plus any
              with sanity issues) are auto-deleted.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                {coins.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCoins([])}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COINS.map((c) => {
                  const selected = coins.includes(c.short)
                  const atLimit = !selected && coins.length >= MAX_COINS
                  return (
                    <button
                      key={c.short}
                      type="button"
                      onClick={() => toggleCoin(c.short)}
                      disabled={atLimit}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                        selected
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : atLimit
                            ? "cursor-not-allowed border-border/30 text-muted-foreground/40"
                            : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {c.short}
                    </button>
                  )
                })}
              </div>
              {coins.length === 0 && (
                <p className="text-xs text-loss">Select at least one coin</p>
              )}
              {coins.length === MAX_COINS && (
                <p className="text-xs text-muted-foreground">
                  Max {MAX_COINS} coins selected — deselect one to add another
                </p>
              )}
            </>
          )}
          {batchProgress && (
            <p className="text-xs text-primary">{batchProgress}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {/* Min-margin floor toggle */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-medium">Enforce $50 minimum margin</p>
            <p className="text-[10px] text-muted-foreground">
              {enforceMinMargin
                ? "Trades below $50 margin will be skipped as MARGIN_CALL."
                : "No floor — every trade executes at chosen size."}
            </p>
          </div>
          <Switch
            checked={enforceMinMargin}
            onCheckedChange={setEnforceMinMargin}
            aria-label="Toggle minimum margin enforcement"
          />
        </div>

        {/* Sizing Mode toggle — TradingView-style (3 modes) */}
        <div className="space-y-2">
          <Label>Sizing Mode</Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSizingMode("contracts")}
              className={`rounded-xl border p-2.5 text-left transition-all ${
                sizingMode === "contracts"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/30"
              }`}
            >
              <p className="text-xs font-semibold">Fixed Qty</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Raw units per trade
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSizingMode("fixed_cash")}
              className={`rounded-xl border p-2.5 text-left transition-all ${
                sizingMode === "fixed_cash"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/30"
              }`}
            >
              <p className="text-xs font-semibold">Fixed Cash</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Dollar amount
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSizingMode("percent_equity")}
              className={`rounded-xl border p-2.5 text-left transition-all ${
                sizingMode === "percent_equity"
                  ? "border-primary bg-primary/10"
                  : "border-border/50 hover:border-primary/30"
              }`}
            >
              <p className="text-xs font-semibold">% Equity</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Compounding %
              </p>
            </button>
          </div>

          {/* Mode-specific input */}
          {sizingMode === "contracts" && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">Quantity per trade</Label>
              <Input
                type="number"
                value={sizingValueQty}
                onChange={(e) => setSizingValueQty(Number(e.target.value))}
                min={0}
                step={0.001}
              />
              <p className="text-[11px] text-muted-foreground">
                Every trade opens {sizingValueQty} units of the asset (price-agnostic).
              </p>
            </div>
          )}
          {sizingMode === "fixed_cash" && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">Cash per trade (USD)</Label>
              <Input
                type="number"
                value={sizingValueCash}
                onChange={(e) => setSizingValueCash(Number(e.target.value))}
                min={enforceMinMargin ? 50 : 1}
                step={50}
              />
              <p className="text-[11px] text-muted-foreground">
                Every trade deploys <span className="font-semibold">${sizingValueCash}</span> margin.
                Notional = ${sizingValueCash} × leverage.
              </p>
            </div>
          )}
          {sizingMode === "percent_equity" && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">Equity percent per trade</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSizingValuePct(v)}
                    className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
                      sizingValuePct === v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                First trade margin: <span className="font-semibold">${(initialCapital * sizingValuePct / 100).toFixed(2)}</span> ({sizingValuePct}% of ${initialCapital}) — compounds on wins.
              </p>
            </div>
          )}
        </div>

        {/* Initial Capital */}
        <div className="space-y-2">
          <Label className="flex items-center justify-between">
            <span>Initial Capital (USD)</span>
            <span className="text-[10px] text-muted-foreground">for equity tracking / ROI %</span>
          </Label>
          <Input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            onBlur={(e) => {
              const raw = Number(e.target.value) || 250
              const snapped = Math.max(50, Math.round(raw / 50) * 50)
              setInitialCapital(snapped)
            }}
            min={50}
            step={50}
          />
        </div>

        {/* Commission & Slippage */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Commission</span>
              <span className="text-[10px] text-muted-foreground">per trade</span>
            </Label>
            <div className="relative">
              <Input
                type="number"
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value))}
                min={0}
                step={0.01}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Slippage</span>
              <span className="text-[10px] text-muted-foreground">per trade</span>
            </Label>
            <div className="relative">
              <Input
                type="number"
                value={slippageVal}
                onChange={(e) => setSlippageVal(Number(e.target.value))}
                min={0}
                step={0.01}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Strategy Selection / Config — always built-in, dropdown shows
            human names sorted newest-first by the backend. */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select value={strategyName} onValueChange={(v) => v && handleStrategyChange(v)}>
              <SelectTrigger className="h-auto min-h-10 py-2 text-left">
                <SelectValue placeholder="Select a strategy">
                  {builtinStrategies.find((s) => s.name === strategyName)?.displayName ?? strategyName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {builtinStrategies.map((s) => (
                  <SelectItem key={s.name} value={s.name} className="py-2">
                    <span className="text-sm font-medium">{s.displayName ?? s.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {builtinStrategies.find((s) => s.name === strategyName)?.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {builtinStrategies.find((s) => s.name === strategyName)?.description}
              </p>
            )}
          </div>

            {/* Strategy parameters */}
            {Object.keys(strategyConfig).length > 0 && (
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Parameters
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(strategyConfig).map(([key, value]) => {
                    const enumOpts = ENUM_OPTIONS[key]
                    return (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </Label>
                        {enumOpts ? (
                          <Select
                            value={String(value)}
                            onValueChange={(v) => v && handleConfigChange(key, v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {enumOpts.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={typeof value === "number" ? "number" : "text"}
                            value={String(value)}
                            onChange={(e) => handleConfigChange(key, e.target.value)}
                            className="h-8 text-sm"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
        </div>

        <Separator />

        {/* Run Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleRun}
          disabled={isRunning || (!allMode && coins.length === 0) || !strategyName}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running {allMode ? `all ${COINS.length}` : coins.length > 1 ? `${coins.length}` : "Backtest"}{allMode || coins.length > 1 ? " Backtests..." : "..."}
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              {allMode
                ? `Test All ${COINS.length} (Keep Top 5)`
                : `Run ${coins.length > 1 ? `${coins.length} Backtests` : "Backtest"}`}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
