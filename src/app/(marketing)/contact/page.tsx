"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import {
  Activity,
  ArrowRight,
  Sun,
  Moon,
  Menu,
  X,
  MessageCircle,
  Phone,
  Clock,
  ArrowUpRight,
  HelpCircle,
  Zap,
  Shield,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useState, useEffect } from "react"

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
}

const WHATSAPP_NUMBER = "919876543211"
const PHONE_NUMBER = "+919876543211"
const DEFAULT_WA_MESSAGE = encodeURIComponent(
  "Hi CryptoX team! I need help with your platform. Could you please assist me?"
)

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

const faqs = [
  {
    q: "How do I connect my exchange?",
    a: "Go to the Brokers page in your dashboard, click 'Connect Broker', select your exchange, and enter your trade-only API key and secret. We support Delta Exchange, Binance, Bybit, OKX, KuCoin, and Bitget.",
  },
  {
    q: "Is my money safe?",
    a: "Yes. We only use trade-only API keys — we never have access to withdraw your funds. Your money stays on your exchange at all times. API keys are encrypted with AES-256.",
  },
  {
    q: "Can I lose money with algo trading?",
    a: "Yes. All trading involves risk. Past performance of strategies, including backtests, does not guarantee future results. Always use our backtesting feature to validate strategies and never invest more than you can afford to lose.",
  },
  {
    q: "How does backtesting work?",
    a: "Our backtesting engine runs your strategy against 3 years of real 1-minute candle data across 10 major coins. It calculates metrics like total PnL, win rate, max drawdown, and Sharpe ratio so you can evaluate performance before going live.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes. You can cancel your Pro or Max subscription at any time. Your plan will remain active until the end of your current billing period, and you'll be downgraded to the Free plan after that.",
  },
  {
    q: "What exchanges do you support?",
    a: "We currently support Delta Exchange, Binance, Bybit, OKX, KuCoin, and Bitget. We're continuously adding more exchanges based on user demand.",
  },
]

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-2xl">
            <motion.div variants={fadeUp}>
              <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs">Support</Badge>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl font-bold tracking-tight sm:text-5xl">
              Get in touch
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-6 text-lg leading-relaxed text-muted-foreground">
              Have a question, need help with your account, or want to report an issue?
              We&apos;re here to help. Reach out via WhatsApp for the fastest response.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Contact Options */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {/* WhatsApp Chat */}
            <motion.div variants={fadeUp}>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${DEFAULT_WA_MESSAGE}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Card className="group h-full border-border/40 bg-card/40 transition-all duration-300 hover:border-green-500/30 hover:bg-card/80">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 transition-colors group-hover:bg-green-500/20">
                      <MessageCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">WhatsApp Chat</h3>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Chat with us on WhatsApp for the fastest support. We typically respond within minutes during business hours.
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-sm font-medium text-green-500">
                      <span>Start Chat</span>
                    </div>
                  </CardContent>
                </Card>
              </a>
            </motion.div>

            {/* Phone Call */}
            <motion.div variants={fadeUp}>
              <a href={`tel:${PHONE_NUMBER}`} className="block">
                <Card className="group h-full border-border/40 bg-card/40 transition-all duration-300 hover:border-primary/30 hover:bg-card/80">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <Phone className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">Call Us</h3>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Prefer talking? Give us a call directly. Available during business hours for account and trading support.
                    </p>
                    <div className="mt-4 text-sm font-medium text-primary">
                      +91 83980 20076
                    </div>
                  </CardContent>
                </Card>
              </a>
            </motion.div>

            {/* Response Time */}
            <motion.div variants={fadeUp}>
              <Card className="h-full border-border/40 bg-card/40">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                    <Clock className="h-6 w-6 text-warning" />
                  </div>
                  <h3 className="text-lg font-semibold">Response Times</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    We aim to respond as quickly as possible to all inquiries.
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">WhatsApp</span>
                      <span className="font-medium">&lt; 30 minutes</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="font-medium">Immediate</span>
                    </div>
                    <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Mon – Sat, 10:00 AM – 7:00 PM IST
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-y border-border/30 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">
              FAQ
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked questions
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
              Quick answers to common questions. Can&apos;t find what you need? Reach out on WhatsApp.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="mt-12 space-y-4"
          >
            {faqs.map((faq) => (
              <motion.div
                key={faq.q}
                variants={fadeUp}
                className="rounded-xl border border-border/40 bg-card/40 p-5 transition-all hover:border-primary/20 hover:bg-card/80"
              >
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">{faq.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center"
          >
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Still have questions?</h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Our team is always happy to help. Drop us a message on WhatsApp and we&apos;ll get back to you right away.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${DEFAULT_WA_MESSAGE}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base bg-green-600 hover:bg-green-700" })}
              >
                <MessageCircle className="mr-2 h-5 w-5" />
                Chat on WhatsApp
              </a>
              <a
                href={`tel:${PHONE_NUMBER}`}
                className={buttonVariants({ variant: "outline", size: "lg", className: "h-12 px-8 text-base" })}
              >
                <Phone className="mr-2 h-4 w-4" />
                Call Us
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
