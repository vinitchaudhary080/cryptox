"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Check,
  Trash2,
  Edit3,
  ExternalLink,
  Shield,
  Wallet,
  Zap,
  TrendingUp,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  ArrowRight,
  X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { brokerApi } from "@/lib/api"
import { availableBrokers } from "@/lib/mock-data"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  CONNECTED: { label: "Connected", className: "bg-profit/10 text-profit border-profit/20", dot: "bg-profit" },
  DISCONNECTED: { label: "Not Connected", className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  ERROR: { label: "Error", className: "bg-loss/10 text-loss border-loss/20", dot: "bg-loss" },
}

type ApiBroker = {
  id: string
  exchangeId: string
  name: string
  status: string
  connectedAt: string
  apiKeyPreview: string
  balance: number | null
  activeStrategies: number
}

export default function BrokersPage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [step, setStep] = useState<"select" | "configure">("select")
  const [brokers, setBrokers] = useState<ApiBroker[]>([])
  const [newApiKey, setNewApiKey] = useState("")
  const [newApiSecret, setNewApiSecret] = useState("")
  const [newPassphrase, setNewPassphrase] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState("")

  const fetchBrokers = () => {
    brokerApi.list().then((res) => {
      if (res.success && res.data) setBrokers(res.data as ApiBroker[])
    })
  }

  useEffect(() => { fetchBrokers() }, [])

  const connectedBrokers = brokers.filter((b) => b.status === "CONNECTED")
  const totalBalance = connectedBrokers.reduce((s, b) => s + (b.balance ?? 0), 0)
  const totalPnl = 0 // Will come from portfolio API

  const handleOpenAdd = () => {
    setStep("select")
    setSelectedBroker(null)
    setNewApiKey("")
    setNewApiSecret("")
    setNewPassphrase("")
    setConnectError("")
    setAddDialogOpen(true)
  }

  const handleConnect = async () => {
    if (!selectedBroker || !newApiKey || !newApiSecret) return
    const ab = availableBrokers.find((b) => b.id === selectedBroker)
    if (!ab) return

    setConnecting(true)
    setConnectError("")
    const res = await brokerApi.connect({
      exchangeId: ab.id,
      name: ab.name,
      apiKey: newApiKey,
      apiSecret: newApiSecret,
      passphrase: newPassphrase || undefined,
    })
    setConnecting(false)

    if (res.success) {
      setAddDialogOpen(false)
      fetchBrokers()
    } else {
      setConnectError(res.error || "Connection failed")
    }
  }

  const handleSelectBroker = (id: string) => {
    setSelectedBroker(id)
    setStep("configure")
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="mx-auto max-w-5xl space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brokers</h1>
          <p className="text-sm text-muted-foreground">
            Connect and manage your exchange accounts
          </p>
        </div>
        <Button size="sm" onClick={handleOpenAdd}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Add Broker
        </Button>
      </motion.div>

      {/* Overview Stats */}
      <motion.div variants={fadeUp} className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Connected Brokers", value: connectedBrokers.length.toString(), icon: Shield, sub: `${brokers.length - connectedBrokers.length} available` },
          { label: "Total Balance", value: `$${totalBalance.toLocaleString()}`, icon: Wallet, sub: "Across all brokers" },
          { label: "Total PnL", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toLocaleString()}`, icon: TrendingUp, sub: "All time", positive: totalPnl >= 0 },
          { label: "Active Strategies", value: connectedBrokers.reduce((s, b) => s + b.activeStrategies, 0).toString(), icon: Zap, sub: "Running now" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className={`mt-1.5 text-xl font-bold ${stat.positive === false ? "text-loss" : stat.positive ? "text-profit" : ""}`}>
                {stat.value}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Connected Brokers */}
      <motion.div variants={fadeUp} className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Your Brokers</h2>
        {brokers.map((broker) => {
          const sc = statusConfig[broker.status]
          return (
            <Card key={broker.id} className={`border-border/50 bg-card/80 transition-all ${broker.status === "CONNECTED" ? "hover:border-primary/20" : ""}`}>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Broker info */}
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold ${broker.status === "CONNECTED" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {broker.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-semibold">{broker.name}</h3>
                        <Badge variant="outline" className={sc.className}>
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot} ${broker.status === "CONNECTED" ? "animate-pulse" : ""}`} />
                          {sc.label}
                        </Badge>
                      </div>
                      {broker.status === "CONNECTED" ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          API Key: {broker.apiKeyPreview} &middot; Connected {new Date(broker.connectedAt).toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Not connected — click Connect to set up
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats + Actions */}
                  {broker.status === "CONNECTED" ? (
                    <div className="flex items-center gap-4">
                      <div className="hidden gap-6 sm:flex">
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Balance</p>
                          <p className="text-sm font-semibold">{broker.balance != null ? `$${broker.balance.toLocaleString()}` : "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Strategies</p>
                          <p className="text-sm font-semibold">{broker.activeStrategies}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm">
                          <Edit3 className="mr-1.5 h-3 w-3" /> Edit
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-loss">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" onClick={handleOpenAdd}>
                      Connect <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Mobile stats for connected */}
                {broker.status === "CONNECTED" && (
                  <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/50 pt-3 sm:hidden">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Balance</p>
                      <p className="text-sm font-semibold">{broker.balance != null ? `$${broker.balance.toLocaleString()}` : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Strategies</p>
                      <p className="text-sm font-semibold">{broker.activeStrategies}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </motion.div>

      {/* Security Note */}
      <motion.div variants={fadeUp}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-4 p-5">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Your keys are safe</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                We only request <strong>trade-only</strong> API permissions. Your funds stay on the exchange — CryptoX never has withdrawal access.
                All API keys are encrypted at rest with AES-256 and transmitted over TLS 1.3. We recommend enabling IP whitelisting on your exchange for added security.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Add Broker Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {step === "select" ? "Add a Broker" : "Connect Exchange"}
            </DialogTitle>
          </DialogHeader>

          {step === "select" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Choose an exchange to connect</p>
              <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                {availableBrokers.map((ab) => {
                  const alreadyConnected = brokers.some((b) => b.name === ab.name && b.status === "connected")
                  return (
                    <button
                      key={ab.id}
                      onClick={() => !alreadyConnected && handleSelectBroker(ab.id)}
                      disabled={alreadyConnected}
                      className={`w-full rounded-lg border p-4 text-left transition-all ${
                        alreadyConnected
                          ? "cursor-not-allowed border-border/30 opacity-50"
                          : "border-border/50 hover:border-primary/30 hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                            {ab.shortName}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{ab.name}</p>
                              {alreadyConnected && (
                                <Badge variant="secondary" className="text-[10px]">
                                  <Check className="mr-1 h-2.5 w-2.5" /> Connected
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{ab.region}</p>
                          </div>
                        </div>
                        {!alreadyConnected && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{ab.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ab.features.map((f) => (
                          <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {selectedBroker && (
                <>
                  <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {availableBrokers.find((b) => b.id === selectedBroker)?.shortName}
                    </div>
                    <div>
                      <p className="font-semibold">{availableBrokers.find((b) => b.id === selectedBroker)?.name}</p>
                      <p className="text-xs text-muted-foreground">Configure API credentials</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <Input className="mt-1.5 bg-muted/50 font-mono text-sm" placeholder="Enter your API key" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">API Secret</Label>
                      <div className="relative mt-1.5">
                        <Input
                          className="bg-muted/50 pr-10 font-mono text-sm"
                          placeholder="Enter your API secret"
                          type={showApiKey ? "text" : "password"}
                          value={newApiSecret}
                          onChange={(e) => setNewApiSecret(e.target.value)}
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Passphrase (if required)</Label>
                      <Input className="mt-1.5 bg-muted/50 font-mono text-sm" placeholder="Optional" type="password" value={newPassphrase} onChange={(e) => setNewPassphrase(e.target.value)} />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
                      <div>
                        <p className="text-sm font-medium">IP Whitelisting</p>
                        <p className="text-[10px] text-muted-foreground">Restrict API to CryptoX servers only</p>
                      </div>
                      <Switch defaultChecked />
                    </div>

                    <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <div>
                          <p className="text-xs font-medium text-warning">Important</p>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                            Enable only <strong>trade</strong> permissions on your exchange.
                            Do NOT enable withdrawal permissions. CryptoX will verify permissions before connecting.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {connectError && (
                    <div className="rounded-lg border border-loss/20 bg-loss/5 p-3 text-xs text-loss">
                      {connectError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("select")}>
                      Back
                    </Button>
                    <Button className="flex-1" onClick={handleConnect} disabled={connecting || !newApiKey || !newApiSecret}>
                      {connecting ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      ) : (
                        <><Check className="mr-2 h-3.5 w-3.5" /> Connect Broker</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
