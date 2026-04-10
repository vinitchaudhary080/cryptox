"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Wifi,
  WifiOff,
  Activity,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { marketApi } from "@/lib/api"
import { cn } from "@/lib/utils"

type MarketCoin = {
  symbol: string
  name: string
  icon: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

type TabId = "all" | "bullish" | "bearish" | "neutral"

const tabs: { id: TabId; label: string; icon: typeof TrendingUp }[] = [
  { id: "all", label: "All", icon: Activity },
  { id: "bullish", label: "Bullish", icon: TrendingUp },
  { id: "bearish", label: "Bearish", icon: TrendingDown },
  { id: "neutral", label: "Neutral", icon: Minus },
]

// Show only top 5 coins
const TOP_COINS = ["BTC", "ETH", "SOL", "XRP", "DOGE"]

const ICON_COLORS: Record<string, string> = {
  BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", XRP: "#00AAE4", DOGE: "#C2A633",
}

const ICON_BG: Record<string, string> = {
  BTC: "bg-[#F7931A]/10", ETH: "bg-[#627EEA]/10", SOL: "bg-[#9945FF]/10", XRP: "bg-[#00AAE4]/10", DOGE: "bg-[#C2A633]/10",
}

function CoinIcon({ symbol }: { symbol: string }) {
  const color = ICON_COLORS[symbol] || "#6366F1"
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      {symbol.slice(0, 3)}
    </div>
  )
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (price >= 1) return `$${price.toFixed(4)}`
  return `$${price.toFixed(6)}`
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`
  return vol.toFixed(0)
}

function MiniSparkline({ change }: { change: number }) {
  // Simple visual indicator instead of a full chart
  const positive = change > 0
  const barWidth = Math.min(Math.abs(change) * 8, 100)
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          positive ? "bg-profit/60" : change < 0 ? "bg-loss/60" : "bg-muted-foreground/30"
        )}
        style={{ width: `${Math.max(barWidth, 4)}%` }}
      />
    </div>
  )
}

export function MarketOverview() {
  const [coins, setCoins] = useState<MarketCoin[]>([])
  const [activeTab, setActiveTab] = useState<TabId>("all")
  const [loading, setLoading] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const prevPrices = useRef<Record<string, number>>({})
  const [flashing, setFlashing] = useState<Record<string, "up" | "down">>({})

  // Initial load
  useEffect(() => {
    marketApi.overview().then((res) => {
      if (res.success && res.data) {
        const data = (res.data as MarketCoin[]).filter((c) => TOP_COINS.includes(c.symbol))
        setCoins(data)
        data.forEach((c) => { prevPrices.current[c.symbol] = c.price })
      }
      setLoading(false)
    })
  }, [])

  // WebSocket for real-time updates
  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:4000"
    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      try {
        const ioUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`
        ws = new WebSocket(ioUrl.replace("http://", "ws://").replace("https://", "wss://"))

        ws.onopen = () => {
          setWsConnected(true)
          ws?.send("40")
        }

        ws.onmessage = (event) => {
          const msg = event.data as string
          if (msg.startsWith("42")) {
            try {
              const parsed = JSON.parse(msg.slice(2))
              if (parsed[0] === "market:overview" && Array.isArray(parsed[1])) {
                const allCoins = parsed[1] as MarketCoin[]
                const newCoins = allCoins.filter((c) => TOP_COINS.includes(c.symbol))

                const newFlashing: Record<string, "up" | "down"> = {}
                newCoins.forEach((c) => {
                  const prev = prevPrices.current[c.symbol]
                  if (prev !== undefined && c.price !== prev) {
                    newFlashing[c.symbol] = c.price > prev ? "up" : "down"
                  }
                  prevPrices.current[c.symbol] = c.price
                })

                setCoins(newCoins)
                if (Object.keys(newFlashing).length > 0) {
                  setFlashing(newFlashing)
                  setTimeout(() => setFlashing({}), 800)
                }
              }
            } catch { /* ignore */ }
          }
          if (msg === "2") ws?.send("3")
        }

        ws.onclose = () => {
          setWsConnected(false)
          reconnectTimeout = setTimeout(connect, 3000)
        }
        ws.onerror = () => ws?.close()
      } catch {
        setWsConnected(false)
      }
    }

    connect()
    return () => { clearTimeout(reconnectTimeout); ws?.close() }
  }, [])

  // Fallback polling
  useEffect(() => {
    if (wsConnected) return
    const interval = setInterval(() => {
      marketApi.overview().then((res) => {
        if (res.success && res.data) {
          const allCoins = res.data as MarketCoin[]
          const newCoins = allCoins.filter((c) => TOP_COINS.includes(c.symbol))
          const newFlashing: Record<string, "up" | "down"> = {}
          newCoins.forEach((c) => {
            const prev = prevPrices.current[c.symbol]
            if (prev !== undefined && c.price !== prev) {
              newFlashing[c.symbol] = c.price > prev ? "up" : "down"
            }
            prevPrices.current[c.symbol] = c.price
          })
          setCoins(newCoins)
          if (Object.keys(newFlashing).length > 0) {
            setFlashing(newFlashing)
            setTimeout(() => setFlashing({}), 800)
          }
        }
      })
    }, 15_000)
    return () => clearInterval(interval)
  }, [wsConnected])

  const filtered = coins.filter((coin) => {
    if (activeTab === "all") return true
    if (activeTab === "bullish") return coin.change24h > 1
    if (activeTab === "bearish") return coin.change24h < -1
    return coin.change24h >= -1 && coin.change24h <= 1
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-semibold">Market Overview</CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1.5 text-[10px]",
                  wsConnected
                    ? "border-profit/30 text-profit"
                    : "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {wsConnected ? <><Wifi className="h-2.5 w-2.5" /> Live</> : <><WifiOff className="h-2.5 w-2.5" /> Polling</>}
              </Badge>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="marketTab"
                      className="absolute inset-0 rounded-md bg-background shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <tab.icon className="relative z-10 h-3 w-3" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No coins match this filter
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <AnimatePresence mode="popLayout">
                {filtered.map((coin) => {
                  const flash = flashing[coin.symbol]
                  const positive = coin.change24h > 0
                  const negative = coin.change24h < 0

                  return (
                    <motion.div
                      key={coin.symbol}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div
                        className={cn(
                          "group relative overflow-hidden rounded-xl border border-border/40 p-4 transition-all hover:border-border hover:shadow-md",
                          flash === "up" && "border-profit/40 bg-profit/5",
                          flash === "down" && "border-loss/40 bg-loss/5",
                          !flash && "bg-card/50 hover:bg-card/80"
                        )}
                      >
                        {/* Top: Icon + Name + Change Badge */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <CoinIcon symbol={coin.symbol} />
                            <div>
                              <p className="text-sm font-bold">{coin.symbol}</p>
                              <p className="text-[11px] text-muted-foreground">{coin.name}</p>
                            </div>
                          </div>
                          <div className={cn(
                            "flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-semibold",
                            positive ? "bg-profit/10 text-profit" : negative ? "bg-loss/10 text-loss" : "bg-muted text-muted-foreground"
                          )}>
                            {positive ? <ArrowUpRight className="h-3 w-3" /> : negative ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {positive ? "+" : ""}{coin.change24h.toFixed(2)}%
                          </div>
                        </div>

                        {/* Price */}
                        <p className={cn(
                          "mt-3 text-xl font-bold tracking-tight transition-colors",
                          flash === "up" && "text-profit",
                          flash === "down" && "text-loss",
                        )}>
                          {formatPrice(coin.price)}
                        </p>

                        {/* Momentum bar */}
                        <div className="mt-2.5">
                          <MiniSparkline change={coin.change24h} />
                        </div>

                        {/* Bottom: H/L + Volume */}
                        <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="text-profit">H {formatPrice(coin.high24h)}</span>
                            <span className="text-loss">L {formatPrice(coin.low24h)}</span>
                          </div>
                          <span>Vol {formatVolume(coin.volume24h)}</span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
