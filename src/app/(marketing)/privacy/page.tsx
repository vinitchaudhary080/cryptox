"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { ArrowRight, Sun, Moon, Menu, X } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState, useEffect } from "react"

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const } },
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
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="AlgoPulse" className="h-7 w-auto md:h-8" />
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
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="AlgoPulse" className="h-6 w-auto" />
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} AlgoPulse</p>
        </div>
      </div>
    </footer>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>
}

export default function PrivacyPage() {
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
              Privacy Policy
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
              Last updated: April 2026
            </motion.p>
            <motion.p variants={fadeUp} className="mt-6 leading-relaxed text-muted-foreground">
              At AlgoPulse, your privacy is fundamental to how we build and operate. This policy explains
              what data we collect, how we use it, and how we protect it. We believe in transparency —
              no legalese, no hidden clauses.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={stagger} className="mt-12 space-y-10">
            {/* 1 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">1. Information We Collect</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p><Strong>Account Information</Strong>: When you sign up, we collect your name, email address, and password. If you use Google OAuth, we receive your Google profile information (name, email, and profile picture).</p>
                <p><Strong>Exchange API Keys</Strong>: When you connect a broker, we store your API key and secret in encrypted form. We only request trade-only permissions — we never have access to withdraw your funds.</p>
                <p><Strong>Usage Data</Strong>: We collect information about how you use AlgoPulse, including strategies deployed, backtests run, and features accessed. This helps us improve the platform.</p>
                <p><Strong>Device Information</Strong>: We automatically collect browser type, operating system, and IP address for security and analytics purposes.</p>
              </div>
            </motion.div>

            {/* 2 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">2. How We Use Your Information</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p><Strong>To provide our services</Strong>: Execute your trading strategies, run backtests, and display portfolio analytics.</p>
                <p><Strong>To secure your account</Strong>: Detect unauthorized access, prevent fraud, and protect your API keys with encryption.</p>
                <p><Strong>To improve AlgoPulse</Strong>: Analyze usage patterns to build better features, fix bugs, and optimize performance.</p>
                <p><Strong>To communicate with you</Strong>: Send trade notifications, strategy alerts, and important account updates. We will never send marketing emails without your consent.</p>
              </div>
            </motion.div>

            {/* 3 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">3. Data Security</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>All API keys are encrypted at rest using AES-256 encryption. We use trade-only API permissions, meaning we can execute trades on your behalf but never withdraw funds from your exchange account.</p>
                <p>All data transmitted between your browser and our servers is encrypted using TLS 1.3. We use JWT-based authentication with short-lived access tokens and secure refresh token rotation.</p>
                <p>Our servers are hosted on AWS with industry-standard security practices including firewalls, access controls, and regular security audits.</p>
              </div>
            </motion.div>

            {/* 4 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">4. Data Sharing</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p><Strong>We do not sell your data.</Strong> We do not share your personal information with third parties for marketing purposes.</p>
                <p>We may share data with: (a) exchange partners solely to execute your trades via API, (b) service providers who help us operate AlgoPulse (hosting, email), under strict data protection agreements, and (c) law enforcement when legally required.</p>
              </div>
            </motion.div>

            {/* 5 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">5. Data Retention</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>We retain your account data for as long as your account is active. Trade history and backtest results are stored indefinitely for your reference.</p>
                <p>If you delete your account, we will remove your personal data within 30 days. Encrypted API keys are deleted immediately upon broker disconnection or account deletion.</p>
              </div>
            </motion.div>

            {/* 6 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">6. Your Rights</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>You have the right to: (a) access your personal data, (b) correct inaccurate data, (c) delete your account and associated data, (d) export your trade history and backtest results, and (e) withdraw consent for optional data processing.</p>
                <p>To exercise any of these rights, contact us via WhatsApp or through our <Link href="/contact" className="text-primary hover:underline">contact page</Link>.</p>
              </div>
            </motion.div>

            {/* 7 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">7. Cookies</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>We use essential cookies for authentication and session management. We do not use third-party tracking cookies or advertising cookies.</p>
                <p>You can disable cookies in your browser settings, but this may affect your ability to use AlgoPulse.</p>
              </div>
            </motion.div>

            {/* 8 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">8. Changes to This Policy</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>We may update this privacy policy from time to time. We will notify you of significant changes via email or an in-app notification. Your continued use of AlgoPulse after changes constitutes acceptance of the updated policy.</p>
              </div>
            </motion.div>

            {/* 9 */}
            <motion.div variants={fadeUp}>
              <h2 className="mb-4 text-xl font-semibold">9. Contact Us</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>If you have questions about this privacy policy or your data, reach out to us through our <Link href="/contact" className="text-primary hover:underline">contact page</Link> or via WhatsApp at +91 9876543211.</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
