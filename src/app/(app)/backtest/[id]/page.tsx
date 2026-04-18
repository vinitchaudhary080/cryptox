"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Loader2, Download, Clock, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { backtestApi } from "@/lib/api"
import { TradingLoader } from "@/components/ui/trading-loader"
import { BacktestSummaryCards } from "@/components/backtest/backtest-summary-cards"
import { EquityCurveChart } from "@/components/backtest/equity-curve-chart"
import { MonthlyHeatmap } from "@/components/backtest/monthly-heatmap"
import { PnlChart } from "@/components/backtest/pnl-chart"
import { TradeLogTable } from "@/components/backtest/trade-log-table"
import { CumulativePnlChart } from "@/components/backtest/cumulative-pnl-chart"
import { DrawdownChart } from "@/components/backtest/drawdown-chart"
import { TopTradesTable } from "@/components/backtest/top-trades-table"
import { downloadBacktestReport } from "@/lib/backtest-report-export"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

type TopTrade = {
  entry_time: number
  exit_time: number
  side: string
  entry_price: number
  exit_price: number
  pnl: number
  exit_reason: string
}

type ExtendedMetrics = {
  largestWinTrades?: TopTrade[]
  largestLossTrades?: TopTrade[]
  avgBarsWinning?: number
  avgBarsLosing?: number
  drawdownCurve?: { time: number; drawdownPct: number }[]
  cumulativePnlCurve?: { time: number; pnl: number }[]
  mddRecoveryDays?: number
}

interface BacktestRun {
  id: string
  coin: string
  startDate: string
  endDate: string
  strategyType: string
  strategyName: string
  strategyConfig: Record<string, unknown>
  initialCapital: number
  finalEquity: number
  totalPnl: number
  totalTrades: number
  winTrades: number
  lossTrades: number
  winRate: number
  maxDrawdown: number
  sharpeRatio: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  equityCurve: { time: number; equity: number }[]
  extendedMetrics?: ExtendedMetrics | null
  status: string
  duration: number | null
  createdAt: string
  grossPnl?: number
  totalFees?: number
  makerFee?: number
  slippage?: number
}

interface Trade {
  id: string
  entryTime: string
  entryPrice: number
  qty: number
  side: string
  leverage: number
  sl: number | null
  tp: number | null
  exitTime: string | null
  exitPrice: number | null
  pnl: number
  fee: number
  exitReason: string | null
  status: string
}

export default function BacktestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [run, setRun] = useState<BacktestRun | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [allTrades, setAllTrades] = useState<Trade[]>([])
  const [totalTrades, setTotalTrades] = useState(0)
  const [tradePage, setTradePage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchRun = useCallback(async () => {
    const res = await backtestApi.getRun(id)
    if (res.success && res.data) {
      setRun(res.data as BacktestRun)
    }
    setLoading(false)
  }, [id])

  const fetchTrades = useCallback(async (page: number) => {
    const res = await backtestApi.getTrades(id, page, 50)
    if (res.success && res.data) {
      const data = res.data as { trades: Trade[]; total: number }
      setTrades(data.trades)
      setTotalTrades(data.total)
    }
  }, [id])

  const fetchAllTrades = useCallback(async () => {
    const res = await backtestApi.getTrades(id, 1, 10000)
    if (res.success && res.data) {
      setAllTrades((res.data as { trades: Trade[] }).trades)
    }
  }, [id])

  useEffect(() => {
    fetchRun()
    fetchTrades(1)
    fetchAllTrades()
  }, [fetchRun, fetchTrades, fetchAllTrades])

  const handlePageChange = (page: number) => {
    setTradePage(page)
    fetchTrades(page)
  }

  if (loading) {
    return <TradingLoader message="Loading backtest..." />
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-muted-foreground">Backtest not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push("/backtest")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Backtests
        </Button>
      </div>
    )
  }

  const ext = run.extendedMetrics ?? {}

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="mx-auto max-w-7xl space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/backtest")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {run.coin} — {run.strategyName}
              </h1>
              <Badge
                variant="outline"
                className={`text-xs ${
                  run.status === "COMPLETED"
                    ? "border-profit/30 bg-profit/10 text-profit"
                    : "border-loss/30 bg-loss/10 text-loss"
                }`}
              >
                {run.status}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(run.startDate).toLocaleDateString()} → {new Date(run.endDate).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {run.duration ? `${(run.duration / 1000).toFixed(1)}s` : "—"}
              </span>
              <span>Capital: ${run.initialCapital.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => downloadBacktestReport(run, allTrades, ext)}
          disabled={allTrades.length === 0}
        >
          <Download className="h-4 w-4" />
          Download Report
        </Button>
      </motion.div>

      {/* Summary Cards (existing 8 + new 3) */}
      <motion.div variants={fadeUp}>
        <BacktestSummaryCards run={run} extendedMetrics={ext} />
      </motion.div>

      {/* Charts Row 1: Equity + Cumulative PnL */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={fadeUp}>
          <EquityCurveChart data={run.equityCurve} initialCapital={run.initialCapital} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <CumulativePnlChart data={ext.cumulativePnlCurve ?? []} />
        </motion.div>
      </div>

      {/* Charts Row 2: Trade PnL Bars + Drawdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div variants={fadeUp}>
          <PnlChart trades={trades} />
        </motion.div>
        <motion.div variants={fadeUp}>
          <DrawdownChart data={ext.drawdownCurve ?? []} />
        </motion.div>
      </div>

      {/* Largest Winning / Losing Trades */}
      <motion.div variants={fadeUp}>
        <TopTradesTable
          wins={ext.largestWinTrades ?? []}
          losses={ext.largestLossTrades ?? []}
        />
      </motion.div>

      {/* Monthly Heatmap */}
      <motion.div variants={fadeUp}>
        <MonthlyHeatmap
          trades={allTrades}
          startDate={run.startDate}
          endDate={run.endDate}
        />
      </motion.div>

      {/* Trade Log */}
      <motion.div variants={fadeUp}>
        <TradeLogTable
          trades={trades}
          total={totalTrades}
          page={tradePage}
          limit={50}
          onPageChange={handlePageChange}
          allTrades={allTrades}
        />
      </motion.div>
    </motion.div>
  )
}
