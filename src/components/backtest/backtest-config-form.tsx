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
import { backtestApi } from "@/lib/api"
import { StrategyRuleBuilder } from "./strategy-rule-builder"

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
  name: string
  description: string
  defaultConfig: Record<string, unknown>
}

interface UIRule {
  conditions: { indicator: string; period: number; key?: string; operator: string; value: number }[]
  action: "BUY" | "SELL"
  sl_percent: number
  tp_percent: number
  position_size_percent: number
  leverage: number
}

interface UIExitRule {
  conditions: { indicator: string; period: number; key?: string; operator: string; value: number }[]
  close_side: "BUY" | "SELL" | "ALL"
}

export function BacktestConfigForm({
  onRunStarted,
}: {
  onRunStarted: (id: string) => void
}) {
  const [coin, setCoin] = useState("BTC")
  const [startDate, setStartDate] = useState("2023-01-01")
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [strategyType, setStrategyType] = useState<"code" | "ui">("code")
  const [strategyName, setStrategyName] = useState("")
  const [initialCapital, setInitialCapital] = useState(50)
  const [commission, setCommission] = useState(0.05)   // 0.05% per trade
  const [slippageVal, setSlippageVal] = useState(0.1)   // 0.1% per trade
  const [isRunning, setIsRunning] = useState(false)

  // Built-in strategy state
  const [builtinStrategies, setBuiltinStrategies] = useState<BuiltinStrategy[]>([])
  const [strategyConfig, setStrategyConfig] = useState<Record<string, unknown>>({})

  // UI rules state
  const [entryRules, setEntryRules] = useState<UIRule[]>([])
  const [exitRules, setExitRules] = useState<UIExitRule[]>([])

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

  const handleRun = async () => {
    setIsRunning(true)
    try {
      const config = {
        coin,
        startDate,
        endDate,
        strategyType,
        strategyName: strategyType === "code" ? strategyName : "Custom UI Strategy",
        strategyConfig: strategyType === "code"
          ? strategyConfig
          : { entry_rules: entryRules, exit_rules: exitRules },
        initialCapital,
        makerFee: commission / 100,     // convert 0.05% → 0.0005
        slippage: slippageVal / 100,    // convert 0.01% → 0.0001
      }

      const res = await backtestApi.run(config)
      if (res.success && res.data) {
        onRunStarted((res.data as { id: string }).id)
      }
    } catch (err) {
      console.error("Backtest run failed:", err)
    } finally {
      setIsRunning(false)
    }
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
        {/* Coin & Date Range */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Coin</Label>
            <Select value={coin} onValueChange={(v) => v && setCoin(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COINS.map((c) => (
                  <SelectItem key={c.short} value={c.short}>
                    {c.short}, {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

        {/* Initial Capital */}
        <div className="space-y-2">
          <Label className="flex items-center justify-between">
            <span>Initial Capital (USD)</span>
            <span className="text-[10px] text-muted-foreground">multiples of $50, min $50</span>
          </Label>
          <Input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            onBlur={(e) => {
              const raw = Number(e.target.value) || 50;
              // Snap to nearest multiple of 50 (round up), clamp min 50
              const snapped = Math.max(50, Math.round(raw / 50) * 50);
              setInitialCapital(snapped);
            }}
            min={50}
            step={50}
          />
          {(() => {
            const sizePct = Number((strategyConfig as Record<string, unknown>).positionSizePercent);
            if (!Number.isFinite(sizePct) || sizePct <= 0) return null;
            const margin = (initialCapital * sizePct) / 100;
            const insufficient = margin < 50;
            return (
              <p className={`text-xs ${insufficient ? "text-loss" : "text-muted-foreground"}`}>
                Per-trade margin: <span className="font-semibold">${margin.toFixed(2)}</span>
                {insufficient && <span> — below $50 minimum, trades will be skipped (margin call).</span>}
              </p>
            );
          })()}
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

        {/* Strategy Type Toggle */}
        <div className="space-y-3">
          <Label>Strategy Type</Label>
          <div className="flex gap-2">
            <Button
              variant={strategyType === "code" ? "default" : "outline"}
              size="sm"
              onClick={() => setStrategyType("code")}
            >
              Built-in Strategy
            </Button>
            <Button
              variant={strategyType === "ui" ? "default" : "outline"}
              size="sm"
              onClick={() => setStrategyType("ui")}
            >
              Custom Rules
            </Button>
          </div>
        </div>

        {/* Strategy Selection / Config */}
        {strategyType === "code" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Strategy</Label>
              <Select value={strategyName} onValueChange={(v) => v && handleStrategyChange(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
                <SelectContent>
                  {builtinStrategies.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {builtinStrategies.find((s) => s.name === strategyName)?.description && (
                <p className="text-xs text-muted-foreground">
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
                  {Object.entries(strategyConfig).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </Label>
                      <Input
                        type="number"
                        value={String(value)}
                        onChange={(e) => handleConfigChange(key, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <StrategyRuleBuilder
            entryRules={entryRules}
            exitRules={exitRules}
            onEntryRulesChange={setEntryRules}
            onExitRulesChange={setExitRules}
          />
        )}

        <Separator />

        {/* Run Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleRun}
          disabled={isRunning || (!strategyName && strategyType === "code") || (strategyType === "ui" && entryRules.length === 0)}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Backtest
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
