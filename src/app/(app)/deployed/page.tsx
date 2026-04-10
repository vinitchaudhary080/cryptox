"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Rocket,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Zap,
  Pause,
  Play,
  Square,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  ChevronDown,
  Loader2,
  Trash2,
  Activity,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import { deployedApi, brokerApi } from "@/lib/api"
import { deployedStrategies as mockDeployed, brokers as mockBrokers, type DeployedStrategy } from "@/lib/mock-data"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

const statusConfig = {
  active: { label: "Active", className: "bg-profit/10 text-profit border-profit/20", dot: "bg-profit animate-pulse" },
  paused: { label: "Paused", className: "bg-warning/10 text-warning border-warning/20", dot: "bg-warning" },
  stopped: { label: "Stopped", className: "bg-loss/10 text-loss border-loss/20", dot: "bg-loss" },
}

function StrategyList({
  strategies,
  onSelect,
  brokerFilter,
  setBrokerFilter,
  statusFilter,
  setStatusFilter,
}: {
  strategies: DeployedStrategy[]
  onSelect: (s: DeployedStrategy) => void
  brokerFilter: string
  setBrokerFilter: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
}) {
  const filtered = strategies.filter((s) => {
    const matchesBroker = brokerFilter === "all" || s.brokerId === brokerFilter
    const matchesStatus = statusFilter === "all" || s.status === statusFilter
    return matchesBroker && matchesStatus
  })

  const totalPnl = filtered.reduce((s, v) => s + v.totalPnl, 0)
  const totalInvested = filtered.reduce((s, v) => s + v.investedAmount, 0)
  const activeCount = filtered.filter((s) => s.status === "active").length

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deployed Strategies</h1>
          <p className="text-sm text-muted-foreground">
            Monitor all your running strategies and their trades
          </p>
        </div>
      </motion.div>

      {/* Overview Stats */}
      <motion.div variants={fadeUp} className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Invested", value: `$${totalInvested.toLocaleString()}`, icon: DollarSign },
          { label: "Total PnL", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, icon: TrendingUp, positive: totalPnl >= 0 },
          { label: "Active", value: activeCount.toString(), icon: Zap },
          { label: "Win Rate (avg)", value: `${(filtered.reduce((s, v) => s + v.winRate, 0) / (filtered.length || 1)).toFixed(0)}%`, icon: Target },
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
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Filter:</span>
        </div>
        <Select value={brokerFilter} onValueChange={(v) => setBrokerFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-[160px] bg-muted/50 text-xs">
            <SelectValue placeholder="All Brokers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brokers</SelectItem>
            {mockBrokers.filter((b) => b.status === "connected").map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-[140px] bg-muted/50 text-xs">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
          </SelectContent>
        </Select>
        {(brokerFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setBrokerFilter("all"); setStatusFilter("all") }}
          >
            Clear Filters
          </Button>
        )}
      </motion.div>

      {/* Strategy Cards */}
      <div className="space-y-3">
        {filtered.map((strategy) => {
          const sc = statusConfig[strategy.status]
          return (
            <motion.div key={strategy.id} variants={fadeUp}>
              <Card
                className="cursor-pointer border-border/50 bg-card/80 transition-all hover:border-primary/20 hover:shadow-md"
                onClick={() => onSelect(strategy)}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left info */}
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                        {strategy.brokerShortName}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{strategy.strategyName}</h3>
                          <Badge variant="secondary" className="text-[10px]">{strategy.strategyType}</Badge>
                          <Badge variant="outline" className={sc.className}>
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {strategy.pair} &middot; {strategy.brokerName} &middot; Since {strategy.deployedAt}
                        </p>
                      </div>
                    </div>

                    {/* Right stats */}
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Invested</p>
                        <p className="text-sm font-medium">${strategy.investedAmount.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">PnL</p>
                        <p className={`text-sm font-bold ${strategy.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {strategy.totalPnl >= 0 ? "+" : ""}${strategy.totalPnl.toFixed(2)}
                          <span className="ml-1 text-[10px] font-medium">
                            ({strategy.totalPnl >= 0 ? "+" : ""}{strategy.totalPnlPercent}%)
                          </span>
                        </p>
                      </div>
                      <div className="hidden text-right md:block">
                        <p className="text-[10px] text-muted-foreground">Today</p>
                        <p className={`text-sm font-medium ${strategy.todayPnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {strategy.todayPnl >= 0 ? "+" : ""}${strategy.todayPnl.toFixed(2)}
                        </p>
                      </div>
                      <div className="hidden text-right md:block">
                        <p className="text-[10px] text-muted-foreground">Trades</p>
                        <p className="text-sm font-medium">{strategy.totalTrades}</p>
                      </div>
                      <div className="hidden text-right lg:block">
                        <p className="text-[10px] text-muted-foreground">Win Rate</p>
                        <p className="text-sm font-medium">{strategy.winRate}%</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <Rocket className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No deployed strategies found</p>
            <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or deploy a new strategy</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

type ApiTrade = {
  id: string
  pair: string
  side: string
  entryPrice: number
  exitPrice: number | null
  quantity: number
  pnl: number
  fee: number
  status: string
  openedAt: string
  closedAt: string | null
}

function StrategyDetail({
  strategy: initialStrategy,
  onBack,
}: {
  strategy: DeployedStrategy
  onBack: () => void
}) {
  const [strategy, setStrategy] = useState(initialStrategy)
  const [currentStatus, setCurrentStatus] = useState(initialStrategy.status)
  const sc = statusConfig[currentStatus] || statusConfig["active"]
  const [liveTrades, setLiveTrades] = useState<ApiTrade[]>([])
  const [tradesLoading, setTradesLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState("")
  const router = useRouter()

  const handlePause = async () => {
    setActionLoading("pause")
    const res = await deployedApi.pause(strategy.id)
    setActionLoading(null)
    if (res.success) {
      setCurrentStatus("paused")
      setActionMsg((res as { message?: string }).message || "Paused")
      // Refresh trades to show closed positions
      const tr = await deployedApi.getTrades(strategy.id)
      if (tr.success && tr.data) setLiveTrades(tr.data as ApiTrade[])
    }
  }

  const handleResume = async () => {
    setActionLoading("resume")
    const res = await deployedApi.resume(strategy.id)
    setActionLoading(null)
    if (res.success) {
      setCurrentStatus("active")
      setActionMsg((res as { message?: string }).message || "Resumed")
    }
  }

  const handleStop = async () => {
    setActionLoading("stop")
    const res = await deployedApi.stop(strategy.id)
    setActionLoading(null)
    if (res.success) {
      setCurrentStatus("stopped")
      setActionMsg((res as { message?: string }).message || "Stopped")
      const tr = await deployedApi.getTrades(strategy.id)
      if (tr.success && tr.data) setLiveTrades(tr.data as ApiTrade[])
    }
  }

  const handleDelete = async () => {
    setActionLoading("delete")
    const res = await deployedApi.remove(strategy.id)
    setActionLoading(null)
    if (res.success) {
      onBack()
    }
  }

  // Auto-refresh trades + strategy stats every 5s for real-time updates
  useEffect(() => {
    const fetchAll = () => {
      // Refresh trades
      deployedApi.getTrades(strategy.id).then((res) => {
        if (res.success && res.data) setLiveTrades(res.data as ApiTrade[])
        setTradesLoading(false)
      })
      // Refresh strategy stats (PnL, currentValue, etc.)
      deployedApi.get(strategy.id).then((res) => {
        if (res.success && res.data) {
          const d = res.data as Record<string, unknown>
          setStrategy((prev) => ({
            ...prev,
            currentValue: Number(d.currentValue ?? prev.currentValue),
            totalPnl: Number((d.currentValue as number) ?? prev.currentValue) - prev.investedAmount,
            totalTrades: (d._count as Record<string, number>)?.trades ?? prev.totalTrades,
          }))
          setCurrentStatus(String(d.status ?? currentStatus).toLowerCase() as "active" | "paused" | "stopped")
        }
      })
    }
    fetchAll()
    const interval = setInterval(fetchAll, 5_000)
    return () => clearInterval(interval)
  }, [strategy.id])

  const trades = liveTrades.length > 0 ? liveTrades : strategy.trades as unknown as ApiTrade[]
  const openTrades = trades.filter((t) => t.status === "OPEN" || t.status === "open")
  const closedTrades = trades.filter((t) => t.status === "CLOSED" || t.status === "closed")

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{strategy.strategyName}</h1>
              <Badge variant="outline" className={sc.className}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                {sc.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {strategy.pair} &middot; {strategy.brokerName} &middot; {strategy.strategyType}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {currentStatus === "active" && (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={actionLoading !== null}>
              {actionLoading === "pause" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Pause className="mr-1.5 h-3.5 w-3.5" />}
              Pause
            </Button>
          )}
          {currentStatus === "paused" && (
            <Button variant="outline" size="sm" onClick={handleResume} disabled={actionLoading !== null}>
              {actionLoading === "resume" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              Resume
            </Button>
          )}

          <Button variant="outline" size="sm" className="text-loss hover:bg-loss/10 hover:text-loss" onClick={handleDelete} disabled={actionLoading !== null}>
            {actionLoading === "delete" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            Delete
          </Button>
        </div>
      </motion.div>

      {/* Action feedback message */}
      {actionMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-primary"
        >
          {actionMsg}
        </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        {(() => {
          const realizedPnl = closedTrades.reduce((s, t) => s + t.pnl, 0)
          const unrealizedPnl = strategy.currentValue - strategy.investedAmount - realizedPnl
          return [
            { label: "Invested", value: `$${strategy.investedAmount.toLocaleString()}`, icon: DollarSign },
            { label: "Current Value", value: `$${strategy.currentValue.toLocaleString()}`, icon: DollarSign, positive: strategy.currentValue >= strategy.investedAmount },
            { label: "Total PnL", value: `${strategy.totalPnl >= 0 ? "+" : ""}$${strategy.totalPnl.toFixed(2)}`, icon: strategy.totalPnl >= 0 ? TrendingUp : TrendingDown, positive: strategy.totalPnl >= 0 },
            { label: "Unrealized PnL", value: `${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)}`, icon: Activity, positive: unrealizedPnl >= 0, live: openTrades.length > 0 },
            { label: "Win Rate", value: `${strategy.winRate}%`, icon: Target },
            { label: "Open / Total", value: `${openTrades.length} / ${strategy.totalTrades}`, icon: Zap },
          ]
        })().map((stat) => (
          <Card key={stat.label} className={`border-border/50 bg-card/80 ${"live" in stat && stat.live ? "border-primary/30" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  {"live" in stat && stat.live && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  )}
                </div>
                <stat.icon className={`h-3.5 w-3.5 ${stat.positive === false ? "text-loss" : stat.positive ? "text-profit" : "text-muted-foreground"}`} />
              </div>
              <p className={`mt-1 text-lg font-bold ${stat.positive === false ? "text-loss" : stat.positive ? "text-profit" : ""}`}>
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* PnL Chart */}
      <motion.div variants={fadeUp}>
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cumulative PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={strategy.pnlHistory}>
                  <defs>
                    <linearGradient id="pnlGradDetail" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={strategy.totalPnl >= 0 ? "oklch(0.7 0.2 155)" : "oklch(0.65 0.22 25)"} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={strategy.totalPnl >= 0 ? "oklch(0.7 0.2 155)" : "oklch(0.65 0.22 25)"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 260 / 20%)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} width={45} />
                  <RechartsTooltip
                    contentStyle={{ background: "oklch(0.14 0.012 260)", border: "1px solid oklch(0.22 0.015 260)", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, "PnL"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke={strategy.totalPnl >= 0 ? "oklch(0.7 0.2 155)" : "oklch(0.65 0.22 25)"}
                    strokeWidth={2}
                    fill="url(#pnlGradDetail)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Open Positions */}
      {openTrades.length > 0 && (
        <motion.div variants={fadeUp}>
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Open Positions</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className="bg-profit/10 text-profit text-[10px]">
                    <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />
                    {openTrades.length} open &middot; Live
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2.5 font-medium">Pair</th>
                      <th className="pb-2.5 font-medium">Side</th>
                      <th className="pb-2.5 font-medium">Entry Price</th>
                      <th className="pb-2.5 font-medium">Qty</th>
                      <th className="pb-2.5 font-medium">Unrealized PnL</th>
                      <th className="pb-2.5 text-right font-medium">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTrades.map((trade) => (
                      <tr key={trade.id} className="border-b border-border/30 last:border-0">
                        <td className="py-2.5 font-medium">{trade.pair}</td>
                        <td className="py-2.5">
                          <Badge variant="outline" className={trade.side.toUpperCase() === "BUY" ? "border-profit/30 text-profit" : "border-loss/30 text-loss"}>
                            {trade.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2.5 font-mono text-xs">${trade.entryPrice.toLocaleString()}</td>
                        <td className="py-2.5 font-mono text-xs">{trade.quantity}</td>
                        <td className={`py-2.5 font-medium ${trade.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                          {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right text-xs text-muted-foreground">{trade.openedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Closed Trades */}
      <motion.div variants={fadeUp}>
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Trade History</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {closedTrades.length} trades
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2.5 font-medium">Pair</th>
                    <th className="pb-2.5 font-medium">Side</th>
                    <th className="pb-2.5 font-medium">Entry</th>
                    <th className="pb-2.5 font-medium">Exit</th>
                    <th className="pb-2.5 font-medium">Qty</th>
                    <th className="pb-2.5 font-medium">PnL</th>
                    <th className="pb-2.5 font-medium">Fee</th>
                    <th className="pb-2.5 text-right font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/30 last:border-0">
                      <td className="py-2.5 font-medium">{trade.pair}</td>
                      <td className="py-2.5">
                        <Badge variant="outline" className={trade.side.toUpperCase() === "BUY" ? "border-profit/30 text-profit" : "border-loss/30 text-loss"}>
                          {trade.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 font-mono text-xs">${trade.entryPrice.toLocaleString()}</td>
                      <td className="py-2.5 font-mono text-xs">${trade.exitPrice?.toLocaleString()}</td>
                      <td className="py-2.5 font-mono text-xs">{trade.quantity}</td>
                      <td className={`py-2.5 font-medium ${trade.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">${trade.fee.toFixed(2)}</td>
                      <td className="py-2.5 text-right text-xs text-muted-foreground">{trade.closedAt}</td>
                    </tr>
                  ))}
                  {closedTrades.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                        No closed trades yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

function mapApiToStrategy(d: Record<string, unknown>): DeployedStrategy {
  return {
    id: d.id as string,
    strategyName: d.strategyName as string,
    strategyType: d.strategyType as string,
    brokerId: d.brokerId as string,
    brokerName: d.brokerName as string,
    brokerShortName: ((d.brokerName as string) || "").slice(0, 2).toUpperCase(),
    pair: d.pair as string,
    status: (d.status as string).toLowerCase() as "active" | "paused" | "stopped",
    deployedAt: d.deployedAt as string,
    investedAmount: d.investedAmount as number,
    currentValue: d.currentValue as number,
    totalPnl: d.totalPnl as number,
    totalPnlPercent: d.totalPnlPercent as number,
    todayPnl: 0,
    totalTrades: d.totalTrades as number,
    winRate: d.winRate as number,
    openPositions: d.openPositions as number,
    trades: [],
    pnlHistory: [],
  }
}

export default function DeployedPage() {
  const [selected, setSelected] = useState<DeployedStrategy | null>(null)
  const [brokerFilter, setBrokerFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [apiData, setApiData] = useState<DeployedStrategy[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchList = useCallback(() => {
    deployedApi.list({ brokerId: brokerFilter, status: statusFilter }).then((res) => {
      if (res.success && res.data) {
        setApiData((res.data as Array<Record<string, unknown>>).map(mapApiToStrategy))
      }
    }).finally(() => setLoading(false))
  }, [brokerFilter, statusFilter])

  // Fetch on mount, filter change, and refreshKey change
  useEffect(() => {
    fetchList()
  }, [fetchList, refreshKey])

  // Auto-refresh list every 10s when on list view
  useEffect(() => {
    if (selected) return
    const interval = setInterval(fetchList, 10_000)
    return () => clearInterval(interval)
  }, [selected, fetchList])

  const strategies = apiData

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const handleBack = () => {
    setSelected(null)
    setRefreshKey((k) => k + 1) // force re-fetch list on back
  }

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <StrategyDetail
          key="detail"
          strategy={selected}
          onBack={handleBack}
        />
      ) : (
        <StrategyList
          key="list"
          strategies={strategies}
          onSelect={setSelected}
          brokerFilter={brokerFilter}
          setBrokerFilter={setBrokerFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      )}
    </AnimatePresence>
  )
}
