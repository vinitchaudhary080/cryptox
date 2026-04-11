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
  Target,
  Rocket,
  Shield,
  Users,
  Linkedin,
  Github,
  Twitter,
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
          <span className="text-lg font-bold tracking-tight">
            Crypto<span className="text-primary">X</span>
          </span>
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
      {mobileOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1 p-4">
            <Link href="/login" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent" onClick={() => setMobileOpen(false)}>Log In</Link>
            <Link href="/signup" className={buttonVariants({ className: "mt-1" })}>Get Started</Link>
          </div>
        </motion.div>
      )}
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

const team = [
  {
    name: "Vinit Chaudhary",
    role: "Co-Founder & CEO",
    bio: "Full-stack developer and crypto trader with a passion for building products that make algorithmic trading accessible to everyone.",
    initials: "VC",
  },
  {
    name: "Arjun Mehta",
    role: "Co-Founder & CTO",
    bio: "Systems engineer specializing in high-performance trading infrastructure, real-time data pipelines, and exchange integrations.",
    initials: "AM",
  },
  {
    name: "Priya Sharma",
    role: "Co-Founder & Head of Product",
    bio: "Product designer and quant researcher focused on creating intuitive interfaces for complex trading strategies and analytics.",
    initials: "PS",
  },
]

const values = [
  {
    icon: Target,
    title: "Simplicity First",
    description: "We believe powerful tools don't need to be complicated. Every feature is designed so you can go from idea to live trading in minutes.",
  },
  {
    icon: Shield,
    title: "Security Always",
    description: "Trade-only API keys, encrypted storage, zero withdrawal access. Your funds stay on your exchange — we never touch them.",
  },
  {
    icon: Rocket,
    title: "Built for Speed",
    description: "Real-time execution, 5-second refresh cycles, and instant notifications. When markets move fast, your strategies keep up.",
  },
  {
    icon: Users,
    title: "Trader-Centric",
    description: "Built by traders, for traders. Every decision — from strategy design to analytics — is informed by real trading experience.",
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-2xl">
            <motion.div variants={fadeUp}>
              <Badge variant="secondary" className="mb-4 px-3 py-1 text-xs">About CryptoX</Badge>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl font-bold tracking-tight sm:text-5xl">
              Making algo trading accessible to every crypto trader
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-6 text-lg leading-relaxed text-muted-foreground">
              CryptoX was born from a simple frustration: algorithmic trading tools were either too
              complex for regular traders or too basic to be useful. We set out to build something
              different — a platform where anyone can deploy proven strategies without writing code.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Story */}
      <section className="border-y border-border/30 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="grid gap-12 lg:grid-cols-2 lg:gap-16"
          >
            <div>
              <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">Our Story</motion.p>
              <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                From late-night trading to a full platform
              </motion.h2>
            </div>
            <div className="space-y-6">
              <motion.p variants={fadeUp} className="leading-relaxed text-muted-foreground">
                In early 2024, three friends — all crypto traders — were tired of watching charts at 3 AM
                and manually executing the same strategies over and over. We knew there had to be a better way.
              </motion.p>
              <motion.p variants={fadeUp} className="leading-relaxed text-muted-foreground">
                We started building CryptoX as a side project — a simple tool to automate our own Grid
                Trading and DCA strategies on Delta Exchange. Word spread. Friends wanted in. Then their
                friends. Before we knew it, we had a platform.
              </motion.p>
              <motion.p variants={fadeUp} className="leading-relaxed text-muted-foreground">
                Today, CryptoX supports 6 major exchanges, 10+ pre-built strategies, and a backtesting
                engine with 3 years of minute-level data. But our mission hasn&apos;t changed: make algo
                trading simple enough that any trader can use it, and powerful enough that they&apos;d never
                go back to manual trading.
              </motion.p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">What We Believe</motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 max-w-md text-3xl font-bold tracking-tight sm:text-4xl">
              Our core values
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="mt-12 grid gap-4 sm:grid-cols-2"
          >
            {values.map((v) => (
              <motion.div key={v.title} variants={fadeUp}>
                <Card className="h-full border-border/40 bg-card/40 transition-all hover:border-primary/20 hover:bg-card/80">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <v.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold">{v.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{v.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team */}
      <section className="border-y border-border/30 bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.p variants={fadeUp} className="text-sm font-semibold uppercase tracking-widest text-primary">The Team</motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Meet the founders
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 max-w-lg text-muted-foreground">
              Three traders who got tired of doing things manually and decided to build a better way.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="mt-12 grid gap-6 sm:grid-cols-3"
          >
            {team.map((member) => (
              <motion.div key={member.name} variants={fadeUp}>
                <Card className="h-full border-border/40 bg-card/40 transition-all hover:border-primary/20 hover:bg-card/80">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                      {member.initials}
                    </div>
                    <h3 className="text-base font-semibold">{member.name}</h3>
                    <p className="mt-0.5 text-xs font-medium text-primary">{member.role}</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{member.bio}</p>
                  </CardContent>
                </Card>
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
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Want to join the journey?</h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Start trading with CryptoX today. Free plan, no credit card required.
            </p>
            <div className="mt-8">
              <Link href="/signup" className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base" })}>
                Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
