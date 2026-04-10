"use client"

import Link from "next/link"
import { useState } from "react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import {
  Activity,
  Blocks,
  Zap,
  PieChart,
  BarChart3,
  Users,
  Bell,
  ArrowRight,
  Check,
  Menu,
  X,
  Sun,
  Moon,
  TrendingUp,
  Shield,
  Globe,
  ChevronRight,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
}

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            Crypto<span className="text-primary">X</span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {["Features", "Strategies", "Pricing"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
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
            Sign Up Free <ArrowRight className="ml-1.5 h-4 w-4" />
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

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden"
        >
          <div className="flex flex-col gap-1 p-4">
            {["Features", "Strategies", "Pricing"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
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
              Sign Up Free
            </Link>
          </div>
        </motion.div>
      )}
    </motion.nav>
  )
}

function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
      {/* Background effects */}
      <div className="grid-pattern absolute inset-0" />
      <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-chart-4/5 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-32">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge
              variant="secondary"
              className="mb-6 gap-1.5 border-primary/20 bg-primary/5 px-4 py-1.5 text-primary"
            >
              <Zap className="h-3.5 w-3.5" />
              Now in Public Beta
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mx-auto max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Trade Smarter with{" "}
            <span className="gradient-text">AI-Powered</span>{" "}
            Algorithms
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg md:text-xl"
          >
            Deploy pre-built trading strategies, manage model portfolios, and
            copy top traders — all without writing a single line of code.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base" })}>
              Start Trading Free <ArrowRight className="ml-2 h-4.5 w-4.5" />
            </Link>
            <Link href="/strategies" className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-8 text-base" })}>
              View Strategies
            </Link>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            variants={fadeUp}
            className="mt-16 flex flex-wrap items-center justify-center gap-8 sm:gap-12"
          >
            {[
              { value: "10K+", label: "Active Traders" },
              { value: "200+", label: "Strategies" },
              { value: "$2.4B+", label: "Volume Traded" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Dashboard preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mx-auto mt-20 max-w-5xl"
        >
          <div className="glow-primary rounded-xl border border-border/50 bg-card/80 p-2 backdrop-blur-sm">
            <div className="rounded-lg bg-card p-4 sm:p-6">
              {/* Mock dashboard header */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Portfolio Value
                  </p>
                  <p className="text-3xl font-bold">$127,845.32</p>
                </div>
                <Badge className="bg-profit/10 text-profit">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  +10.78%
                </Badge>
              </div>
              {/* Mock chart bars */}
              <div className="flex h-40 items-end gap-1 sm:h-48">
                {Array.from({ length: 40 }, (_, i) => {
                  const h = 30 + Math.sin(i * 0.3) * 25 + Math.cos(i * 0.7) * 15 + i * 0.8
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-primary/20 transition-all hover:bg-primary/40"
                      style={{ height: `${Math.min(h, 100)}%` }}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const features = [
    {
      icon: Blocks,
      title: "No-Code Strategy Builder",
      description:
        "Build complex trading strategies visually with our drag-and-drop interface. No coding required.",
    },
    {
      icon: Zap,
      title: "Pre-Built Templates",
      description:
        "Choose from 200+ battle-tested strategy templates. Deploy in one click and start trading instantly.",
    },
    {
      icon: PieChart,
      title: "Model Portfolios",
      description:
        "Curated crypto portfolios with automatic rebalancing. From blue-chip to high-growth allocations.",
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics",
      description:
        "Sharpe ratio, max drawdown, risk-adjusted returns, and tax reports — all in real-time.",
    },
    {
      icon: Users,
      title: "Strategy Backtesting",
      description:
        "Test your strategies against historical data before going live. Validate performance with real market conditions.",
    },
    {
      icon: Bell,
      title: "Smart Alerts",
      description:
        "Instant notifications via Telegram when your strategies execute, hit targets, or need attention.",
    },
  ]

  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge variant="secondary" className="mb-4 px-4 py-1.5">
              Features
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Everything you need to trade like a pro
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-2xl text-muted-foreground"
          >
            Powerful tools made simple. No technical knowledge required.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp}>
              <Card className="group h-full border-border/50 bg-card/50 transition-all duration-300 hover:border-primary/20 hover:bg-card">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
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

function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Choose a Strategy",
      description:
        "Browse our library of proven templates or create your own with the visual builder.",
      icon: Zap,
    },
    {
      step: "02",
      title: "Configure & Deploy",
      description:
        "Set your parameters, test with paper trading, then deploy to your connected exchange.",
      icon: Shield,
    },
    {
      step: "03",
      title: "Monitor & Earn",
      description:
        "Track performance in real-time with smart alerts. Your strategies work 24/7.",
      icon: TrendingUp,
    },
  ]

  return (
    <section className="border-y border-border/50 bg-muted/30 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge variant="secondary" className="mb-4 px-4 py-1.5">
              How It Works
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Start trading in 3 simple steps
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="mt-16 grid gap-8 md:grid-cols-3"
        >
          {steps.map((step, i) => (
            <motion.div key={step.step} variants={fadeUp} className="relative text-center">
              {i < 2 && (
                <div className="absolute left-[calc(50%+40px)] top-10 hidden h-px w-[calc(100%-80px)] bg-border md:block" />
              )}
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card">
                <step.icon className="h-8 w-8 text-primary" />
              </div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
                Step {step.step}
              </p>
              <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function StrategiesPreview() {
  const previewStrategies = [
    { name: "Grid Trading Bot", category: "Grid", return: 12.4, winRate: 78, risk: "Medium" },
    { name: "Smart DCA Pro", category: "DCA", return: 8.7, winRate: 85, risk: "Low" },
    { name: "Momentum Alpha", category: "Trend", return: 24.6, winRate: 62, risk: "High" },
  ]

  return (
    <section id="strategies" className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge variant="secondary" className="mb-4 px-4 py-1.5">
              Strategies
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Battle-tested trading strategies
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-2xl text-muted-foreground"
          >
            Deploy proven strategies with one click. Each template is backtested
            and optimized for different market conditions.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {previewStrategies.map((strategy) => (
            <motion.div key={strategy.name} variants={fadeUp}>
              <Card className="group border-border/50 bg-card/50 transition-all duration-300 hover:border-primary/20 hover:bg-card">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <Badge variant="secondary">{strategy.category}</Badge>
                    <Badge
                      variant="outline"
                      className={
                        strategy.risk === "Low"
                          ? "border-profit/30 text-profit"
                          : strategy.risk === "High"
                            ? "border-loss/30 text-loss"
                            : "border-warning/30 text-warning"
                      }
                    >
                      {strategy.risk}
                    </Badge>
                  </div>
                  <h3 className="mb-4 text-lg font-semibold">{strategy.name}</h3>
                  {/* Mini chart */}
                  <div className="mb-4 flex h-16 items-end gap-0.5">
                    {Array.from({ length: 20 }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-primary/20"
                        style={{
                          height: `${30 + Math.sin(i * 0.5) * 20 + i * 2.5}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-muted-foreground">Return</p>
                      <p className="font-semibold text-profit">
                        +{strategy.return}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Win Rate</p>
                      <p className="font-semibold">{strategy.winRate}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mt-10 text-center"
        >
          <Link href="/strategies" className={buttonVariants({ variant: "outline", size: "lg" })}>
            View All Strategies <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

function PricingSection() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Get started with algo trading",
      features: [
        "2 active strategies",
        "Basic analytics",
        "1 exchange connection",
        "Community support",
        "Paper trading",
      ],
      cta: "Get Started",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "$29",
      period: "/month",
      description: "For serious traders",
      features: [
        "Unlimited strategies",
        "Advanced analytics & reports",
        "5 exchange connections",
        "Copy trading access",
        "Telegram alerts",
        "Strategy builder",
        "Priority support",
      ],
      cta: "Start Pro Trial",
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "$99",
      period: "/month",
      description: "For teams and power users",
      features: [
        "Everything in Pro",
        "Unlimited exchanges",
        "API access",
        "Custom strategies",
        "Tax reports",
        "Dedicated account manager",
        "SLA guarantee",
      ],
      cta: "Contact Sales",
      highlighted: false,
    },
  ]

  return (
    <section id="pricing" className="border-t border-border/50 bg-muted/30 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp}>
            <Badge variant="secondary" className="mb-4 px-4 py-1.5">
              Pricing
            </Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Simple, transparent pricing
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-2xl text-muted-foreground"
          >
            Start free and scale as you grow. No hidden fees.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={stagger}
          className="mt-16 grid gap-6 md:grid-cols-3"
        >
          {plans.map((plan) => (
            <motion.div key={plan.name} variants={fadeUp}>
              <Card
                className={
                  plan.highlighted
                    ? "relative border-primary/30 bg-card glow-primary"
                    : "border-border/50 bg-card/50"
                }
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary px-4 py-1 text-primary-foreground">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 pt-8">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                  <Button
                    className="mt-6 w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    {plan.cta}
                  </Button>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/50 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Activity className="h-4.5 w-4.5 text-primary" />
              </div>
              <span className="text-lg font-bold tracking-tight">
                Crypto<span className="text-primary">X</span>
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              AI-powered algorithmic trading for everyone. Built for traders, by
              traders.
            </p>
          </div>
          {[
            {
              title: "Product",
              links: ["Strategies", "Reports", "Settings", "Pricing"],
            },
            {
              title: "Resources",
              links: ["Documentation", "API Reference", "Blog", "Support"],
            },
            {
              title: "Company",
              links: ["About", "Careers", "Privacy", "Terms"],
            },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold">{col.title}</h4>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} CryptoX. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {[Globe, Activity].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="h-4.5 w-4.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorks />
      <StrategiesPreview />
      <PricingSection />
      <Footer />
    </div>
  )
}
