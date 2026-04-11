"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { Activity, ArrowRight, Sun, Moon, Menu, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
}

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
        scrolled ? "border-b border-border/50 bg-background/90 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight">Crypto<span className="text-primary">X</span></span>
        </Link>
        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Link href="/login" className={buttonVariants({ variant: "ghost", className: "text-sm font-medium" })}>Log In</Link>
          <Link href="/signup" className={buttonVariants()}>Get Started <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
    </motion.nav>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/40 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold">Crypto<span className="text-primary">X</span></span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} CryptoX</p>
        </div>
      </div>
    </footer>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>
}

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <section className="pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeUp}>
              <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs">Legal</Badge>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl font-bold tracking-tight sm:text-5xl">
              Terms of Service
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
              Last updated: April 2026
            </motion.p>
            <motion.p variants={fadeUp} className="mt-6 leading-relaxed text-muted-foreground">
              Welcome to CryptoX. By creating an account or using our platform, you agree to these terms.
              Please read them carefully.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={stagger} className="mt-12 space-y-10">
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">1. Acceptance of Terms</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>By accessing or using CryptoX, you agree to be bound by these Terms of Service and our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. If you do not agree to these terms, do not use our platform.</p>
                <p>You must be at least 18 years old and legally permitted to trade cryptocurrency in your jurisdiction to use CryptoX.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">2. Description of Service</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>CryptoX is an algorithmic trading platform that allows you to deploy pre-built trading strategies, backtest strategies against historical data, and monitor live trades across supported cryptocurrency exchanges.</p>
                <p>CryptoX is <Strong>not a broker, exchange, or financial advisor</Strong>. We provide software tools that connect to third-party exchanges via API. All trades are executed on your exchange account, and your funds remain on the exchange at all times.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">3. Account Responsibilities</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>You are responsible for maintaining the security of your account credentials and exchange API keys. You agree to immediately notify us of any unauthorized use of your account.</p>
                <p>You are solely responsible for all activity that occurs under your account, including all trades executed by strategies you deploy.</p>
                <p>You must provide accurate and complete information when creating your account and keep it updated.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">4. Trading Risks</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p><Strong>Cryptocurrency trading involves substantial risk of loss.</Strong> Past performance of any strategy — whether in backtesting or live trading — does not guarantee future results.</p>
                <p>Algorithmic trading strategies can and do lose money. Market conditions change, and strategies that performed well historically may underperform in different conditions.</p>
                <p>You acknowledge that you are solely responsible for your trading decisions and any resulting gains or losses. CryptoX provides tools, not financial advice.</p>
                <p>Backtesting results are based on historical data and do not account for slippage, exchange downtime, API failures, or real-time market impact. Actual trading results may differ significantly.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">5. API Keys and Exchange Access</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>When connecting an exchange, you must provide trade-only API keys. We strongly recommend against providing API keys with withdrawal permissions.</p>
                <p>CryptoX stores your API keys in encrypted form and uses them solely to execute trades and retrieve account data on your behalf. We never access or move your funds.</p>
                <p>You are responsible for ensuring your API keys have appropriate permissions and for revoking them if you suspect they have been compromised.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">6. Subscription and Payments</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>CryptoX offers Free, Pro, and Max subscription plans. Each plan has different feature limits as described on our pricing page.</p>
                <p>Paid subscriptions are billed in advance on a monthly, quarterly, or yearly basis. You may cancel your subscription at any time, and it will remain active until the end of the current billing period.</p>
                <p>We reserve the right to change our pricing with 30 days notice. Price changes will not affect your current billing period.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">7. Prohibited Use</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>You agree not to: (a) use CryptoX for any illegal activity, including market manipulation, (b) attempt to reverse-engineer, decompile, or extract source code from the platform, (c) share your account with others or resell access, (d) use automated tools to scrape or extract data from CryptoX, or (e) intentionally disrupt or overload our servers or services.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">8. Limitation of Liability</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>CryptoX is provided &quot;as is&quot; without warranty of any kind. We do not guarantee uninterrupted or error-free service, successful trade execution, or profitable trading outcomes.</p>
                <p>To the maximum extent permitted by law, CryptoX shall not be liable for any indirect, incidental, special, or consequential damages, including trading losses, lost profits, or data loss, arising from your use of the platform.</p>
                <p>Our total liability for any claim arising from your use of CryptoX shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">9. Termination</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>You may delete your account at any time. Upon deletion, we will stop all active strategies, disconnect all brokers, and remove your personal data within 30 days.</p>
                <p>We reserve the right to suspend or terminate accounts that violate these terms, engage in abusive behavior, or use the platform for illegal activities.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">10. Changes to Terms</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>We may update these terms from time to time. Significant changes will be communicated via email or in-app notification at least 14 days before they take effect.</p>
                <p>Your continued use of CryptoX after updated terms take effect constitutes acceptance of those terms.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">11. Governing Law</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>These terms are governed by the laws of India. Any disputes shall be resolved through arbitration in accordance with the Arbitration and Conciliation Act, 1996.</p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">12. Contact</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>For questions about these terms, reach out through our <Link href="/contact" className="text-primary hover:underline">contact page</Link> or via WhatsApp at +91 8398020076.</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
