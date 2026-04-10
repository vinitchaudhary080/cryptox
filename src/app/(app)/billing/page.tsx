"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  CreditCard,
  Check,
  Zap,
  Crown,
  Gem,
  Calendar,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAuthStore } from "@/stores/auth-store"
import { subscriptionApi } from "@/lib/api"

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

type BillingCycle = "MONTHLY" | "QUARTERLY" | "YEARLY"

const CYCLE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
}

interface PlanData {
  id: string
  name: string
  prices: Record<string, number>
  limits: { maxStrategies: number; maxBrokers: number; maxBacktestsPerDay: number; maxDataYears: number }
}

interface SubscriptionData {
  id: string
  plan: string
  cycle: string
  status: string
  amount: number
  startDate: string
  endDate: string
  cancelledAt: string | null
}

const PLAN_META: Record<string, { icon: typeof Zap; color: string; bg: string; features: string[] }> = {
  FREE: {
    icon: Zap,
    color: "text-muted-foreground",
    bg: "bg-muted",
    features: [
      "2 deployed strategies",
      "1 broker connection",
      "5 backtests per day",
      "1 year data for backtest",
      "Community support",
    ],
  },
  PRO: {
    icon: Crown,
    color: "text-primary",
    bg: "bg-primary/10",
    features: [
      "20 deployed strategies",
      "5 broker connections",
      "100 backtests per day",
      "3 years data for backtest",
      "Real-time notifications",
      "Priority execution",
      "Advanced analytics",
      "Email support",
    ],
  },
  MAX: {
    icon: Gem,
    color: "text-chart-4",
    bg: "bg-chart-4/10",
    features: [
      "Unlimited strategies",
      "Unlimited broker connections",
      "Unlimited backtests",
      "5 years data for backtest",
      "Custom strategy builder",
      "API access",
      "Dedicated support",
      "Team collaboration",
    ],
  },
}

export default function BillingPage() {
  const { user } = useAuthStore()
  const currentPlan = user?.plan ?? "FREE"

  const [plans, setPlans] = useState<PlanData[]>([])
  const [activeSub, setActiveSub] = useState<SubscriptionData | null>(null)
  const [history, setHistory] = useState<SubscriptionData[]>([])
  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY")
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [plansRes, subRes] = await Promise.all([
      subscriptionApi.plans(),
      subscriptionApi.current(),
    ])
    if (plansRes.success && plansRes.data) setPlans(plansRes.data as PlanData[])
    if (subRes.success && subRes.data) {
      const d = subRes.data as { active: SubscriptionData | null; history: SubscriptionData[] }
      setActiveSub(d.active)
      setHistory(d.history)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSubscribe = async (planId: string) => {
    if (planId === "FREE") return
    setSubscribing(planId)
    const res = await subscriptionApi.subscribe(planId, cycle)
    if (res.success) {
      await fetchData()
      // Refresh user data in auth store
      window.location.reload()
    }
    setSubscribing(null)
  }

  const handleCancel = async () => {
    const res = await subscriptionApi.cancel()
    if (res.success) await fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="mx-auto max-w-5xl space-y-6 p-4 md:p-6"
    >
      {/* Header */}
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold tracking-tight">Billing & Subscription</h1>
        <p className="text-sm text-muted-foreground">Manage your plan and view billing history</p>
      </motion.div>

      {/* Current Plan */}
      <motion.div variants={fadeUp}>
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Plan</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold">{currentPlan === "MAX" ? "Max" : currentPlan === "PRO" ? "Pro" : "Free"}</p>
                  <Badge variant="outline" className="border-profit/30 bg-profit/10 text-profit text-xs">Active</Badge>
                </div>
                {activeSub && (
                  <p className="text-xs text-muted-foreground">
                    {CYCLE_LABELS[activeSub.cycle]} &middot; Renews {new Date(activeSub.endDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            {activeSub && activeSub.status === "ACTIVE" && currentPlan !== "FREE" && (
              <Button variant="outline" size="sm" onClick={handleCancel}>Cancel Subscription</Button>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Billing Cycle Toggle */}
      <motion.div variants={fadeUp} className="flex items-center justify-center">
        <div className="flex rounded-xl bg-muted/50 p-1">
          {(["MONTHLY", "QUARTERLY", "YEARLY"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                cycle === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {CYCLE_LABELS[c]}
              {c === "YEARLY" && <Badge className="ml-1.5 bg-profit/20 text-profit text-[9px] px-1.5 py-0">Save 28%</Badge>}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Plans */}
      <motion.div variants={fadeUp}>
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const meta = PLAN_META[plan.id] ?? PLAN_META.FREE
            const Icon = meta.icon
            const isActive = currentPlan === plan.id
            const price = plan.prices[cycle] ?? 0

            return (
              <Card
                key={plan.id}
                className={`relative transition-all ${isActive ? "ring-2 ring-primary/30 border-primary/30" : "border-border/50 hover:border-foreground/20"}`}
              >
                {plan.id === "PRO" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary px-3 text-[10px] font-semibold text-primary-foreground">Most Popular</Badge>
                  </div>
                )}

                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.bg}`}>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                    </div>
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">${price}</span>
                        {price > 0 && <span className="text-xs text-muted-foreground">/{cycle === "MONTHLY" ? "mo" : cycle === "QUARTERLY" ? "qtr" : "yr"}</span>}
                        {price === 0 && <span className="text-xs text-muted-foreground">forever</span>}
                      </div>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <ul className="space-y-2.5">
                    {meta.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${meta.color}`} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5">
                    {isActive ? (
                      <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                    ) : plan.id === "FREE" ? (
                      <Button variant="outline" className="w-full" disabled>Free Forever</Button>
                    ) : (
                      <Button
                        variant={plan.id === "PRO" ? "default" : "outline"}
                        className="w-full"
                        disabled={subscribing !== null}
                        onClick={() => handleSubscribe(plan.id)}
                      >
                        {subscribing === plan.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {currentPlan === "FREE" ? "Upgrade" : "Switch"} to {plan.name}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </motion.div>

      {/* Billing History */}
      <motion.div variants={fadeUp}>
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Subscription History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="mb-2 h-8 w-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No subscription history</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="px-5 py-3 text-left font-medium">Date</th>
                      <th className="px-5 py-3 text-left font-medium">Plan</th>
                      <th className="px-5 py-3 text-left font-medium">Cycle</th>
                      <th className="px-5 py-3 text-right font-medium">Amount</th>
                      <th className="px-5 py-3 text-left font-medium">Valid Until</th>
                      <th className="px-5 py-3 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((sub) => (
                      <tr key={sub.id} className="border-b border-border/20 last:border-0">
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {new Date(sub.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3 font-medium">{sub.plan}</td>
                        <td className="px-5 py-3 text-muted-foreground">{CYCLE_LABELS[sub.cycle]}</td>
                        <td className="px-5 py-3 text-right font-mono">${sub.amount.toFixed(2)}</td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">
                          {new Date(sub.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              sub.status === "ACTIVE" ? "border-profit/30 bg-profit/10 text-profit"
                                : sub.status === "CANCELLED" ? "border-warning/30 bg-warning/10 text-warning"
                                : "border-loss/30 bg-loss/10 text-loss"
                            }`}
                          >
                            {sub.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
