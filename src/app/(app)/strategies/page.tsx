"use client"

import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useStrategies, queryKeys } from "@/lib/queries"
import { StrategiesSkeleton } from "@/components/skeletons/strategies-skeleton"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  Search,
  TrendingUp,
  BarChart3,
  Zap,
  ArrowRight,
  LineChart as LineChartIcon,
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
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
  // Stats from the strategy's best featured backtest run (computed in
  // the backend GET /api/strategies handler). When no featured run
  // exists, all three are 0 — frontend falls through to the mockStrategies
  // lookup for legacy hardcoded numbers.
  returnRate?: number
  winRate?: number
  totalTrades?: number
  featuredCoin?: string | null
  // Top 5 coins (curated featured backtest runs) — sorted by return % desc.
  // Used to render the "AlgoPulse Picks" badges on the strategy popup.
  topCoins?: Array<{
    coin: string
    returnRate: number
    winRate: number
    totalTrades: number
  }>
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
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  // Strategies list now served by TanStack Query — cached across navigations,
  // background-refetched on focus/reconnect. First mount still hits the API
  // (no cache yet); subsequent visits render instantly from cache.
  const strategiesQuery = useStrategies()
  const apiStrategies = (strategiesQuery.data?.success && strategiesQuery.data.data
    ? (strategiesQuery.data.data as ApiStrategy[])
    : [])
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Local-dev only: enables the destructive "Delete strategy" affordance.
  // process.env.NODE_ENV is inlined at build time, so this is a true compile-
  // time gate — the Trash button never ships in a production bundle.
  const isLocalDev = process.env.NODE_ENV === "development"

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

  const handleDeleteStrategy = async (strategyId: string, strategyName: string) => {
    if (!isLocalDev) return
    const ok = window.confirm(
      `Delete "${strategyName}" from the local DB?\n\n` +
      `This also wipes every deployed instance, its trades, and any featured-backtest links. ` +
      `Run \`npm run db:seed\` to restore system strategies.`,
    )
    if (!ok) return
    setDeletingId(strategyId)
    const res = await strategyApi.remove(strategyId)
    setDeletingId(null)
    if (!res.success) {
      alert(`Delete failed: ${res.error ?? "unknown error"}`)
      return
    }
    // Invalidate the cache so the strategies list refetches and the deleted
    // card disappears from the grid (in any open page sharing this cache).
    queryClient.invalidateQueries({ queryKey: queryKeys.strategies() })
  }

  // Use API strategies directly
  const strategies = apiStrategies.length > 0
    ? apiStrategies.map((api) => {
        const mock = mockStrategies.find((m) => m.name === api.name)
        // Prefer real featured-backtest stats from API over hardcoded mock
        // values when both exist AND the API has non-zero data.
        const apiHasStats = (api.returnRate ?? 0) !== 0 || (api.winRate ?? 0) !== 0 || (api.totalTrades ?? 0) !== 0
        // Recommended-settings panel pulls these straight from the strategy's
        // saved config (set at backtest time) so users can mirror them on deploy.
        const cfgLeverage = typeof api.config?.leverage === "number" ? (api.config.leverage as number) : undefined
        const recommendedLeverage = cfgLeverage ?? 1
        const recommendedPositionSize = typeof api.defaultPositionSize === "number" ? api.defaultPositionSize : 25
        // Top picks come from the backend's curated featured-runs (top 5 by return%).
        // Fallback: single featuredCoin, then a generic BTC/ETH/SOL placeholder.
        const algoPulsePicks = (api.topCoins && api.topCoins.length > 0
          ? api.topCoins.map((tc) => `${tc.coin}/USDT`)
          : api.featuredCoin
            ? [`${api.featuredCoin}/USDT`]
            : ["BTC/USDT", "ETH/USDT", "SOL/USDT"])
        if (mock) {
          return {
            ...mock,
            id: api.id,
            description: api.description,
            recommendedLeverage,
            recommendedPositionSize,
            pairs: algoPulsePicks,
            ...(apiHasStats ? {
              returnRate: api.returnRate ?? mock.returnRate,
              winRate: api.winRate ?? mock.winRate,
              trades: api.totalTrades ?? mock.trades,
            } : {}),
          }
        }
        return {
          id: api.id,
          name: api.name,
          description: api.description,
          category: api.category,
          returnRate: api.returnRate ?? 0,
          winRate: api.winRate ?? 0,
          risk: (api.riskLevel === "HIGH" ? "high" : api.riskLevel === "LOW" ? "low" : "medium") as "high" | "low" | "medium",
          trades: api.totalTrades ?? 0,
          minInvestment: 10,
          pairs: algoPulsePicks,
          tags: [api.category],
          performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + Math.round(Math.sin(i * 0.3) * 10 + i * 0.5) })),
          recommendedLeverage,
          recommendedPositionSize,
        }
      })
    : []

  const filtered = strategies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  )

  // First-visit shimmer — content-shaped placeholders so the user knows
  // *which page* is loading. Return-visits skip this branch entirely
  // because TanStack Query has cached data and isPending is false.
  if (strategiesQuery.isPending) {
    return <StrategiesSkeleton />
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
                          Trades
                        </p>
                        <p className="text-sm font-semibold">
                          {strategy.trades.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </DialogTrigger>

              {/* Strategy Detail Dialog, bottom-sheet on mobile, centered card on desktop */}
              <DialogContent className="
                !fixed !bottom-0 !left-0 !top-auto
                !max-h-[85vh] !w-full !max-w-none
                !translate-x-0 !translate-y-0
                !rounded-t-2xl !rounded-b-none
                overflow-y-auto p-5 pb-6
                data-open:animate-in data-open:slide-in-from-bottom
                sm:!bottom-auto sm:!left-1/2 sm:!top-1/2
                sm:!max-w-lg sm:!-translate-x-1/2 sm:!-translate-y-1/2
                sm:!rounded-2xl sm:p-6
                sm:data-open:slide-in-from-bottom-0 sm:data-open:zoom-in-95
              ">
                {/* Drag indicator, only visible on mobile bottom-sheet */}
                <div className="mx-auto -mt-2 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
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

                  {/* Performance Chart, shorter on mobile to leave room for stats + actions */}
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
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { label: "30D Return", value: `+${strategy.returnRate}%`, icon: TrendingUp },
                      { label: "Win Rate", value: `${strategy.winRate}%`, icon: BarChart3 },
                      { label: "Total Trades", value: strategy.trades.toLocaleString(), icon: Zap },
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

                  {/* AlgoPulse Picks — top 5 coins from featured backtests */}
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 sm:p-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">AlgoPulse Picks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {strategy.pairs.map((pair) => (
                        <Badge key={pair} variant="secondary" className="text-xs">{pair}</Badge>
                      ))}
                    </div>
                    {/* Admin-only: backtest config (leverage/position size) so the deployer can mirror it */}
                    {admin && (
                      <div className="mt-3 border-t border-border/50 pt-3">
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          Recommended deploy settings (from backtest)
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-md border border-border/50 bg-background/50 px-3 py-2">
                            <p className="text-[10px] text-muted-foreground">Leverage</p>
                            <p className="text-sm font-semibold">{strategy.recommendedLeverage}x</p>
                          </div>
                          <div className="rounded-md border border-border/50 bg-background/50 px-3 py-2">
                            <p className="text-[10px] text-muted-foreground">Position Size</p>
                            <p className="text-sm font-semibold">{strategy.recommendedPositionSize}%</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground/80">
                          Use the same values when deploying for best-matched results.
                        </p>
                      </div>
                    )}
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

                  {/* Action buttons — primary CTAs. On mobile h-12 (48px) is
                      comfortably above Apple HIG's 44px minimum and feels
                      properly tappable proportional to button width. Shrinks
                      to a denser h-10 on sm+ where pointer precision is high. */}
                  <div className="flex flex-col gap-2.5 sm:flex-row">
                    <Button
                      variant="outline"
                      className="h-12 flex-1 text-[15px] sm:h-10 sm:text-sm"
                      onClick={() => {
                        const apiMatch = apiStrategies.find((a) => a.name === strategy.name)
                        router.push(`/strategies/${apiMatch?.id || strategy.id}/backtest`)
                      }}
                    >
                      <LineChartIcon className="mr-2 h-4 w-4" />
                      View Backtest Report
                    </Button>
                    <Button
                      className="h-12 flex-1 text-[15px] sm:h-10 sm:text-sm"
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

                  {isLocalDev && (() => {
                    const apiMatch = apiStrategies.find((a) => a.name === strategy.name)
                    const realId = apiMatch?.id
                    if (!realId) return null
                    const isDeleting = deletingId === realId
                    return (
                      <div className="mt-3 border-t border-border/50 pt-3">
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-loss/30 bg-loss/5 px-3 py-2">
                          <div className="text-xs">
                            <p className="font-medium text-loss">Local dev only</p>
                            <p className="text-[11px] text-muted-foreground">
                              Permanently removes this strategy + all dependents.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-loss/40 text-loss hover:bg-loss/10 hover:text-loss"
                            onClick={() => handleDeleteStrategy(realId, strategy.name)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </div>
                    )
                  })()}
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
