"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Download,
  DollarSign,
  Target,
  BarChart3,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeft,
  Loader2,
  Wallet,
  PieChart,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from "recharts"
import { portfolioApi } from "@/lib/api"
import { TradingLoader } from "@/components/ui/trading-loader"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

// ── Types ──

interface OverallReport {
  totalInvested: number
  totalCurrentValue: number
  totalPnl: number
  totalPnlPercent: number
  activeStrategies: number
  totalStrategies: number
  totalTrades: number
  openPositions: number
  winTrades: number
  lossTrades: number
  winRate: number
  totalFees: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
  pnlHistory: { date: string; pnl: number }[]
  monthlyReturns: { month: string; pnl: number }[]
}

interface StrategyReport {
  id: string
  strategyName: string
  category: string
  brokerName: string
  brokerUid: string
  pair: string
  status: string
  deployedAt: string
  investedAmount: number
  currentValue: number
  pnl: number
  pnlPercent: number
  totalTrades: number
  openTrades: number
  winTrades: number
  lossTrades: number
  winRate: number
  totalFees: number
  bestTrade: number
  worstTrade: number
  recentTrades: {
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
  }[]
}

// ── Overall Tab ──

function OverallTab({ data }: { data: OverallReport }) {
  const metrics = [
    { label: "Total Invested", value: `$${data.totalInvested.toLocaleString()}`, icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
    { label: "Current Value", value: `$${data.totalCurrentValue.toLocaleString()}`, icon: DollarSign, color: data.totalPnl >= 0 ? "text-profit" : "text-loss", bg: data.totalPnl >= 0 ? "bg-profit/10" : "bg-loss/10" },
    { label: "Total PnL", value: `${data.totalPnl >= 0 ? "+" : ""}$${data.totalPnl.toLocaleString()}`, sub: `${data.totalPnlPercent >= 0 ? "+" : ""}${data.totalPnlPercent}%`, icon: data.totalPnl >= 0 ? TrendingUp : TrendingDown, color: data.totalPnl >= 0 ? "text-profit" : "text-loss", bg: data.totalPnl >= 0 ? "bg-profit/10" : "bg-loss/10" },
    { label: "Win Rate", value: `${data.winRate}%`, sub: `${data.winTrades}W / ${data.lossTrades}L`, icon: Target, color: data.winRate >= 50 ? "text-profit" : "text-loss", bg: data.winRate >= 50 ? "bg-profit/10" : "bg-loss/10" },
    { label: "Total Trades", value: data.totalTrades.toString(), sub: `${data.openPositions} open`, icon: Activity, color: "text-primary", bg: "bg-primary/10" },
    { label: "Active Strategies", value: `${data.activeStrategies}/${data.totalStrategies}`, icon: Zap, color: "text-primary", bg: "bg-primary/10" },
    { label: "Profit Factor", value: data.profitFactor === -1 ? "∞" : data.profitFactor.toFixed(2), icon: BarChart3, color: data.profitFactor >= 1.5 || data.profitFactor === -1 ? "text-profit" : "text-warning", bg: data.profitFactor >= 1.5 || data.profitFactor === -1 ? "bg-profit/10" : "bg-warning/10" },
    { label: "Total Fees", value: `$${data.totalFees.toFixed(2)}`, icon: PieChart, color: "text-muted-foreground", bg: "bg-muted" },
  ]

  const tradeMetrics = [
    { label: "Avg Win", value: `$${data.avgWin.toFixed(2)}`, color: "text-profit" },
    { label: "Avg Loss", value: `$${data.avgLoss.toFixed(2)}`, color: "text-loss" },
    { label: "Best Trade", value: `$${data.bestTrade.toFixed(2)}`, color: "text-profit" },
    { label: "Worst Trade", value: `$${data.worstTrade.toFixed(2)}`, color: "text-loss" },
  ]

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label} className="border-border/30">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                  {"sub" in m && m.sub && <p className="text-[11px] text-muted-foreground">{m.sub}</p>}
                </div>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.bg}`}>
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trade Analysis */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tradeMetrics.map((m) => (
          <Card key={m.label} className="border-border/30">
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cumulative PnL */}
        {data.pnlHistory.length > 0 && (
          <Card className="border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cumulative PnL</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.pnlHistory}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={data.totalPnl >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={data.totalPnl >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={50} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`$${v.toFixed(2)}`, "PnL"]} />
                    <Area type="monotone" dataKey="pnl" stroke={data.totalPnl >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} strokeWidth={2} fill="url(#pnlGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Returns */}
        {data.monthlyReturns.length > 0 && (
          <Card className="border-border/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monthly Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlyReturns}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={50} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} formatter={(v: number) => [`$${v.toFixed(2)}`, "PnL"]} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {data.monthlyReturns.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Empty state */}
      {data.totalTrades === 0 && (
        <Card className="border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No trading data yet</p>
            <p className="text-xs text-muted-foreground/60">Deploy a strategy to start seeing reports</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Strategy Detail View ──

function StrategyDetail({ strategy, onBack }: { strategy: StrategyReport; onBack: () => void }) {
  const statusColors: Record<string, string> = {
    ACTIVE: "border-profit/30 bg-profit/10 text-profit",
    PAUSED: "border-warning/30 bg-warning/10 text-warning",
    STOPPED: "border-loss/30 bg-loss/10 text-loss",
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{strategy.strategyName}</h2>
            <Badge variant="outline" className={statusColors[strategy.status] ?? ""}>{strategy.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {strategy.pair} &middot; {strategy.brokerName} ({strategy.brokerUid}) &middot; Deployed {new Date(strategy.deployedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Invested", value: `$${strategy.investedAmount.toLocaleString()}`, color: "text-primary" },
          { label: "Current Value", value: `$${strategy.currentValue.toLocaleString()}`, color: strategy.pnl >= 0 ? "text-profit" : "text-loss" },
          { label: "PnL", value: `${strategy.pnl >= 0 ? "+" : ""}$${strategy.pnl}`, sub: `${strategy.pnlPercent >= 0 ? "+" : ""}${strategy.pnlPercent}%`, color: strategy.pnl >= 0 ? "text-profit" : "text-loss" },
          { label: "Win Rate", value: `${strategy.winRate}%`, sub: `${strategy.winTrades}W / ${strategy.lossTrades}L`, color: strategy.winRate >= 50 ? "text-profit" : "text-loss" },
          { label: "Total Trades", value: strategy.totalTrades.toString(), sub: `${strategy.openTrades} open`, color: "text-foreground" },
          { label: "Fees Paid", value: `$${strategy.totalFees}`, color: "text-muted-foreground" },
          { label: "Best Trade", value: `$${strategy.bestTrade}`, color: "text-profit" },
          { label: "Worst Trade", value: `$${strategy.worstTrade}`, color: "text-loss" },
        ].map((m) => (
          <Card key={m.label} className="border-border/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
              {"sub" in m && m.sub && <p className="text-[11px] text-muted-foreground">{m.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Trades */}
      <Card className="border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent Trades</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {strategy.recentTrades.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No trades yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Time</th>
                    <th className="px-4 py-2.5 text-center font-medium">Side</th>
                    <th className="px-4 py-2.5 text-right font-medium">Entry</th>
                    <th className="px-4 py-2.5 text-right font-medium">Exit</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">PnL</th>
                    <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {strategy.recentTrades.map((t) => (
                    <tr key={t.id} className="border-b border-border/20 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs">
                        {new Date(t.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={`text-[10px] ${t.side === "BUY" ? "border-profit/30 bg-profit/10 text-profit" : "border-loss/30 bg-loss/10 text-loss"}`}>
                          {t.side}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">${t.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{t.exitPrice ? `$${t.exitPrice.toFixed(2)}` : "-"}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{t.quantity.toFixed(4)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-medium ${t.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                        {t.status === "CLOSED" ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={`text-[10px] ${t.status === "OPEN" ? "border-primary/30 bg-primary/10 text-primary" : ""}`}>
                          {t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Strategy List Tab ──

function StrategyWiseTab({ strategies, onSelect }: { strategies: StrategyReport[]; onSelect: (s: StrategyReport) => void }) {
  if (strategies.length === 0) {
    return (
      <Card className="border-border/30">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No deployed strategies</p>
          <p className="text-xs text-muted-foreground/60">Deploy a strategy to see its performance report</p>
        </CardContent>
      </Card>
    )
  }

  const totalPnl = strategies.reduce((s, d) => s + d.pnl, 0)

  return (
    <div className="space-y-3">
      {strategies.map((s) => {
        const contribution = totalPnl !== 0 ? Math.abs((s.pnl / totalPnl) * 100) : 0
        const statusColors: Record<string, string> = {
          ACTIVE: "bg-profit animate-pulse",
          PAUSED: "bg-warning",
          STOPPED: "bg-loss",
        }

        return (
          <Card
            key={s.id}
            className="cursor-pointer border-border/30 transition-all hover:border-primary/20 hover:bg-muted/30"
            onClick={() => onSelect(s)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${statusColors[s.status] ?? "bg-muted"}`} />
                  <span className="text-sm font-semibold">{s.strategyName}</span>
                  <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.pair} &middot; {s.brokerName} &middot; {s.totalTrades} trades &middot; {s.winRate}% WR
                </p>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className={`text-sm font-bold ${s.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                    {s.pnl >= 0 ? "+" : ""}${s.pnl}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.pnlPercent >= 0 ? "+" : ""}{s.pnlPercent}%
                  </p>
                </div>

                <div className="hidden w-24 sm:block">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Contribution</span>
                    <span>{contribution.toFixed(1)}%</span>
                  </div>
                  <Progress value={Math.min(contribution, 100)} className="mt-1 h-1.5" />
                </div>

                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Main Reports Page ──

export default function ReportsPage() {
  const [tab, setTab] = useState<"overall" | "strategy">("overall")
  const [loading, setLoading] = useState(true)
  const [overall, setOverall] = useState<OverallReport | null>(null)
  const [strategies, setStrategies] = useState<StrategyReport[]>([])
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyReport | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    const res = await portfolioApi.report()
    if (res.success && res.data) {
      const d = res.data as { overall: OverallReport; strategies: StrategyReport[] }
      setOverall(d.overall)
      setStrategies(d.strategies)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  if (loading) {
    return <TradingLoader message="Loading reports..." />
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track performance across all your deployed strategies
          </p>
        </div>
      </motion.div>

      {/* Tab switcher */}
      <motion.div variants={fadeUp}>
        <div className="flex rounded-xl bg-muted/50 p-1 w-fit">
          {(["overall", "strategy"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setSelectedStrategy(null)
              }}
              className={`relative rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "overall" ? "Overall" : "Strategy-wise"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Content */}
      <motion.div variants={fadeUp}>
        <AnimatePresence mode="wait">
          {tab === "overall" && overall && (
            <motion.div key="overall" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <OverallTab data={overall} />
            </motion.div>
          )}

          {tab === "strategy" && !selectedStrategy && (
            <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <StrategyWiseTab strategies={strategies} onSelect={setSelectedStrategy} />
            </motion.div>
          )}

          {tab === "strategy" && selectedStrategy && (
            <motion.div key="detail" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <StrategyDetail strategy={selectedStrategy} onBack={() => setSelectedStrategy(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
