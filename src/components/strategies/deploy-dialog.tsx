"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Rocket,
  Check,
  AlertCircle,
  ChevronRight,
  Shield,
  DollarSign,
  Loader2,
  Search,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { brokerApi, deployedApi } from "@/lib/api"
import { cn } from "@/lib/utils"

type Broker = {
  id: string
  uid: string
  exchangeId: string
  name: string
  status: string
  balance: number | null
  apiKeyPreview: string
  activeStrategies: number
}

type InstrumentInfo = {
  symbol: string
  minQty: number
  minNotional: number
  qtyIncrement: number
  priceIncrement: number
  maxLeverage: number
}

type DeployDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  strategyId: string
  strategyName: string
  strategyType: string
  defaultPairs?: string[]
  /** When true, the Position Size input is disabled — strategy code enforces its own sizing. */
  positionSizeLocked?: boolean
  /** Default position size percent (0–100). Used as initial value and as the locked display value. */
  defaultPositionSize?: number
}

type Step = "broker" | "config" | "confirm"

const PAIR_GRID_SIZE = 9

function formatPair(pair: string): string {
  // "BTC/USDT:USDT" → "BTC/USDT Perp"
  const [main] = pair.split(":")
  return `${main} Perp`
}

function formatPairShort(pair: string): string {
  // "BTC/USDT:USDT" → "BTC"
  return pair.split("/")[0]
}

function formatQuoteSuffix(pair: string): string {
  // "BTC/USDT:USDT" → "USDT"
  const [, qs] = pair.split("/")
  if (!qs) return ""
  return qs.split(":")[0]
}

export function DeployDialog({
  open,
  onOpenChange,
  strategyId,
  strategyName,
  positionSizeLocked = false,
  defaultPositionSize = 10,
  strategyType,
}: DeployDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("broker")
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  // Form state
  const [selectedBrokerId, setSelectedBrokerId] = useState("")
  const [selectedPair, setSelectedPair] = useState("")
  const [amount, setAmount] = useState("50")
  const [leverage, setLeverage] = useState("10")
  const [positionSize, setPositionSize] = useState(String(defaultPositionSize))

  // Pair list + instrument info state (broker-aware)
  const [availablePairs, setAvailablePairs] = useState<string[]>([])
  const [pairsLoading, setPairsLoading] = useState(false)
  const [pairSearch, setPairSearch] = useState("")
  const [showAllPairs, setShowAllPairs] = useState(false)
  const [instrument, setInstrument] = useState<InstrumentInfo | null>(null)
  const [instrumentLoading, setInstrumentLoading] = useState(false)

  const selectedBrokerMeta = brokers.find((b) => b.id === selectedBrokerId)

  // Reset everything when dialog opens
  useEffect(() => {
    if (!open) return
    setStep("broker")
    setError("")
    setSuccess(false)
    setSelectedBrokerId("")
    setSelectedPair("")
    setAvailablePairs([])
    setInstrument(null)
    setPairSearch("")
    setShowAllPairs(false)
    setLoading(true)

    brokerApi.list().then((res) => {
      if (res.success && res.data) {
        const connected = (res.data as Broker[]).filter((b) => b.status === "CONNECTED")
        setBrokers(connected)
        if (connected.length === 1) {
          setSelectedBrokerId(connected[0].id)
        }
      }
      setLoading(false)
    })
  }, [open])

  // Fetch broker's pair list whenever broker changes
  useEffect(() => {
    if (!selectedBrokerId) {
      setAvailablePairs([])
      setSelectedPair("")
      return
    }
    setPairsLoading(true)
    setSelectedPair("")
    setInstrument(null)
    brokerApi.getPairs(selectedBrokerId).then((res) => {
      if (res.success && Array.isArray(res.data)) {
        const pairs = res.data as string[]
        setAvailablePairs(pairs)
        // Default to BTC/USDT:USDT if present, else first pair
        const defaultPair =
          pairs.find((p) => p.startsWith("BTC/USDT")) ??
          pairs.find((p) => p.startsWith("BTC/")) ??
          pairs[0] ??
          ""
        setSelectedPair(defaultPair)
      } else {
        setAvailablePairs([])
        setError(res.error || "Failed to load pairs for this broker")
      }
      setPairsLoading(false)
    })
  }, [selectedBrokerId])

  // Fetch instrument-info whenever pair changes
  useEffect(() => {
    if (!selectedBrokerId || !selectedPair) {
      setInstrument(null)
      return
    }
    setInstrumentLoading(true)
    brokerApi.getInstrumentInfo(selectedBrokerId, selectedPair).then((res) => {
      if (res.success && res.data) {
        setInstrument(res.data as InstrumentInfo)
      } else {
        setInstrument(null)
      }
      setInstrumentLoading(false)
    })
  }, [selectedBrokerId, selectedPair])

  // Live min-validation math, effective notional = invested × position% × leverage.
  // This mirrors exactly what the live executor trades per entry, so the
  // deploy-time check won't lie to the user.
  const amountNum = parseFloat(amount) || 0
  const leverageNum = parseInt(leverage) || 1
  const positionSizeNum = Math.max(1, Math.min(100, parseFloat(positionSize) || defaultPositionSize))
  const positionSizeFraction = positionSizeNum / 100
  const effectiveNotional = amountNum * positionSizeFraction * leverageNum
  const minNotional = instrument?.minNotional ?? 0
  const meetsMin = !instrument || minNotional === 0 || effectiveNotional >= minNotional
  const maxLeverage = instrument?.maxLeverage ?? 100
  const leverageOverMax = leverageNum > maxLeverage

  // Filtered pair list for the search dropdown
  const filteredPairs = useMemo(() => {
    const q = pairSearch.trim().toUpperCase()
    if (!q) return availablePairs
    return availablePairs.filter((p) => p.toUpperCase().includes(q))
  }, [availablePairs, pairSearch])

  const visiblePairsGrid = availablePairs.slice(0, PAIR_GRID_SIZE)

  const handleDeploy = async () => {
    if (!selectedBrokerId || !selectedPair || !amount) return
    if (!meetsMin || leverageOverMax) return

    setDeploying(true)
    setError("")

    const res = await deployedApi.deploy({
      strategyId,
      brokerId: selectedBrokerId,
      pair: selectedPair,
      investedAmount: parseFloat(amount),
      config: {
        leverage: parseInt(leverage),
        // If locked, server honours strategy.defaultPositionSize anyway — send
        // it through so DB config stays self-descriptive.
        positionSizePercent: positionSizeLocked ? defaultPositionSize : positionSizeNum,
      },
    })

    setDeploying(false)

    if (res.success) {
      setSuccess(true)
      setTimeout(() => {
        onOpenChange(false)
        router.push("/deployed")
      }, 1500)
    } else {
      setError(res.error || "Failed to deploy strategy")
    }
  }

  const selectedBroker = selectedBrokerMeta

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Deploy Strategy
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-profit/10">
              <Check className="h-7 w-7 text-profit" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">Strategy Deployed!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {strategyName} is now running on {selectedBroker?.name} ({selectedBroker?.uid})
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Redirecting to deployed strategies...</p>
          </motion.div>
        ) : (
          <div className="space-y-5">
            {/* Progress steps */}
            <div className="flex items-center gap-2">
              {(["broker", "config", "confirm"] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                      step === s
                        ? "bg-primary text-primary-foreground"
                        : (["broker", "config", "confirm"].indexOf(step) > i)
                          ? "bg-profit/10 text-profit"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {["broker", "config", "confirm"].indexOf(step) > i ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  {i < 2 && (
                    <div className={cn(
                      "h-px w-8 transition-colors",
                      ["broker", "config", "confirm"].indexOf(step) > i ? "bg-profit" : "bg-border"
                    )} />
                  )}
                </div>
              ))}
              <div className="ml-2 text-xs text-muted-foreground">
                {step === "broker" ? "Select Broker" : step === "config" ? "Configure" : "Confirm"}
              </div>
            </div>

            {/* Strategy info bar */}
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Rocket className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{strategyName}</p>
                <p className="text-[11px] text-muted-foreground">{strategyType} Strategy</p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {/* Step 1: Select Broker */}
              {step === "broker" && (
                <motion.div
                  key="broker"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-3"
                >
                  <p className="text-sm font-medium">Which broker do you want to use?</p>

                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : brokers.length === 0 ? (
                    <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 text-center">
                      <AlertCircle className="mx-auto h-8 w-8 text-warning" />
                      <p className="mt-2 text-sm font-medium">No brokers connected</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Connect a broker first to deploy strategies
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => { onOpenChange(false); router.push("/brokers") }}
                      >
                        Go to Brokers
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {brokers.map((broker) => (
                        <button
                          key={broker.id}
                          onClick={() => setSelectedBrokerId(broker.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all",
                            selectedBrokerId === broker.id
                              ? "border-primary bg-primary/5"
                              : "border-border/50 hover:border-primary/30 hover:bg-accent/50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold",
                              selectedBrokerId === broker.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}>
                              {broker.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">
                                {broker.name}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  ({broker.uid})
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {broker.balance != null ? `Balance: $${broker.balance.toLocaleString()}` : "Connected"} &middot; {broker.activeStrategies} active
                              </p>
                            </div>
                          </div>
                          {selectedBrokerId === broker.id && (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                              <Check className="h-3.5 w-3.5 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => setStep("config")}
                      disabled={!selectedBrokerId}
                    >
                      Next <ChevronRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Configure */}
              {step === "config" && (
                <motion.div
                  key="config"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  {/* Trading pair */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Trading Pair</Label>
                      {availablePairs.length > PAIR_GRID_SIZE && (
                        <button
                          onClick={() => setShowAllPairs((v) => !v)}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {showAllPairs ? "Show top 9" : `Search all ${availablePairs.length} pairs`}
                        </button>
                      )}
                    </div>

                    {pairsLoading ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading pairs from broker...
                      </div>
                    ) : showAllPairs ? (
                      <div className="mt-1.5 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search pair (BTC, ETH, DOGE...)"
                            value={pairSearch}
                            onChange={(e) => setPairSearch(e.target.value)}
                            className="h-8 bg-muted/30 pl-8 text-xs"
                          />
                        </div>
                        <div className="max-h-44 overflow-y-auto rounded-lg border border-border/50 bg-muted/10">
                          {filteredPairs.length === 0 ? (
                            <p className="p-3 text-center text-[11px] text-muted-foreground">
                              No matching pairs
                            </p>
                          ) : (
                            filteredPairs.slice(0, 100).map((pair) => (
                              <button
                                key={pair}
                                onClick={() => { setSelectedPair(pair); setShowAllPairs(false); }}
                                className={cn(
                                  "flex w-full items-center justify-between border-b border-border/30 px-3 py-1.5 text-left text-xs transition-colors last:border-b-0",
                                  selectedPair === pair
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-accent/50"
                                )}
                              >
                                <span className="font-medium">{pair.split(":")[0]}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatQuoteSuffix(pair)}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        {visiblePairsGrid.map((pair) => (
                          <button
                            key={pair}
                            onClick={() => setSelectedPair(pair)}
                            className={cn(
                              "rounded-lg border px-2.5 py-2 text-xs font-medium transition-all",
                              selectedPair === pair
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 text-muted-foreground hover:border-primary/30"
                            )}
                          >
                            {formatPairShort(pair)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Investment amount */}
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Investment Amount <span className="text-[10px]">(multiples of $50, min $50)</span>
                    </Label>
                    <div className="relative mt-1.5">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onBlur={(e) => {
                          const raw = Number(e.target.value) || 50
                          const snapped = Math.max(50, Math.round(raw / 50) * 50)
                          setAmount(String(snapped))
                        }}
                        className="bg-muted/30 pl-9"
                        placeholder="50"
                        min="50"
                        step="50"
                      />
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      {["50", "100", "150", "250", "500"].map((v) => (
                        <button
                          key={v}
                          onClick={() => setAmount(v)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors",
                            amount === v
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          ${v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Leverage */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Leverage</Label>
                      {instrument && (
                        <span className="text-[10px] text-muted-foreground">
                          Max: {maxLeverage}x
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      {["1", "5", "10", "25", "50"].map((v) => {
                        const n = parseInt(v)
                        const disabled = n > maxLeverage
                        return (
                          <button
                            key={v}
                            disabled={disabled}
                            onClick={() => setLeverage(v)}
                            className={cn(
                              "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-30",
                              leverage === v && !disabled
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            )}
                          >
                            {v}X
                          </button>
                        )
                      })}
                    </div>
                    <Input
                      type="number"
                      value={leverage}
                      onChange={(e) => setLeverage(e.target.value)}
                      className="mt-2 h-8 bg-muted/30 text-xs"
                      placeholder="Custom leverage"
                      min="1"
                      max={maxLeverage}
                    />
                  </div>

                  {/* Position Size (% of investment deployed per trade) */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">
                        Position Size (%)
                      </Label>
                      {positionSizeLocked && (
                        <span className="text-[10px] font-medium text-warning">
                          Locked by strategy · {defaultPositionSize}%
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      {["10", "25", "50", "75", "100"].map((v) => (
                        <button
                          key={v}
                          disabled={positionSizeLocked}
                          onClick={() => setPositionSize(v)}
                          className={cn(
                            "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40",
                            positionSize === v && !positionSizeLocked
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {v}%
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      value={positionSizeLocked ? String(defaultPositionSize) : positionSize}
                      onChange={(e) => setPositionSize(e.target.value)}
                      disabled={positionSizeLocked}
                      className="mt-2 h-8 bg-muted/30 text-xs disabled:opacity-60"
                      placeholder="Custom position size %"
                      min="1"
                      max="100"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {positionSizeLocked
                        ? "This strategy's code sets its own position size, cannot be overridden."
                        : "Fraction of your investment deployed per entry."}
                    </p>
                    {/* Per-trade margin check — must be >= $50 */}
                    {(() => {
                      const perTrade = amountNum * positionSizeFraction
                      const ok = perTrade >= 50
                      return (
                        <p className={cn("mt-1.5 text-[11px]", ok ? "text-muted-foreground" : "text-loss")}>
                          Per-trade margin: <span className="font-semibold">${perTrade.toFixed(2)}</span>
                          {!ok && " — below $50 minimum, trades will be skipped with a margin-call notification."}
                        </p>
                      )
                    })()}
                  </div>

                  {/* Live min-notional readout */}
                  {instrumentLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading instrument rules...
                    </div>
                  ) : instrument ? (
                    <div
                      className={cn(
                        "rounded-lg border p-2.5 text-[11px]",
                        meetsMin && !leverageOverMax
                          ? "border-profit/20 bg-profit/5 text-profit"
                          : "border-loss/20 bg-loss/5 text-loss"
                      )}
                    >
                      {leverageOverMax ? (
                        <span>
                          ⚠ Leverage {leverageNum}x exceeds {selectedBroker?.name}'s max of {maxLeverage}x for this pair.
                        </span>
                      ) : meetsMin ? (
                        <span>
                          ✓ Per-trade notional <strong>${effectiveNotional.toFixed(2)}</strong>
                          {" "}(<strong>${amountNum.toFixed(2)}</strong> × {positionSizeNum}% × {leverageNum}x)
                          {" "}meets minimum (${minNotional.toFixed(2)}).
                        </span>
                      ) : (
                        <span>
                          ⚠ Per-trade notional <strong>${effectiveNotional.toFixed(2)}</strong>
                          {" "}(<strong>${amountNum.toFixed(2)}</strong> × {positionSizeNum}% × {leverageNum}x)
                          {" "}below minimum <strong>${minNotional.toFixed(2)}</strong>.
                          {" "}Increase investment, position size, or leverage.
                          {" "}e.g. ${Math.ceil(minNotional / (positionSizeFraction * leverageNum)).toFixed(2)} at current settings.
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("broker")}>
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => setStep("confirm")}
                      disabled={
                        !selectedPair || !amount || amountNum < 50 || !meetsMin || leverageOverMax ||
                        (amountNum * positionSizeFraction) < 50
                      }
                    >
                      Next <ChevronRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Confirm */}
              {step === "confirm" && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                    {[
                      { label: "Strategy", value: strategyName },
                      { label: "Broker", value: selectedBroker ? `${selectedBroker.name} (${selectedBroker.uid})` : "" },
                      { label: "Pair", value: formatPair(selectedPair) },
                      { label: "Amount", value: `$${amountNum.toLocaleString()}` },
                      { label: "Leverage", value: `${leverage}X` },
                      { label: "Notional", value: `$${effectiveNotional.toFixed(2)}` },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-medium">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/5 p-3">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      This will deploy a <strong>live strategy</strong> on your {selectedBroker?.name} account.
                      The bot will execute real trades. Past performance does not guarantee future results.
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-lg border border-loss/20 bg-loss/5 p-3 text-xs text-loss">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("config")}>
                      Back
                    </Button>
                    <Button className="flex-1" onClick={handleDeploy} disabled={deploying}>
                      {deploying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Rocket className="mr-2 h-4 w-4" /> Deploy Now
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
