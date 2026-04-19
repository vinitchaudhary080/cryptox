"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Search,
  TrendingUp,
  Users,
  BarChart3,
  Zap,
  ArrowRight,
  LineChart as LineChartIcon,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  LineChart,
  Line,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"
import { strategyApi, backtestApi } from "@/lib/api"
import { strategies as mockStrategies } from "@/lib/mock-data"
import { DeployDialog } from "@/components/strategies/deploy-dialog"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

const riskColors: Record<string, string> = {
  low: "border-profit/30 text-profit bg-profit/5",
  medium: "border-warning/30 text-warning bg-warning/5",
  high: "border-loss/30 text-loss bg-loss/5",
}

type ApiStrategy = {
  id: string
  name: string
  description: string
  category: string
  riskLevel: string
  config: Record<string, unknown>
  defaultPositionSize?: number
  positionSizeLocked?: boolean
}

type SyncStatus = "synced" | "pushing" | "error" | null
type AdminStrategyInfo = {
  id: string
  name: string
  isVisible: boolean
  liveSyncStatus: SyncStatus
  liveSyncAt: string | null
}

export default function StrategiesPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [apiStrategies, setApiStrategies] = useState<ApiStrategy[]>([])
  const [deployOpen, setDeployOpen] = useState(false)
  const [deployTarget, setDeployTarget] = useState<{
    id: string
    name: string
    category: string
    defaultPositionSize: number
    positionSizeLocked: boolean
  } | null>(null)
  const [admin, setAdmin] = useState(false)
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(false)
  const [syncInfo, setSyncInfo] = useState<Record<string, AdminStrategyInfo>>({})
  const [pushingId, setPushingId] = useState<string | null>(null)

  useEffect(() => {
    strategyApi.list().then((res) => {
      if (res.success && res.data) setApiStrategies(res.data as ApiStrategy[])
    })
  }, [])

  // Admin + sync status — only runs for admins; non-admins see an identical
  // page without any of the push-to-live affordances.
  useEffect(() => {
    backtestApi.adminCheck().then((res) => {
      if (res.success && res.data && (res.data as { isAdmin: boolean }).isAdmin) {
        setAdmin(true)
      }
    })
  }, [])

  const refreshSyncStatus = async () => {
    const res = await strategyApi.adminSyncStatus()
    if (res.success && res.data) {
      const map: Record<string, AdminStrategyInfo> = {}
      for (const s of res.data as AdminStrategyInfo[]) map[s.id] = s
      setSyncInfo(map)
    }
  }

  useEffect(() => {
    if (!admin) return
    refreshSyncStatus()
    backtestApi.liveSyncConfig().then((res) => {
      if (res.success && res.data) {
        setLiveSyncEnabled((res.data as { enabled: boolean }).enabled)
      }
    })
  }, [admin])

  const handlePushStrategy = async (strategyId: string) => {
    setPushingId(strategyId)
    const res = await strategyApi.pushToLive(strategyId)
    setPushingId(null)
    await refreshSyncStatus()
    if (!res.success) {
      alert(`Push failed: ${res.error ?? "unknown error"}`)
    }
  }

  // Use API strategies directly
  const strategies = apiStrategies.length > 0
    ? apiStrategies.map((api) => {
        const mock = mockStrategies.find((m) => m.name === api.name)
        return mock ? { ...mock, id: api.id, description: api.description } : {
          id: api.id,
          name: api.name,
          description: api.description,
          category: api.category,
          returnRate: 0,
          winRate: 0,
          risk: (api.riskLevel === "HIGH" ? "high" : api.riskLevel === "LOW" ? "low" : "medium") as "high" | "low" | "medium",
          subscribers: 0,
          trades: 0,
          minInvestment: 10,
          pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
          tags: [api.category],
          performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + Math.round(Math.sin(i * 0.3) * 10 + i * 0.5) })),
        }
      })
    : []

  const filtered = strategies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  )

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
          <h1 className="text-2xl font-bold tracking-tight">Strategies</h1>
          <p className="text-sm text-muted-foreground">
            Browse and deploy battle-tested trading strategies
          </p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search strategies..."
            className="bg-muted/50 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </motion.div>

      {/* Strategy Cards */}
      {filtered.length === 0 && (
        <motion.div variants={fadeUp}>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Zap className="mb-3 h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">No strategies match your search</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try a different keyword or clear your search
              </p>
              <button
                onClick={() => setSearch("")}
                className="mt-3 text-xs font-medium text-primary hover:underline"
              >
                Show all strategies
              </button>
            </CardContent>
          </Card>
        </motion.div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((strategy) => (
          <motion.div key={strategy.id} variants={fadeUp}>
            <Dialog>
              <DialogTrigger className="w-full text-left">
                <Card className="group cursor-pointer border-border/50 bg-card/80 transition-all duration-300 hover:border-primary/20 hover:shadow-lg">
                  <CardContent className="p-5">
                    {/* Tags */}
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {strategy.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] font-medium"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {/* Name & Category */}
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="font-semibold">{strategy.name}</h3>
                      <Badge
                        variant="outline"
                        className={riskColors[strategy.risk]}
                      >
                        {strategy.risk}
                      </Badge>
                    </div>
                    <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">
                      {strategy.description}
                    </p>

                    {/* Mini Chart */}
                    <div className="mb-4 h-16">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={strategy.performance}>
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="oklch(0.65 0.22 260)"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Return
                        </p>
                        <p className="text-sm font-semibold text-profit">
                          +{strategy.returnRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Win Rate
                        </p>
                        <p className="text-sm font-semibold">
                          {strategy.winRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Users
                        </p>
                        <p className="text-sm font-semibold">
                          {(strategy.subscribers / 1000).toFixed(1)}k
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </DialogTrigger>

              {/* Strategy Detail Dialog — mobile-friendly: scrollable, tall tap targets */}
              <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-5 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-base sm:text-lg">
                    <span>{strategy.name}</span>
                    <Badge
                      variant="outline"
                      className={riskColors[strategy.risk]}
                    >
                      {strategy.risk} risk
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 sm:space-y-5">
                  <p className="text-sm text-muted-foreground">
                    {strategy.description}
                  </p>

                  {/* Performance Chart — shorter on mobile to leave room for stats + actions */}
                  <div className="h-36 sm:h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={strategy.performance}>
                        <defs>
                          <linearGradient id={`grad-${strategy.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="oklch(0.65 0.22 260)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="oklch(0.65 0.22 260)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 260 / 30%)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                        <RechartsTooltip
                          contentStyle={{ background: "oklch(0.14 0.012 260)", border: "1px solid oklch(0.22 0.015 260)", borderRadius: "8px", fontSize: "12px" }}
                        />
                        <Area type="monotone" dataKey="value" stroke="oklch(0.65 0.22 260)" strokeWidth={2} fill={`url(#grad-${strategy.id})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {[
                      { label: "30D Return", value: `+${strategy.returnRate}%`, icon: TrendingUp },
                      { label: "Win Rate", value: `${strategy.winRate}%`, icon: BarChart3 },
                      { label: "Total Trades", value: strategy.trades.toLocaleString(), icon: Zap },
                      { label: "Subscribers", value: strategy.subscribers.toLocaleString(), icon: Users },
                    ].map((stat) => (
                      <div key={stat.label} className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 p-2.5 sm:gap-3 sm:p-3">
                        <stat.icon className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-[10px] text-muted-foreground">{stat.label}</p>
                          <p className="truncate text-sm font-semibold">{stat.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pairs */}
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Supported Pairs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {strategy.pairs.map((pair) => (
                        <Badge key={pair} variant="secondary" className="text-xs">{pair}</Badge>
                      ))}
                    </div>
                  </div>

                  {/* Admin-only: push strategy row to live DB */}
                  {admin && liveSyncEnabled && (() => {
                    const apiMatch = apiStrategies.find((a) => a.name === strategy.name)
                    const sid = apiMatch?.id ?? strategy.id
                    const info = syncInfo[sid]
                    const status: SyncStatus = info?.liveSyncStatus ?? null
                    const isPushing = pushingId === sid || status === "pushing"
                    return (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="font-medium">Live DB:</span>
                          {status === "synced" ? (
                            <span className="inline-flex items-center gap-1 text-profit">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Synced{info?.liveSyncAt ? ` · ${new Date(info.liveSyncAt).toLocaleDateString()}` : ""}
                            </span>
                          ) : status === "error" ? (
                            <span className="inline-flex items-center gap-1 text-loss">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Sync failed
                            </span>
                          ) : (
                            <span>Local only</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => handlePushStrategy(sid)}
                          disabled={isPushing}
                        >
                          {isPushing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CloudUpload className="h-3 w-3" />
                          )}
                          {status === "synced" ? "Re-push" : "Push to Live"}
                        </Button>
                      </div>
                    )
                  })()}

                  {/* Action buttons — bigger tap targets on mobile (44px = Apple HIG min) */}
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Button
                      variant="outline"
                      className="h-11 flex-1 text-sm sm:h-10"
                      onClick={() => {
                        const apiMatch = apiStrategies.find((a) => a.name === strategy.name)
                        router.push(`/strategies/${apiMatch?.id || strategy.id}/backtest`)
                      }}
                    >
                      <LineChartIcon className="mr-2 h-4 w-4" />
                      View Backtest Report
                    </Button>
                    <Button
                      className="h-11 flex-1 text-sm sm:h-10"
                      onClick={() => {
                        const apiMatch = apiStrategies.find((a) => a.name === strategy.name)
                        setDeployTarget({
                          id: apiMatch?.id || strategy.id,
                          name: strategy.name,
                          category: apiMatch?.category || strategy.category,
                          defaultPositionSize: apiMatch?.defaultPositionSize ?? 10,
                          positionSizeLocked: apiMatch?.positionSizeLocked ?? false,
                        })
                        setDeployOpen(true)
                      }}
                    >
                      Deploy Strategy <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>

                  <p className="text-center text-[10px] text-muted-foreground">
                    Min. investment: ${strategy.minInvestment.toLocaleString()} &middot; Past performance does not guarantee future results
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </motion.div>
        ))}
      </div>

      {/* Deploy Dialog */}
      {deployTarget && (
        <DeployDialog
          open={deployOpen}
          onOpenChange={setDeployOpen}
          strategyId={deployTarget.id}
          strategyName={deployTarget.name}
          strategyType={deployTarget.category}
          defaultPositionSize={deployTarget.defaultPositionSize}
          positionSizeLocked={deployTarget.positionSizeLocked}
        />
      )}
    </motion.div>
  )
}
