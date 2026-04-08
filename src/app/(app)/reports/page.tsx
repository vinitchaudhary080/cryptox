"use client"

import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Download,
  Calendar,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { analyticsData } from "@/lib/mock-data"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

const riskMetrics = [
  { label: "Sharpe Ratio", value: analyticsData.riskMetrics.sharpeRatio, description: "Risk-adjusted return", good: true },
  { label: "Sortino Ratio", value: analyticsData.riskMetrics.sortinoRatio, description: "Downside risk-adjusted", good: true },
  { label: "Max Drawdown", value: `${analyticsData.riskMetrics.maxDrawdown}%`, description: "Largest peak-to-trough", good: false },
  { label: "Volatility", value: `${analyticsData.riskMetrics.volatility}%`, description: "Annualized std deviation", good: false },
  { label: "Beta", value: analyticsData.riskMetrics.beta, description: "Market correlation", good: true },
  { label: "Alpha", value: `${analyticsData.riskMetrics.alpha}%`, description: "Excess return vs market", good: true },
  { label: "Calmar Ratio", value: analyticsData.riskMetrics.calmarRatio, description: "Return / max drawdown", good: true },
  { label: "Information Ratio", value: analyticsData.riskMetrics.informationRatio, description: "Active return / tracking", good: true },
]

export default function ReportsPage() {
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
            Advanced performance metrics and risk analysis
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="mr-2 h-3.5 w-3.5" /> Last 12 Months
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </motion.div>

      {/* Risk Metrics Grid */}
      <motion.div variants={fadeUp}>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {riskMetrics.map((metric) => (
            <Card key={metric.label} className="border-border/50 bg-card/80">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className={`mt-1 text-xl font-bold ${metric.good ? "text-profit" : "text-loss"}`}>
                  {metric.value}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {metric.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Monthly Returns */}
        <motion.div variants={fadeUp}>
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.monthlyReturns}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 260 / 20%)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
                    <RechartsTooltip
                      contentStyle={{ background: "oklch(0.14 0.012 260)", border: "1px solid oklch(0.22 0.015 260)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value) => [`${value}%`, "Return"]}
                    />
                    <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                      {analyticsData.monthlyReturns.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.return >= 0 ? "oklch(0.7 0.2 155)" : "oklch(0.65 0.22 25)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Drawdown Chart */}
        <motion.div variants={fadeUp}>
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-loss" />
                Drawdown Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analyticsData.drawdownData}>
                    <defs>
                      <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 260 / 20%)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} width={40} />
                    <RechartsTooltip
                      contentStyle={{ background: "oklch(0.14 0.012 260)", border: "1px solid oklch(0.22 0.015 260)", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value) => [`${Number(value).toFixed(1)}%`, "Drawdown"]}
                    />
                    <Area type="monotone" dataKey="drawdown" stroke="oklch(0.65 0.22 25)" strokeWidth={1.5} fill="url(#drawdownGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Strategy Breakdown */}
      <motion.div variants={fadeUp}>
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Strategy Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                    <th className="pb-3 font-medium">Strategy</th>
                    <th className="pb-3 font-medium">PnL</th>
                    <th className="pb-3 font-medium">Trades</th>
                    <th className="pb-3 font-medium">Win Rate</th>
                    <th className="pb-3 font-medium">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.strategyBreakdown.map((strategy) => {
                    const totalPnl = analyticsData.strategyBreakdown.reduce((s, v) => s + v.pnl, 0)
                    const contribution = ((strategy.pnl / totalPnl) * 100).toFixed(1)
                    return (
                      <tr key={strategy.name} className="border-b border-border/30 last:border-0">
                        <td className="py-3 font-medium">{strategy.name}</td>
                        <td className="py-3 font-medium text-profit">+${strategy.pnl.toLocaleString()}</td>
                        <td className="py-3 text-muted-foreground">{strategy.trades}</td>
                        <td className="py-3">
                          <Badge variant="secondary" className="text-xs">{strategy.winRate}%</Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${contribution}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs text-muted-foreground">{contribution}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tax Report Teaser */}
      <motion.div variants={fadeUp}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Tax Report Ready</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Download your complete crypto tax report for 2025. Compatible with TurboTax, CoinTracker, and Koinly.
              </p>
            </div>
            <Button>
              Download Report <Download className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
