"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  FlaskConical,
  Clock,
  Trash2,
  ArrowRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Database,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { backtestApi, historicalApi } from "@/lib/api"
import { BacktestConfigForm } from "@/components/backtest/backtest-config-form"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

interface BacktestRun {
  id: string
  coin: string
  startDate: string
  endDate: string
  strategyType: string
  strategyName: string
  initialCapital: number
  finalEquity: number
  totalPnl: number
  totalTrades: number
  winRate: number
  maxDrawdown: number
  status: string
  duration: number | null
  createdAt: string
}

interface DataStatus {
  coin: string
  name: string
  exists: boolean
  estimatedRows: number
  lastDate: string | null
}

export default function BacktestPage() {
  const router = useRouter()
  const [runs, setRuns] = useState<BacktestRun[]>([])
  const [dataStatus, setDataStatus] = useState<DataStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [pollingId, setPollingId] = useState<string | null>(null)

  const fetchRuns = useCallback(async () => {
    const res = await backtestApi.listRuns(1, 50)
    if (res.success && res.data) {
      setRuns((res.data as { runs: BacktestRun[] }).runs)
    }
    setLoading(false)
  }, [])

  const fetchDataStatus = useCallback(async () => {
    const res = await historicalApi.status()
    if (res.success && res.data) {
      setDataStatus(res.data as DataStatus[])
    }
  }, [])

  useEffect(() => {
    fetchRuns()
    fetchDataStatus()
  }, [fetchRuns, fetchDataStatus])

  // Poll for running backtests
  useEffect(() => {
    if (!pollingId) return

    const interval = setInterval(async () => {
      const res = await backtestApi.getRun(pollingId)
      if (res.success && res.data) {
        const run = res.data as BacktestRun
        if (run.status !== "RUNNING") {
          setPollingId(null)
          fetchRuns()
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [pollingId, fetchRuns])

  const handleRunStarted = (id: string) => {
    setPollingId(id)
    // Add a placeholder run
    fetchRuns()
  }

  const handleDelete = async (id: string) => {
    await backtestApi.deleteRun(id)
    setRuns((prev) => prev.filter((r) => r.id !== id))
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    await historicalApi.sync()
    // Refresh status after a delay
    setTimeout(() => {
      fetchDataStatus()
      setSyncing(false)
    }, 3000)
  }

  const totalDataRows = dataStatus.reduce((s, d) => s + d.estimatedRows, 0)
  const coinsWithData = dataStatus.filter((d) => d.exists && d.estimatedRows > 0).length

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="mx-auto max-w-7xl space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Backtest</h1>
          <p className="text-sm text-muted-foreground">
            Test strategies against historical data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Database className="mr-1 h-3 w-3" />
            {coinsWithData}/10 coins
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncAll}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sync Data
          </Button>
        </div>
      </motion.div>

      {/* Data Status Banner */}
      {coinsWithData < 10 && (
        <motion.div variants={fadeUp}>
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Database className="h-5 w-5 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-medium">Historical data needed</p>
                <p className="text-xs text-muted-foreground">
                  {coinsWithData === 0
                    ? "No historical data found. Click 'Sync Data' to download candle data from Delta Exchange."
                    : `${coinsWithData} of 10 coins have data. Sync to download the rest.`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSyncAll}
                disabled={syncing}
              >
                {syncing ? "Syncing..." : "Sync All"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Config Form — Left Side */}
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <BacktestConfigForm onRunStarted={handleRunStarted} />
        </motion.div>

        {/* Results List — Right Side */}
        <motion.div variants={fadeUp} className="lg:col-span-3">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  Backtest History
                </span>
                <Badge variant="outline" className="text-xs">
                  {runs.length} runs
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FlaskConical className="mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No backtests yet
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Configure and run your first backtest
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {runs.map((run) => (
                    <motion.div
                      key={run.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <Card
                        className="cursor-pointer border-border/30 transition-colors hover:bg-muted/30"
                        onClick={() => {
                          if (run.status === "COMPLETED") {
                            router.push(`/backtest/${run.id}`)
                          }
                        }}
                      >
                        <CardContent className="flex items-center gap-4 p-4">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{run.coin}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  run.status === "COMPLETED"
                                    ? "border-profit/30 bg-profit/10 text-profit"
                                    : run.status === "RUNNING"
                                    ? "border-primary/30 bg-primary/10 text-primary"
                                    : "border-loss/30 bg-loss/10 text-loss"
                                }`}
                              >
                                {run.status === "RUNNING" && (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                )}
                                {run.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {run.strategyName} &middot;{" "}
                              {new Date(run.startDate).toLocaleDateString()} →{" "}
                              {new Date(run.endDate).toLocaleDateString()}
                            </p>
                          </div>

                          {run.status === "COMPLETED" && (
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <p
                                  className={`text-sm font-bold ${
                                    run.totalPnl >= 0 ? "text-profit" : "text-loss"
                                  }`}
                                >
                                  {run.totalPnl >= 0 ? "+" : ""}${run.totalPnl.toFixed(2)}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {run.totalTrades} trades &middot; {run.winRate.toFixed(0)}% WR
                                </p>
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(run.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
