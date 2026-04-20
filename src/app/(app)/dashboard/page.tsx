"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Plug,
  Rocket,
  BarChart3,
  Check,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts"
import { portfolioApi, brokerApi } from "@/lib/api"
import { MarketOverview } from "@/components/dashboard/market-overview"
import { TradingLoader } from "@/components/ui/trading-loader"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

type PortfolioStats = {
  totalValue: number
  totalInvested: number
  totalPnl: number
  totalPnlPercent: number
  activeStrategies: number
  totalTrades: number
  winRate: number
}

type TradeItem = {
  id: string
  pair: string
  side: string
  entryPrice: number
  quantity: number
  pnl: number
  status: string
  openedAt: string
  deployedStrategy?: { strategy: { name: string }; broker: { name: string } }
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<PortfolioStats | null>(null)
  const [trades, setTrades] = useState<TradeItem[]>([])
  const [pnlHistory, setPnlHistory] = useState<{ date: string; pnl: number }[]>([])
  const [allocation, setAllocation] = useState<{ name: string; value: number; color: string }[]>([])
  const [hasBrokerConnected, setHasBrokerConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const PAIR_COLORS: Record<string, string> = {
      BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", XRP: "#00AAE4",
      DOGE: "#C2A633", ADA: "#0033AD", DOT: "#E6007A", SUI: "#6FBCF0",
      LINK: "#2A5ADA", AVAX: "#E84142",
    }

    Promise.all([
      brokerApi.list().then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const connected = (res.data as { status: string }[]).some(
            (b) => b.status === "CONNECTED"
          )
          setHasBrokerConnected(connected)
        }
      }).catch(() => {}),
      portfolioApi.stats().then((res) => {
        if (res.success && res.data) setStats(res.data as PortfolioStats)
      }),
      portfolioApi.trades(10).then((res) => {
        if (res.success && res.data) setTrades(res.data as TradeItem[])
      }),
      portfolioApi.report().then((res) => {
        if (res.success && res.data) {
          const d = res.data as {
            overall: { pnlHistory: { date: string; pnl: number }[] };
            strategies: { pair: string; investedAmount: number; currentValue: number }[];
          }
          setPnlHistory(d.overall.pnlHistory)

          // Build allocation from deployed strategies by coin
          const coinMap = new Map<string, number>()
          d.strategies.forEach((s) => {
            const coin = s.pair.split("/")[0]
            coinMap.set(coin, (coinMap.get(coin) ?? 0) + s.currentValue)
          })
          const total = Array.from(coinMap.values()).reduce((s, v) => s + v, 0)
          if (total > 0) {
            const alloc = Array.from(coinMap.entries()).map(([name, value]) => ({
              name,
              value: Math.round((value / total) * 100),
              color: PAIR_COLORS[name] ?? "#6366F1",
            }))
            setAllocation(alloc)
          }
        }
      }),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <TradingLoader message="Loading dashboard..." />
  }

  const hasStrategy = (stats?.activeStrategies ?? 0) > 0
  const hasTrades = (stats?.totalTrades ?? 0) > 0
  const allStepsComplete = hasBrokerConnected && hasStrategy && hasTrades
  const isNewUser = !allStepsComplete && (!stats || (stats.totalTrades === 0 && stats.activeStrategies === 0 && stats.totalValue === 0))
  const pnlPositive = (stats?.totalPnl ?? 0) >= 0

  const statCards = [
    {
      title: "Portfolio Value",
      value: `$${(stats?.totalValue ?? 0).toLocaleString()}`,
      change: `${pnlPositive ? "+" : ""}${(stats?.totalPnlPercent ?? 0).toFixed(1)}%`,
      changeValue: "all time",
      positive: pnlPositive,
      icon: DollarSign,
    },
    {
      title: "Total PnL",
      value: `${pnlPositive ? "+" : ""}$${Math.abs(stats?.totalPnl ?? 0).toLocaleString()}`,
      change: `${pnlPositive ? "+" : ""}${(stats?.totalPnlPercent ?? 0).toFixed(1)}%`,
      changeValue: "all time",
      positive: pnlPositive,
      icon: pnlPositive ? TrendingUp : TrendingDown,
    },
    {
      title: "Win Rate",
      value: `${(stats?.winRate ?? 0).toFixed(1)}%`,
      change: `${stats?.totalTrades ?? 0} trades`,
      changeValue: "total",
      positive: (stats?.winRate ?? 0) >= 50,
      icon: Target,
    },
    {
      title: "Active Strategies",
      value: (stats?.activeStrategies ?? 0).toString(),
      change: "running",
      changeValue: "now",
      positive: (stats?.activeStrategies ?? 0) > 0,
      icon: Zap,
    },
  ]

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your trading overview at a glance
        </p>
      </motion.div>

      {/* Welcome Banner for New Users */}
      {isNewUser && (
        <motion.div variants={fadeUp}>
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-chart-4/5">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold">Welcome to AlgoPulse</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Get started in 3 simple steps to begin automated crypto trading.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    step: "1",
                    title: "Connect a Broker",
                    desc: "Link your exchange account (Binance, Delta, Bybit, etc.)",
                    icon: Plug,
                    action: () => router.push("/brokers"),
                    btn: "Add Broker",
                    done: hasBrokerConnected,
                  },
                  {
                    step: "2",
                    title: "Deploy a Strategy",
                    desc: "Choose a pre-built strategy and deploy it on your broker",
                    icon: Rocket,
                    action: () => router.push("/strategies"),
                    btn: "Browse Strategies",
                    done: hasStrategy,
                  },
                  {
                    step: "3",
                    title: "Track Performance",
                    desc: "Monitor live trades, PnL, and analytics in real-time",
                    icon: BarChart3,
                    action: () => router.push("/reports"),
                    btn: "View Reports",
                    done: hasTrades,
                  },
                ].filter((s) => !s.done).map((s) => (
                  <div key={s.step} className="flex flex-col rounded-xl border border-border/40 bg-background/50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {s.step}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{s.title}</p>
                      </div>
                    </div>
                    <p className="mt-2 flex-1 text-xs text-muted-foreground">{s.desc}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={s.action}>
                      {s.btn} <ArrowUpRight className="ml-1.5 h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <motion.div key={stat.title} variants={fadeUp}>
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold">{stat.value}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  {stat.positive ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-profit" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-loss" />
                  )}
                  <span className={`text-xs font-medium ${stat.positive ? "text-profit" : "text-loss"}`}>
                    {stat.change}
                  </span>
                  <span className="text-xs text-muted-foreground">{stat.changeValue}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row, only show if user has data */}
      {!isNewUser && (pnlHistory.length > 0 || allocation.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Portfolio Performance, Cumulative PnL */}
          <motion.div variants={fadeUp} className={allocation.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Portfolio Performance</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {pnlHistory.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={pnlHistory}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={pnlPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={pnlPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} width={55} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                          formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cumulative PnL"]}
                        />
                        <Area type="monotone" dataKey="pnl" stroke={pnlPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} strokeWidth={2} fill="url(#colorValue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                    No PnL history yet, deploy a strategy to start tracking
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Asset Allocation, by coin */}
          {allocation.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card className="border-border/50 bg-card/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Asset Allocation</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie data={allocation} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                          {allocation.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                          formatter={(value) => [`${value}%`, "Allocation"]}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-2">
                    {allocation.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-muted-foreground">{item.name}</span>
                        </div>
                        <span className="font-medium">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {/* Market Overview */}
      <MarketOverview />

      {/* Recent Trades */}
      <motion.div variants={fadeUp}>
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Trades</CardTitle>
              {trades.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Live <span className="ml-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="mb-3 h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm font-medium text-muted-foreground">No trades yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Deploy a strategy to start seeing live trades here
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/strategies")}>
                  Browse Strategies <ArrowUpRight className="ml-1.5 h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                      <th className="pb-3 font-medium">Pair</th>
                      <th className="pb-3 font-medium">Side</th>
                      <th className="pb-3 font-medium">Price</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">PnL</th>
                      <th className="pb-3 font-medium">Strategy</th>
                      <th className="pb-3 text-right font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => {
                      const side = trade.side.toLowerCase()
                      const stratName = trade.deployedStrategy?.strategy?.name || ""
                      return (
                        <tr key={trade.id} className="border-b border-border/30 last:border-0">
                          <td className="py-3 font-medium">{trade.pair}</td>
                          <td className="py-3">
                            <Badge variant="outline" className={side === "buy" ? "border-profit/30 text-profit" : "border-loss/30 text-loss"}>
                              {side.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-3 font-mono text-xs">${trade.entryPrice.toLocaleString()}</td>
                          <td className="py-3 font-mono text-xs">{trade.quantity.toFixed(4)}</td>
                          <td className={`py-3 font-medium ${trade.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                            {trade.status === "CLOSED" ? `${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}` : "-"}
                          </td>
                          <td className="py-3">
                            <Badge variant="secondary" className="text-xs">{stratName}</Badge>
                          </td>
                          <td className="py-3 text-right text-xs text-muted-foreground">
                            {new Date(trade.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
