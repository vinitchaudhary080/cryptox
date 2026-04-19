"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion"
import { useTheme } from "next-themes"
import {
  Activity,
  Blocks,
  Zap,
  BarChart3,
  Bell,
  ArrowRight,
  Menu,
  X,
  Sun,
  Moon,
  TrendingUp,
  Shield,
  ChevronRight,
  LineChart,
  Wallet,
  Play,
  Pause,
  Clock,
  Target,
  Layers,
  GitBranch,
  ArrowUpRight,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Logo } from "@/components/ui/logo"
import { marketApi } from "@/lib/api"

/* ─── Animations ─── */
/* Tuned for mobile-first snappiness: shorter travel, faster duration, lighter
   stagger.  Desktop still looks smooth — users there just won't notice the
   40% speedup.  On mobile the page no longer feels blank during scroll. */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
}

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.05 } },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
}

/* Single viewport config used everywhere — trigger as soon as 5% of an
   element enters the viewport instead of waiting for -50 to -100px inside
   it.  Fixes the "blank section while scrolling" feel on short phone
   screens where the old margin pushed triggers way past the fold. */
const viewportOnce = { once: true, amount: 0.05 as const }

/* ─── Navbar ─── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "border-b border-border/50 bg-background/90 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Logo className="h-7 w-auto md:h-8" />
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {["Features", "How it Works", "Strategies"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Link
            href="/login"
            className={buttonVariants({ variant: "ghost", className: "text-sm font-medium" })}
          >
            Log In
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Get Started <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-1 p-4">
            {["Features", "How it Works", "Strategies"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
                onClick={() => setMobileOpen(false)}
              >
                {item}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
              onClick={() => setMobileOpen(false)}
            >
              Log In
            </Link>
            <Link href="/signup" className={buttonVariants({ className: "mt-1" })}>
              Get Started
            </Link>
          </div>
        </motion.div>
      )}
    </motion.nav>
  )
}

/* ─── Animated Counter ─── */
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { stiffness: 50, damping: 20 })
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString())
  const [ref, setRef] = useState<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!ref) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) motionVal.set(value) },
      { threshold: 0.5 }
    )
    observer.observe(ref)
    return () => observer.disconnect()
  }, [ref, motionVal, value])

  return (
    <span ref={setRef}>
      <motion.span>{display}</motion.span>{suffix}
    </span>
  )
}

/* ─── Live Ticker Bar ─── */
type TickerCoin = { name: string; price: string; change: string }

const FALLBACK_COINS: TickerCoin[] = [
  { name: "BTC", price: "83,412", change: "+2.4%" },
  { name: "ETH", price: "1,845", change: "+1.8%" },
  { name: "SOL", price: "124.5", change: "+5.2%" },
  { name: "XRP", price: "2.08", change: "-0.3%" },
  { name: "DOGE", price: "0.168", change: "+3.1%" },
]

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (price >= 1) return price.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return price.toLocaleString("en-US", { maximumFractionDigits: 4 })
}

function LiveTickerBar() {
  const [coins, setCoins] = useState<TickerCoin[]>(FALLBACK_COINS)

  useEffect(() => {
    let cancelled = false

    const fetchTickers = async () => {
      try {
        const res = await marketApi.overview()
        if (cancelled || !res.success || !Array.isArray(res.data)) return
        const mapped = (res.data as Array<{ symbol: string; price: number; change24h: number }>).map((c) => ({
          name: c.symbol,
          price: formatPrice(c.price),
          change: `${c.change24h >= 0 ? "+" : ""}${c.change24h.toFixed(1)}%`,
        }))
        if (mapped.length > 0) setCoins(mapped)
      } catch {
        // keep last-known values on error
      }
    }

    fetchTickers()
    const id = setInterval(fetchTickers, 45_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="w-full overflow-hidden border-y border-border/30 bg-muted/20">
      <motion.div
        animate={{ x: [0, -800] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="flex items-center gap-8 whitespace-nowrap py-2.5 px-4"
      >
        {[...coins, ...coins, ...coins].map((coin, i) => (
          <div key={i} className="flex items-center gap-3 text-xs">
            <span className="font-semibold">{coin.name}</span>
            <span className="text-muted-foreground">${coin.price}</span>
            <span className={coin.change.startsWith("+") ? "text-profit" : "text-loss"}>
              {coin.change}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

/* ─── Hero Section ─── */
function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16">
      {/* Background effects */}
      <div className="grid-pattern absolute inset-0" />
      <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-chart-4/5 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-32">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="flex flex-col items-center text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 border-primary/20 bg-primary/5 px-4 py-1.5 text-primary"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-profit animate-pulse" />
              Live on Indian Exchanges
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mx-auto max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Free Algo Trading for{" "}
            <span className="text-primary">Indian Crypto Traders</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl"
          >
            Deploy pre-built algorithmic trading strategies on Delta India,
            CoinDCX, Pi42 & Bybit. Backtest on 3 years of real BTC &amp; ETH
            data before going live. No code, no subscriptions — completely free.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base" })}>
              Start Trading Free <ArrowRight className="ml-2 h-4.5 w-4.5" />
            </Link>
            <Link href="#how-it-works" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-8 text-base" })}>
              See How It Works
            </Link>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            variants={fadeUp}
            className="mt-16 flex flex-wrap items-center justify-center gap-8 sm:gap-12"
          >
            {[
              { icon: Shield, label: "Trade-Only API Keys" },
              { icon: Wallet, label: "4 Exchanges Supported" },
              { icon: LineChart, label: "3-Year Backtest Reports" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Dashboard preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8, ease: [0.25, 0.1, 0.25, 1] as const }}
          className="mx-auto mt-20 max-w-5xl"
        >
          <div className="glow-primary rounded-xl border border-border/50 bg-card/80 p-2 backdrop-blur-sm">
            <div className="rounded-lg bg-card p-4 sm:p-6">
              {/* Mock dashboard header */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
                  <p className="text-3xl font-bold">$12,847.32</p>
                </div>
                <Badge className="bg-profit/10 text-profit">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  +10.78%
                </Badge>
              </div>

              {/* Mock chart bars */}
              <div className="flex h-40 items-end gap-1 sm:h-48">
                {Array.from({ length: 40 }, (_, i) => {
                  const h = Math.round(30 + Math.sin(i * 0.3) * 25 + Math.cos(i * 0.7) * 15 + i * 0.8)
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-primary/20 transition-all hover:bg-primary/40"
                      style={{ height: `${Math.min(h, 100)}%` }}
                    />
                  )
                })}
              </div>

              {/* Active strategies row */}
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { name: "Grid Trading", pair: "BTC/USD", status: "active", pnl: "+$234.50" },
                  { name: "Smart DCA", pair: "ETH/USD", status: "active", pnl: "+$89.20" },
                  { name: "Momentum Alpha", pair: "SOL/USD", status: "paused", pnl: "+$456.80" },
                ].map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${s.status === "active" ? "bg-profit animate-pulse" : "bg-warning"}`} />
                      <span className="text-xs font-medium">{s.name}</span>
                      <span className="hidden text-[10px] text-muted-foreground sm:inline">{s.pair}</span>
                    </div>
                    <span className="text-xs font-semibold text-profit">{s.pnl}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Stats Bar ─── */
function StatsBar() {
  return (
    <section className="border-b border-border/30 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="grid grid-cols-2 gap-8 lg:grid-cols-4"
        >
          {[
            { value: 10, suffix: "+", label: "Pre-Built Strategies" },
            { value: 4, suffix: "", label: "Exchanges Supported" },
            { value: 18, suffix: "", label: "Coins with Backtest Reports" },
            { value: 3, suffix: " Years", label: "of 1-Min Historical Data" },
          ].map((stat) => (
            <motion.div key={stat.label} variants={fadeUp} className="text-center">
              <p className="text-3xl font-bold sm:text-4xl">
                <AnimatedNumber value={stat.value} suffix={stat.suffix} />
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Features Section ─── */
function FeaturesSection() {
  const features = [
    {
      icon: Layers,
      title: "Pre-Built Strategies",
      description: "Grid Trading, DCA, Momentum, Mean Reversion, Scalping, and more. One-click deploy to your exchange.",
      tag: "10+ templates",
    },
    {
      icon: LineChart,
      title: "Pre-Built Strategy Backtests",
      description: "Every strategy ships with a 3-year backtest on 1-minute candles across 18 major coins. See real performance before you deploy.",
      tag: "Pre-run on 18 coins",
    },
    {
      icon: Wallet,
      title: "Multi-Broker Support",
      description: "Connect CoinDCX, Delta Exchange India, Pi42, and Bybit. Trade-only API keys — zero withdrawal access.",
      tag: "4 exchanges",
    },
    {
      icon: Activity,
      title: "Live Monitoring",
      description: "Real-time PnL, open positions, trade history. Auto-refresh every 5 seconds. Pause, resume, or stop anytime.",
      tag: "Real-time",
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics",
      description: "Sharpe ratio, max drawdown, profit factor, win rate. Strategy-wise and portfolio-level reporting.",
      tag: "Pro analytics",
    },
    {
      icon: Bell,
      title: "Instant Notifications",
      description: "Trade opens, closes, errors, and strategy status changes. Never miss a beat with real-time alerts.",
      tag: "Live alerts",
    },
  ]

  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
        >
          <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">
            Platform Features
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 max-w-lg text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Everything you need to trade algorithmically
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 max-w-xl text-muted-foreground"
          >
            From strategy selection to live deployment and monitoring. Built for traders who want results, not complexity.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp}>
              <Card className="group h-full border-border/40 bg-card/40 transition-all duration-300 hover:border-primary/20 hover:bg-card/80">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {feature.tag}
                    </span>
                  </div>
                  <h3 className="mb-2 text-base font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Connect Your Exchange",
      description: "Link CoinDCX, Delta Exchange India, Pi42, or Bybit with a trade-only API key. Your funds stay on the exchange — we never have withdrawal access.",
      icon: Wallet,
    },
    {
      step: "02",
      title: "Review Strategy Backtests",
      description: "Each pre-built strategy ships with a transparent 3-year backtest — see win rate, drawdown, and returns on real historical data before you commit.",
      icon: LineChart,
    },
    {
      step: "03",
      title: "Deploy & Monitor",
      description: "One-click deploy. Monitor PnL, open positions, and trade history in real-time. Pause or stop anytime with full control.",
      icon: Play,
    },
  ]

  return (
    <section id="how-it-works" className="border-y border-border/30 bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
        >
          <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">
            How It Works
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 max-w-md text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Live in under 5 minutes
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8"
        >
          {steps.map((step, i) => (
            <motion.div key={step.step} variants={fadeUp} className="relative">
              {/* Connector line */}
              {i < 2 && (
                <div className="absolute left-full top-8 hidden h-px w-8 bg-border/50 md:block" />
              )}

              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-card">
                  <step.icon className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">
                    Step {step.step}
                  </p>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Backtesting Showcase ─── */
function BacktestShowcase() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left - Content */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={stagger}
          >
            <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">
              Transparent Backtests
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
            >
              See the numbers before you trade
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-4 max-w-md text-muted-foreground"
            >
              Every pre-built strategy comes with a 3-year backtest report — run on 1-minute
              candles across 18 major cryptocurrencies. No assumptions, no cherry-picked dates.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 space-y-4">
              {[
                { icon: Clock, text: "3 years of 1-minute resolution data" },
                { icon: Target, text: "Sharpe ratio, drawdown, profit factor, win rate" },
                { icon: GitBranch, text: "Trade-by-trade PnL and equity curves" },
                { icon: Zap, text: "BTC, ETH, SOL, XRP, DOGE + 13 more coins" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
            </motion.div>

            <motion.div variants={fadeUp} className="mt-8">
              <Link href="/signup" className={buttonVariants({ variant: "outline" })}>
                View Strategy Reports <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </motion.div>
          </motion.div>

          {/* Right - Mock backtest result */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={scaleIn}
          >
            <div className="rounded-xl border border-border/40 bg-card/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Backtest Result</p>
                  <p className="font-semibold">Grid Trading &middot; BTC/USD</p>
                </div>
                <Badge className="bg-profit/10 text-profit text-xs">Completed</Badge>
              </div>

              {/* Equity curve */}
              <div className="mb-4 flex h-28 items-end gap-[2px]">
                {Array.from({ length: 50 }, (_, i) => {
                  const base = 20 + i * 1.4
                  const noise = Math.sin(i * 0.4) * 8 + Math.cos(i * 0.7) * 5
                  const h = Math.round(Math.min(base + noise, 100))
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-profit/30"
                      style={{ height: `${h}%` }}
                    />
                  )
                })}
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Total PnL", value: "+$2,847", color: "text-profit" },
                  { label: "Win Rate", value: "73.2%", color: "" },
                  { label: "Max Drawdown", value: "-4.8%", color: "text-loss" },
                  { label: "Sharpe Ratio", value: "1.84", color: "" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg bg-muted/30 p-2.5">
                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                    <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ─── Strategies Preview ─── */
function StrategiesPreview() {
  const strategies = [
    { name: "Grid Trading Bot", type: "Grid", return: 12.4, winRate: 78, risk: "Medium", desc: "Places buy and sell orders at set intervals above and below a base price." },
    { name: "Smart DCA Pro", type: "DCA", return: 8.7, winRate: 85, risk: "Low", desc: "Dollar-cost averages with intelligent timing based on volatility signals." },
    { name: "Momentum Alpha", type: "Trend", return: 24.6, winRate: 62, risk: "High", desc: "Rides strong price trends using momentum indicators and trailing stops." },
    { name: "Mean Reversion Bot", type: "Mean Reversion", return: 15.2, winRate: 71, risk: "Medium", desc: "Trades price deviations from the mean using Bollinger Bands." },
    { name: "Scalping Turbo", type: "Scalping", return: 31.2, winRate: 58, risk: "High", desc: "High-frequency micro-trades capturing small price movements." },
    { name: "Supertrend Strategy", type: "Trend", return: 18.3, winRate: 65, risk: "Medium", desc: "Uses the Supertrend indicator for trend-following entries and exits." },
  ]

  return (
    <section id="strategies" className="border-t border-border/30 bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"
        >
          <div>
            <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">
              Strategy Library
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Battle-tested strategies
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-3 max-w-lg text-muted-foreground">
              Each strategy is backtested and optimized. Deploy in one click or customize parameters to match your risk appetite.
            </motion.p>
          </div>
          <motion.div variants={fadeUp}>
            <Link href="/strategies" className={buttonVariants({ variant: "outline" })}>
              View All <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {strategies.map((strategy) => (
            <motion.div key={strategy.name} variants={fadeUp}>
              <Card className="group h-full border-border/40 bg-card/60 transition-all duration-300 hover:border-primary/20 hover:bg-card/80">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">{strategy.type}</Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        strategy.risk === "Low"
                          ? "border-profit/30 text-profit"
                          : strategy.risk === "High"
                            ? "border-loss/30 text-loss"
                            : "border-warning/30 text-warning"
                      }`}
                    >
                      {strategy.risk} Risk
                    </Badge>
                  </div>

                  <h3 className="text-base font-semibold">{strategy.name}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{strategy.desc}</p>

                  {/* Mini chart */}
                  <div className="mt-4 flex h-12 items-end gap-[2px]">
                    {Array.from({ length: 24 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-primary/20 transition-colors group-hover:bg-primary/30"
                        style={{
                          height: `${Math.round(30 + Math.sin(i * 0.5) * 20 + i * 2)}%`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-muted-foreground">30d Return</p>
                      <p className="font-bold text-profit">+{strategy.return}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Win Rate</p>
                      <p className="font-bold">{strategy.winRate}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Exchanges Section ─── */
function ExchangesSection() {
  const exchanges = [
    { name: "CoinDCX", tag: "India" },
    { name: "Delta Exchange India", tag: "India" },
    { name: "Pi42", tag: "India" },
    { name: "Bybit", tag: "Global" },
  ]

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="text-center"
        >
          <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">
            Integrations
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Connect your favorite exchange
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Secure, trade-only API connections. Your funds stay on the exchange — we never have withdrawal access.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {exchanges.map((ex) => (
            <motion.div
              key={ex.name}
              variants={fadeUp}
              className="flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-card/40 px-4 py-5 transition-all hover:border-primary/20 hover:bg-card/80"
            >
              <Blocks className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{ex.name}</span>
              {ex.tag && (
                <Badge variant="secondary" className="text-[9px]">{ex.tag}</Badge>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── CTA Section ─── */
function CtaSection() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          className="relative overflow-hidden rounded-2xl border border-border/40 bg-muted/50 px-6 py-16 text-center sm:px-12"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.9_0.02_260/0.3),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,oklch(0.25_0.06_260),transparent_70%)]" />
          <div className="relative z-10">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to automate your trading?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Join traders who are already running strategies 24/7. Start with our free plan — no credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base" })}>
                Start Trading Free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="border-t border-border/40 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center">
              <Logo className="h-7 w-auto md:h-8" />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Algorithmic crypto trading for everyone. Deploy pre-built strategies with 3-year backtest reports, and trade 24/7.
            </p>
          </div>
          {[
            {
              title: "Product",
              links: [
                { label: "Strategies", href: "/strategies" },
                { label: "Dashboard", href: "/dashboard" },
              ],
            },
            {
              title: "Resources",
              links: [
                { label: "Blog", href: "/blog" },
                { label: "Support", href: "/contact" },
              ],
            },
            {
              title: "Company",
              links: [
                { label: "About", href: "/about" },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
                { label: "Contact", href: "/contact" },
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold">{col.title}</h4>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} AlgoPulse. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

/* ─── Structured data (JSON-LD) — helps Google understand what AlgoPulse
       actually is and surfaces rich results for algo-trading queries.
       Content is 100% static / built-time; no user input flows in here. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://algopulse.in#organization",
      name: "AlgoPulse",
      url: "https://algopulse.in",
      logo: "https://algopulse.in/logo.svg",
      description:
        "Free algorithmic crypto trading platform for Indian traders. Deploy pre-built strategies on Delta Exchange India, CoinDCX, Pi42, and Bybit.",
      sameAs: [] as string[],
    },
    {
      "@type": "WebSite",
      "@id": "https://algopulse.in#website",
      url: "https://algopulse.in",
      name: "AlgoPulse",
      publisher: { "@id": "https://algopulse.in#organization" },
      inLanguage: "en-IN",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://algopulse.in#software",
      name: "AlgoPulse",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Deploy algo trading strategies on Delta India, CoinDCX, Pi42, and Bybit. Backtest on 3 years of real BTC/ETH data. No code required.",
      url: "https://algopulse.in",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "Pre-built algo trading strategies",
        "Multi-broker support (Delta India, CoinDCX, Pi42, Bybit)",
        "3-year backtest on real market data",
        "24x7 automated execution",
        "Live portfolio analytics",
        "Free forever",
      ],
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "128",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is AlgoPulse free to use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. AlgoPulse is completely free — no credit card required. Connect your broker, pick a strategy, and start trading.",
          },
        },
        {
          "@type": "Question",
          name: "Which exchanges does AlgoPulse support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AlgoPulse supports Delta Exchange India, CoinDCX, Pi42, and Bybit. Connect any of these via API keys to start automated trading.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need coding knowledge to use AlgoPulse?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. AlgoPulse is a no-code platform. All strategies are pre-built and tested. You just configure leverage and position size, then deploy.",
          },
        },
        {
          "@type": "Question",
          name: "Can I backtest strategies before going live?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Every strategy has a free backtest report using 3 years of real BTC and ETH market data, so you can evaluate performance before deploying real capital.",
          },
        },
        {
          "@type": "Question",
          name: "Is my money safe on AlgoPulse?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Your funds stay in your exchange account. AlgoPulse only uses API keys to place trades — we never hold your capital or have withdrawal permissions.",
          },
        },
      ],
    },
  ],
};

/* ─── Main Page ─── */
export function LandingPage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        suppressHydrationWarning
      >{JSON.stringify(jsonLd)}</script>
      <Navbar />
      <HeroSection />
      <LiveTickerBar />
      <StatsBar />
      <FeaturesSection />
      <HowItWorks />
      <BacktestShowcase />
      <StrategiesPreview />
      <ExchangesSection />
      <CtaSection />
      <Footer />
    </div>
  )
}
