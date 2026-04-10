"use client"

import { useState, useEffect } from "react"
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

type DeployDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  strategyId: string
  strategyName: string
  strategyType: string
  defaultPairs?: string[]
}

const AVAILABLE_PAIRS = [
  "BTC/USD:USD",
  "ETH/USD:USD",
  "SOL/USD:USD",
  "XRP/USD:USD",
  "DOGE/USD:USD",
  "SUI/USD:USD",
  "LINK/USD:USD",
  "AVAX/USD:USD",
  "ADA/USD:USD",
  "DOT/USD:USD",
  "NEAR/USD:USD",
  "INJ/USD:USD",
  "ARB/USD:USD",
  "OP/USD:USD",
]

type Step = "broker" | "config" | "confirm"

export function DeployDialog({
  open,
  onOpenChange,
  strategyId,
  strategyName,
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
  const [selectedPair, setSelectedPair] = useState("BTC/USD:USD")
  const [amount, setAmount] = useState("500")
  const [leverage, setLeverage] = useState("10")

  // Fetch connected brokers
  useEffect(() => {
    if (!open) return
    setStep("broker")
    setError("")
    setSuccess(false)
    setSelectedBrokerId("")
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

  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId)

  const handleDeploy = async () => {
    if (!selectedBrokerId || !selectedPair || !amount) return

    setDeploying(true)
    setError("")

    const res = await deployedApi.deploy({
      strategyId,
      brokerId: selectedBrokerId,
      pair: selectedPair,
      investedAmount: parseFloat(amount),
      config: {
        leverage: parseInt(leverage),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Deploy Strategy
          </DialogTitle>
        </DialogHeader>

        {/* Success state */}
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
                              <p className="text-sm font-semibold">{broker.name} <span className="text-xs font-normal text-muted-foreground">({broker.uid})</span></p>
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
                    <Label className="text-xs text-muted-foreground">Trading Pair</Label>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      {AVAILABLE_PAIRS.slice(0, 9).map((pair) => {
                        const display = pair.replace("/USD:USD", "")
                        return (
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
                            {display}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Investment amount */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Investment Amount (USD)</Label>
                    <div className="relative mt-1.5">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="bg-muted/30 pl-9"
                        placeholder="500"
                      />
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      {["100", "500", "1000", "5000"].map((v) => (
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
                    <Label className="text-xs text-muted-foreground">Leverage</Label>
                    <div className="mt-2 flex gap-2">
                      {["5", "10", "15", "20", "25"].map((v) => (
                        <button
                          key={v}
                          onClick={() => setLeverage(v)}
                          className={cn(
                            "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all",
                            leverage === v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {v}X
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("broker")}>
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => setStep("confirm")}
                      disabled={!amount || parseFloat(amount) <= 0}
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
                      { label: "Pair", value: selectedPair.replace("/USD:USD", "/USD") },
                      { label: "Amount", value: `$${parseFloat(amount).toLocaleString()}` },
                      { label: "Leverage", value: `${leverage}X` },
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
