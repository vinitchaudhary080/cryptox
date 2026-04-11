"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Search,
  Filter,
  TrendingUp,
  Users,
  BarChart3,
  Zap,
  ArrowRight,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { strategyApi } from "@/lib/api"
import { strategies as mockStrategies } from "@/lib/mock-data"
import { DeployDialog } from "@/components/strategies/deploy-dialog"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

const categories = ["All", "Grid", "DCA", "Trend", "Mean Reversion", "Meri Strategy", "Arbitrage", "Scalping"]

const riskColors = {
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
}

export default function StrategiesPage() {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [apiStrategies, setApiStrategies] = useState<ApiStrategy[]>([])
  const [deployOpen, setDeployOpen] = useState(false)
  const [deployTarget, setDeployTarget] = useState<{ id: string; name: string; category: string } | null>(null)

  useEffect(() => {
    strategyApi.list().then((res) => {
      if (res.success && res.data) setApiStrategies(res.data as ApiStrategy[])
    })
  }, [])

  // Use API strategies directly
  const strategies = apiStrategies.length > 0
    ? apiStrategies.map((api) => {
        const mock = mockStrategies.find((m) => m.name === api.name)
        return mock ? { ...mock, id: api.id, description: api.description } : {
          id: api.id,
          name: api.name,
          description: api.description,
          category: api.category,
          return: 0,
          winRate: 0,
          risk: api.riskLevel === "HIGH" ? "High" : api.riskLevel === "LOW" ? "Low" : "Medium",
          subscribers: 0,
          trades: 0,
          pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
          performance: Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 100 + Math.round(Math.sin(i * 0.3) * 10 + i * 0.5) })),
        }
      })
    : []

  const filtered = strategies.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory =
      activeCategory === "All" || s.category === activeCategory
    return matchesSearch && matchesCategory
  })

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
        <a href="/builder" className={buttonVariants()}>
          <Zap className="mr-2 h-4 w-4" /> Build Custom
        </a>
      </motion.div>

      {/* Filters */}
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
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Strategy Cards */}
      {filtered.length === 0 && (
        <motion.div variants={fadeUp}>
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Zap className="mb-3 h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">No strategies match your filter</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try a different category or clear your search
              </p>
              <button
                onClick={() => { setActiveCategory("All"); setSearch("") }}
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

              {/* Strategy Detail Dialog */}
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    {strategy.name}
                    <Badge
                      variant="outline"
                      className={riskColors[strategy.risk]}
                    >
                      {strategy.risk} risk
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    {strategy.description}
                  </p>

                  {/* Performance Chart */}
                  <div className="h-48">
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
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "30D Return", value: `+${strategy.returnRate}%`, icon: TrendingUp },
                      { label: "Win Rate", value: `${strategy.winRate}%`, icon: BarChart3 },
                      { label: "Total Trades", value: strategy.trades.toLocaleString(), icon: Zap },
                      { label: "Subscribers", value: strategy.subscribers.toLocaleString(), icon: Users },
                    ].map((stat) => (
                      <div key={stat.label} className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
                        <stat.icon className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                          <p className="text-sm font-semibold">{stat.value}</p>
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

                  {/* Deploy Button */}
                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        const apiMatch = apiStrategies.find((a) => a.name === strategy.name)
                        setDeployTarget({
                          id: apiMatch?.id || strategy.id,
                          name: strategy.name,
                          category: apiMatch?.category || strategy.category,
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
        />
      )}
    </motion.div>
  )
}
