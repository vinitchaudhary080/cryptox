"use client"

import { useEffect, useState } from "react"
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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import { portfolioApi } from "@/lib/api"
import { portfolioStats as mockStats, portfolioHistory, allocationData, recentTrades as mockTrades } from "@/lib/mock-data"

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
  openedAt: string
  deployedStrategy?: { strategy: { name: string }; broker: { name: string } }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<PortfolioStats | null>(null)
  const [trades, setTrades] = useState<TradeItem[]>([])

  useEffect(() => {
    portfolioApi.stats().then((res) => {
      if (res.success && res.data) setStats(res.data as PortfolioStats)
    })
    portfolioApi.trades(10).then((res) => {
      if (res.success && res.data) setTrades(res.data as TradeItem[])
    })
  }, [])

  const portfolioStats = stats || mockStats
  const pnlPositive = (stats?.totalPnl ?? mockStats.totalPnl) >= 0

  const statCards = [
    {
      title: "Portfolio Value",
      value: `$${portfolioStats.totalValue.toLocaleString()}`,
      change: `${pnlPositive ? "+" : ""}${(stats?.totalPnlPercent ?? mockStats.totalPnlPercent).toFixed(1)}%`,
      changeValue: "all time",
      positive: pnlPositive,
      icon: DollarSign,
    },
    {
      title: "Total PnL",
      value: `${pnlPositive ? "+" : ""}$${Math.abs(stats?.totalPnl ?? mockStats.totalPnl).toLocaleString()}`,
      change: `${pnlPositive ? "+" : ""}${(stats?.totalPnlPercent ?? mockStats.totalPnlPercent).toFixed(1)}%`,
      changeValue: "all time",
      positive: pnlPositive,
      icon: pnlPositive ? TrendingUp : TrendingDown,
    },
    {
      title: "Win Rate",
      value: `${(stats?.winRate ?? mockStats.winRate).toFixed(1)}%`,
      change: `${stats?.totalTrades ?? 0} trades`,
      changeValue: "total",
      positive: true,
      icon: Target,
    },
    {
      title: "Active Strategies",
      value: (stats?.activeStrategies ?? mockStats.activeStrategies).toString(),
      change: "running",
      changeValue: "now",
      positive: true,
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
                  <span
                    className={`text-xs font-medium ${stat.positive ? "text-profit" : "text-loss"}`}
                  >
                    {stat.change}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stat.changeValue}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Portfolio Chart */}
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  Portfolio Performance
                </CardTitle>
                <div className="flex gap-1">
                  {["7D", "30D", "90D"].map((period) => (
                    <button
                      key={period}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                      data-active={period === "90D"}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolioHistory}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="oklch(0.65 0.22 260)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="oklch(0.65 0.22 260)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.3 0.01 260 / 30%)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval={14}
                    />
                    <YAxis
                      tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                      width={50}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: "oklch(0.14 0.012 260)",
                        border: "1px solid oklch(0.22 0.015 260)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "oklch(0.6 0.01 260)" }}
                      formatter={(value) => [
                        `$${Number(value).toLocaleString()}`,
                        "Value",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="oklch(0.65 0.22 260)"
                      strokeWidth={2}
                      fill="url(#colorValue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Allocation Pie */}
        <motion.div variants={fadeUp}>
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Asset Allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {allocationData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        background: "oklch(0.14 0.012 260)",
                        border: "1px solid oklch(0.22 0.015 260)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [`${value}%`, "Allocation"]}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {allocationData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Trades */}
      <motion.div variants={fadeUp}>
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                Recent Trades
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                Live
                <span className="ml-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
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
                  {(trades.length > 0 ? trades : mockTrades).map((trade: Record<string, unknown>) => {
                    const side = String(trade.side || "").toLowerCase()
                    const price = (trade.entryPrice ?? trade.price ?? 0) as number
                    const qty = (trade.quantity ?? trade.amount ?? 0) as number
                    const pnl = (trade.pnl ?? 0) as number
                    const stratName = (trade.deployedStrategy as Record<string, Record<string, string>> | undefined)?.strategy?.name || (trade.strategy as string) || ""
                    const time = trade.openedAt ? new Date(trade.openedAt as string).toLocaleString() : (trade.time as string) || ""
                    return (
                    <tr
                      key={trade.id as string}
                      className="border-b border-border/30 last:border-0"
                    >
                      <td className="py-3 font-medium">{trade.pair as string}</td>
                      <td className="py-3">
                        <Badge
                          variant="outline"
                          className={
                            side === "buy"
                              ? "border-profit/30 text-profit"
                              : "border-loss/30 text-loss"
                          }
                        >
                          {side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-xs">
                        ${price.toLocaleString()}
                      </td>
                      <td className="py-3 font-mono text-xs">{qty}</td>
                      <td
                        className={`py-3 font-medium ${pnl >= 0 ? "text-profit" : "text-loss"}`}
                      >
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </td>
                      <td className="py-3">
                        <Badge variant="secondary" className="text-xs">
                          {stratName}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-xs text-muted-foreground">
                        {time}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
