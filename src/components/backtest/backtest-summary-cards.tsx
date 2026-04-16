"use client"

import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  DollarSign,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CalendarDays,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

interface BacktestRun {
  totalPnl: number
  grossPnl?: number
  totalFees?: number
  makerFee?: number
  slippage?: number
  winRate: number
  totalTrades: number
  winTrades: number
  lossTrades: number
  maxDrawdown: number
  sharpeRatio: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  initialCapital: number
  finalEquity: number
}

type ExtendedMetrics = {
  avgBarsWinning?: number
  avgBarsLosing?: number
  mddRecoveryDays?: number
  [key: string]: unknown
}

export function BacktestSummaryCards({
  run,
  extendedMetrics,
}: {
  run: BacktestRun
  extendedMetrics?: ExtendedMetrics
}) {
  const ext = extendedMetrics ?? {}
  const roi = run.initialCapital > 0
    ? ((run.finalEquity - run.initialCapital) / run.initialCapital * 100)
    : 0

  const grossPnl = run.grossPnl ?? run.totalPnl
  const totalFees = run.totalFees ?? 0
  const feePercent = run.makerFee ? (run.makerFee * 100).toFixed(2) : "0.05"
  const slipPercent = run.slippage ? (run.slippage * 100).toFixed(2) : "0.01"

  const metrics = [
    {
      label: "Gross PnL",
      value: `$${grossPnl.toFixed(2)}`,
      sub: "Before fees",
      icon: DollarSign,
      color: grossPnl >= 0 ? "text-profit" : "text-loss",
      bg: grossPnl >= 0 ? "bg-profit/10" : "bg-loss/10",
    },
    {
      label: "Net PnL",
      value: `$${run.totalPnl.toFixed(2)}`,
      sub: `After ${feePercent}% commission + ${slipPercent}% slippage`,
      icon: run.totalPnl >= 0 ? TrendingUp : TrendingDown,
      color: run.totalPnl >= 0 ? "text-profit" : "text-loss",
      bg: run.totalPnl >= 0 ? "bg-profit/10" : "bg-loss/10",
    },
    {
      label: "Total Fees",
      value: `$${totalFees.toFixed(2)}`,
      sub: `${run.totalTrades} trades x ${feePercent}%`,
      icon: BarChart3,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "ROI",
      value: `${roi.toFixed(2)}%`,
      sub: `$${run.initialCapital.toLocaleString()} → $${run.finalEquity.toFixed(0)}`,
      icon: roi >= 0 ? ArrowUpRight : ArrowDownRight,
      color: roi >= 0 ? "text-profit" : "text-loss",
      bg: roi >= 0 ? "bg-profit/10" : "bg-loss/10",
    },
    {
      label: "Win Rate",
      value: `${run.winRate.toFixed(1)}%`,
      sub: `${run.winTrades}W / ${run.lossTrades}L`,
      icon: Target,
      color: run.winRate >= 50 ? "text-profit" : "text-warning",
      bg: run.winRate >= 50 ? "bg-profit/10" : "bg-warning/10",
    },
    {
      label: "Total Trades",
      value: `${run.totalTrades}`,
      sub: `Avg win: $${run.avgWin.toFixed(2)} / Avg loss: $${run.avgLoss.toFixed(2)}`,
      icon: Activity,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Max Drawdown",
      value: `$${run.maxDrawdown.toFixed(2)}`,
      sub: `${run.initialCapital > 0 ? (run.maxDrawdown / run.initialCapital * 100).toFixed(2) : "0"}% of capital`,
      icon: ArrowDownRight,
      color: "text-loss",
      bg: "bg-loss/10",
    },
    {
      label: "Sharpe / Profit Factor",
      value: run.sharpeRatio.toFixed(2),
      sub: `PF: ${run.profitFactor === Infinity ? "∞" : run.profitFactor.toFixed(2)}`,
      icon: Zap,
      color: run.sharpeRatio >= 1 ? "text-profit" : "text-warning",
      bg: run.sharpeRatio >= 1 ? "bg-profit/10" : "bg-warning/10",
    },
    {
      label: "Avg Bars (Win)",
      value: ext.avgBarsWinning != null ? `${ext.avgBarsWinning}` : "—",
      sub: "Candles per winning trade",
      icon: Clock,
      color: "text-profit",
      bg: "bg-profit/10",
    },
    {
      label: "Avg Bars (Loss)",
      value: ext.avgBarsLosing != null ? `${ext.avgBarsLosing}` : "—",
      sub: "Candles per losing trade",
      icon: Clock,
      color: "text-loss",
      bg: "bg-loss/10",
    },
    {
      label: "MDD Recovery",
      value: ext.mddRecoveryDays != null ? `${ext.mddRecoveryDays}d` : "—",
      sub: "Days to recover from max drawdown",
      icon: CalendarDays,
      color: "text-warning",
      bg: "bg-warning/10",
    },
  ]

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {metrics.map((m) => (
        <motion.div key={m.label} variants={fadeUp}>
          <Card className="border-border/30">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                  {m.sub && (
                    <p className="text-[11px] text-muted-foreground">{m.sub}</p>
                  )}
                </div>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.bg}`}>
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  )
}
