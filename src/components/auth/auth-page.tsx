"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { useAuthStore } from "@/stores/auth-store"
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowRight,
  Sun,
  Moon,
  ChevronLeft,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Logo } from "@/components/ui/logo"
import { cn } from "@/lib/utils"
import { authApi } from "@/lib/api"

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""

function buildGoogleAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.07 } },
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function AuthPage({ defaultTab = "login" }: { defaultTab?: "login" | "signup" }) {
  const [tab, setTab] = useState<"login" | "signup">(defaultTab)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const { theme, setTheme } = useTheme()
  const { login, signup, googleLogin, isLoading, error, clearError } = useAuthStore()
  const router = useRouter()
  const [googleLoading, setGoogleLoading] = useState(false)

  // OTP verification state
  const [showOtp, setShowOtp] = useState(false)
  const [otpEmail, setOtpEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [otpSuccess, setOtpSuccess] = useState("")

  // Forgot password state (Approach C: email → OTP → new password)
  type ForgotStep = "email" | "otp" | "reset" | "done"
  const [forgotStep, setForgotStep] = useState<ForgotStep | null>(null)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotOtp, setForgotOtp] = useState("")
  const [forgotResetToken, setForgotResetToken] = useState("")
  const [forgotNewPassword, setForgotNewPassword] = useState("")
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("")
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState("")
  const [forgotInfo, setForgotInfo] = useState("")

  const resetForgotFlow = () => {
    setForgotStep(null)
    setForgotEmail("")
    setForgotOtp("")
    setForgotResetToken("")
    setForgotNewPassword("")
    setForgotConfirmPassword("")
    setForgotError("")
    setForgotInfo("")
    setForgotLoading(false)
  }

  const handleForgotRequest = async () => {
    if (!forgotEmail) {
      setForgotError("Enter your email address")
      return
    }
    setForgotLoading(true)
    setForgotError("")
    setForgotInfo("")
    try {
      const res = await authApi.forgotPassword(forgotEmail.trim()) as { success: boolean; error?: string }
      if (res.success) {
        setForgotStep("otp")
        setForgotInfo(`If an account exists for ${forgotEmail}, a 6-digit code has been sent. Check your inbox (and spam).`)
      } else {
        setForgotError(res.error || "Failed to send code")
      }
    } catch (err) {
      setForgotError((err as Error).message || "Something went wrong")
    } finally {
      setForgotLoading(false)
    }
  }

  const handleForgotVerifyOtp = async () => {
    if (forgotOtp.length !== 6) {
      setForgotError("Enter the full 6-digit code")
      return
    }
    setForgotLoading(true)
    setForgotError("")
    setForgotInfo("")
    try {
      const res = await authApi.verifyResetOtp(forgotEmail.trim(), forgotOtp) as {
        success: boolean
        data?: { resetToken?: string }
        error?: string
      }
      if (res.success && res.data?.resetToken) {
        setForgotResetToken(res.data.resetToken)
        setForgotStep("reset")
      } else {
        setForgotError(res.error || "Invalid code")
      }
    } catch (err) {
      setForgotError((err as Error).message || "Something went wrong")
    } finally {
      setForgotLoading(false)
    }
  }

  const handleForgotResetPassword = async () => {
    if (forgotNewPassword.length < 8) {
      setForgotError("Password must be at least 8 characters")
      return
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("Passwords do not match")
      return
    }
    setForgotLoading(true)
    setForgotError("")
    setForgotInfo("")
    try {
      const res = await authApi.resetPassword(forgotResetToken, forgotNewPassword) as { success: boolean; error?: string }
      if (res.success) {
        setForgotStep("done")
        setForgotInfo("Password reset. Sign in with your new password.")
      } else {
        setForgotError(res.error || "Failed to reset password")
      }
    } catch (err) {
      setForgotError((err as Error).message || "Something went wrong")
    } finally {
      setForgotLoading(false)
    }
  }

  // Redirect-based Google OAuth — no popup, works reliably with COOP.
  const handleGoogleLogin = () => {
    const redirectUri = `${window.location.origin}/login`
    window.location.href = buildGoogleAuthUrl(redirectUri)
  }

  // Handle the redirect back from Google: ?code=... in URL → exchange via backend.
  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const code = url.searchParams.get("code")
    const error = url.searchParams.get("error")

    if (error) {
      console.error("[GoogleLogin] Google returned error:", error)
      url.searchParams.delete("error")
      window.history.replaceState({}, "", url.pathname + url.search)
      return
    }

    if (!code) return

    console.log("[GoogleLogin] code detected in URL, exchanging…")
    const redirectUri = `${window.location.origin}/login`
    setGoogleLoading(true)
    clearError()

    // Strip the code from the URL immediately so a refresh never re-tries it.
    url.searchParams.delete("code")
    url.searchParams.delete("scope")
    url.searchParams.delete("authuser")
    url.searchParams.delete("prompt")
    window.history.replaceState({}, "", url.pathname + url.search)

    googleLogin({ code, redirectUri })
      .then((success) => {
        console.log("[GoogleLogin] backend returned:", success)
        if (success) {
          // Hard navigation — bypasses any client-router state issues.
          window.location.href = "/dashboard"
        } else {
          setGoogleLoading(false)
        }
      })
      .catch((err) => {
        console.error("[GoogleLogin] exchange failed:", err)
        setGoogleLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async () => {
    if (tab === "signup" && password !== confirmPassword) return
    clearError()

    if (tab === "signup") {
      const success = await signup(email, password, name || undefined)
      if (success) {
        // Show OTP verification screen
        setOtpEmail(email)
        setShowOtp(true)
        setOtpError("")
        setOtpSuccess("A verification code has been sent to your email.")
      }
    } else {
      const success = await login(email, password)
      if (success) {
        router.push("/dashboard")
      } else {
        // Check if error is about unverified email
        const currentError = useAuthStore.getState().error
        if (currentError?.includes("not verified")) {
          setOtpEmail(email)
          setShowOtp(true)
          setOtpError("")
          setOtpSuccess("Your email is not verified. A new OTP has been sent.")
          clearError()
        }
      }
    }
  }

  const handleVerifyOtp = async () => {
    setOtpLoading(true)
    setOtpError("")
    const res = await authApi.verifyOtp(otpEmail, otp)
    if (res.success) {
      setOtpSuccess("Email verified! Logging you in...")
      // Auto-login after verification
      setTimeout(async () => {
        const loginSuccess = await login(otpEmail, password)
        if (loginSuccess) router.push("/dashboard")
        setOtpLoading(false)
      }, 1000)
    } else {
      setOtpError(res.error || "Invalid OTP")
      setOtpLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setOtpLoading(true)
    setOtpError("")
    const res = await authApi.resendOtp(otpEmail)
    if (res.success) {
      setOtpSuccess("New OTP sent to your email.")
    } else {
      setOtpError(res.error || "Failed to resend OTP")
    }
    setOtpLoading(false)
  }

  return (
    <div className="relative flex min-h-screen">
      {/* Background effects */}
      <div className="grid-pattern absolute inset-0" />
      <div className="absolute left-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/3 h-[400px] w-[400px] rounded-full bg-chart-4/5 blur-[120px]" />

      {/* Left — Branding panel (desktop only) */}
      <div className="relative hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden border-r border-border/50 bg-card/30 p-10 lg:flex xl:w-[540px]">
        <div>
          <Link href="/" className="flex items-center">
            <Logo className="h-8 w-auto md:h-9" />
          </Link>
        </div>

        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Trade smarter with{" "}
            <span className="gradient-text">AI-powered</span> algorithms.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Deploy pre-built strategies, track real-time performance, and manage
            your portfolio across multiple exchanges — all in one place.
          </p>

          {/* Stats */}
          <div className="mt-10 grid grid-cols-3 gap-6">
            {[
              { value: "10K+", label: "Traders" },
              { value: "200+", label: "Strategies" },
              { value: "99.9%", label: "Uptime" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} AlgoPulse. All rights reserved.
        </p>
      </div>

      {/* Right — Auth form */}
      <div className="relative flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            {/* Mobile logo */}
            <Link href="/" className="flex items-center lg:hidden">
              <Logo className="h-7 w-auto" />
            </Link>
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          {/* OTP Verification Screen */}
          {forgotStep !== null ? (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="w-full max-w-[400px]"
            >
              <motion.div variants={fadeUp} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <h1 className="mt-6 text-2xl font-bold tracking-tight">
                  {forgotStep === "email" && "Reset your password"}
                  {forgotStep === "otp" && "Enter the code"}
                  {forgotStep === "reset" && "Set new password"}
                  {forgotStep === "done" && "All set"}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {forgotStep === "email" && "Enter your registered email and we'll send you a 6-digit code."}
                  {forgotStep === "otp" && (
                    <>We sent a code to <span className="font-medium text-foreground">{forgotEmail}</span></>
                  )}
                  {forgotStep === "reset" && "Choose a new password — your other sessions will be signed out."}
                  {forgotStep === "done" && "Your password has been reset. Sign in with the new one."}
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 space-y-4">
                {forgotStep === "email" && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Email address</Label>
                    <div className="relative mt-1.5">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="aayush@gmail.com"
                        className="h-12 rounded-xl bg-muted/30 pl-10 text-sm"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleForgotRequest()}
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {forgotStep === "otp" && (
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Verification Code</Label>
                    <Input
                      placeholder="Enter 6-digit code"
                      className="mt-1.5 h-12 rounded-xl bg-muted/30 text-center text-lg font-bold tracking-[0.5em]"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && forgotOtp.length === 6 && handleForgotVerifyOtp()}
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                )}

                {forgotStep === "reset" && (
                  <>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">New password</Label>
                      <div className="relative mt-1.5">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showForgotPassword ? "text" : "password"}
                          placeholder="At least 8 characters"
                          className="h-12 rounded-xl bg-muted/30 pl-10 pr-10 text-sm"
                          value={forgotNewPassword}
                          onChange={(e) => setForgotNewPassword(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowForgotPassword(!showForgotPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showForgotPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Confirm password</Label>
                      <div className="relative mt-1.5">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type={showForgotPassword ? "text" : "password"}
                          placeholder="Re-enter new password"
                          className="h-12 rounded-xl bg-muted/30 pl-10 text-sm"
                          value={forgotConfirmPassword}
                          onChange={(e) => setForgotConfirmPassword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleForgotResetPassword()}
                        />
                      </div>
                    </div>
                  </>
                )}
              </motion.div>

              {forgotInfo && (
                <motion.p variants={fadeUp} className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                  {forgotInfo}
                </motion.p>
              )}
              {forgotError && (
                <motion.p variants={fadeUp} className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                  {forgotError}
                </motion.p>
              )}

              <motion.div variants={fadeUp} className="mt-6 space-y-2">
                {forgotStep === "email" && (
                  <Button
                    className="h-12 w-full rounded-xl text-sm font-semibold"
                    disabled={forgotLoading || !forgotEmail}
                    onClick={handleForgotRequest}
                  >
                    {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
                  </Button>
                )}
                {forgotStep === "otp" && (
                  <>
                    <Button
                      className="h-12 w-full rounded-xl text-sm font-semibold"
                      disabled={forgotLoading || forgotOtp.length !== 6}
                      onClick={handleForgotVerifyOtp}
                    >
                      {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-10 w-full rounded-xl text-xs"
                      onClick={handleForgotRequest}
                      disabled={forgotLoading}
                    >
                      Resend code
                    </Button>
                  </>
                )}
                {forgotStep === "reset" && (
                  <Button
                    className="h-12 w-full rounded-xl text-sm font-semibold"
                    disabled={forgotLoading || !forgotNewPassword || forgotNewPassword !== forgotConfirmPassword}
                    onClick={handleForgotResetPassword}
                  >
                    {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
                  </Button>
                )}
                {forgotStep === "done" && (
                  <Button
                    className="h-12 w-full rounded-xl text-sm font-semibold"
                    onClick={resetForgotFlow}
                  >
                    Back to sign in
                  </Button>
                )}

                {forgotStep !== "done" && (
                  <Button
                    variant="ghost"
                    className="h-10 w-full rounded-xl text-xs text-muted-foreground"
                    onClick={resetForgotFlow}
                    disabled={forgotLoading}
                  >
                    Cancel
                  </Button>
                )}
              </motion.div>
            </motion.div>
          ) : showOtp ? (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="w-full max-w-[400px]"
            >
              <motion.div variants={fadeUp} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <h1 className="mt-6 text-2xl font-bold tracking-tight">Verify your email</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{otpEmail}</span>
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Verification Code</Label>
                  <Input
                    placeholder="Enter 6-digit code"
                    className="mt-1.5 h-12 rounded-xl bg-muted/30 text-center text-lg font-bold tracking-[0.5em]"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && handleVerifyOtp()}
                    maxLength={6}
                  />
                </div>
              </motion.div>

              {otpSuccess && (
                <motion.div variants={fadeUp} className="mt-4 rounded-xl border border-profit/20 bg-profit/5 p-3 text-center text-xs text-profit">
                  {otpSuccess}
                </motion.div>
              )}

              {otpError && (
                <motion.div variants={fadeUp} className="mt-4 rounded-xl border border-loss/20 bg-loss/5 p-3 text-center text-xs text-loss">
                  {otpError}
                </motion.div>
              )}

              <motion.div variants={fadeUp} className="mt-6">
                <Button
                  className="h-11 w-full rounded-xl text-sm font-semibold"
                  onClick={handleVerifyOtp}
                  disabled={otpLoading || otp.length !== 6}
                >
                  {otpLoading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    "Verify Email"
                  )}
                </Button>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-4 flex items-center justify-center gap-1 text-sm">
                <span className="text-muted-foreground">Didn&apos;t receive the code?</span>
                <button onClick={handleResendOtp} disabled={otpLoading} className="font-semibold text-primary hover:underline">
                  Resend
                </button>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-2 text-center">
                <button
                  onClick={() => { setShowOtp(false); setOtp(""); setOtpError(""); setOtpSuccess("") }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Back to {tab === "signup" ? "Sign Up" : "Log In"}
                </button>
              </motion.div>
            </motion.div>
          ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="w-full max-w-[400px]"
          >
            {/* Heading */}
            <motion.div variants={fadeUp} className="text-center">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {tab === "login" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {tab === "login"
                  ? "Enter your credentials to access your dashboard"
                  : "Start trading with AI-powered strategies"}
              </p>
            </motion.div>

            {/* Tab switcher */}
            <motion.div
              variants={fadeUp}
              className="mt-8 flex rounded-xl bg-muted/50 p-1"
            >
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                    tab === t
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === t && (
                    <motion.div
                      layoutId="authTab"
                      className="absolute inset-0 rounded-lg bg-background shadow-sm"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10 capitalize">{t === "login" ? "Log In" : "Sign Up"}</span>
                </button>
              ))}
            </motion.div>

            {/* Google button */}
            <motion.div variants={fadeUp} className="mt-6">
              <Button
                variant="outline"
                className="h-11 w-full gap-3 rounded-xl text-sm font-medium"
                onClick={() => handleGoogleLogin()}
                disabled={isLoading || googleLoading}
              >
                {googleLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                ) : (
                  <GoogleIcon className="h-5 w-5" />
                )}
                Continue with Google
              </Button>
            </motion.div>

            {/* Divider */}
            <motion.div
              variants={fadeUp}
              className="my-6 flex items-center gap-3"
            >
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </motion.div>

            {/* Form fields */}
            <motion.div variants={fadeUp} className="space-y-4">
              {tab === "signup" && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    Full Name
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Aayush Chaudhary"
                      className="h-11 rounded-xl bg-muted/30 pl-10 text-sm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  {tab === "login" ? "User ID or Email" : "Email Address"}
                </Label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={
                      tab === "login"
                        ? "Enter your user ID or email"
                        : "aayush@gmail.com"
                    }
                    className="h-11 rounded-xl bg-muted/30 pl-10 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Password
                  </Label>
                  {tab === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        resetForgotFlow()
                        setForgotEmail(email)
                        setForgotStep("email")
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="h-11 rounded-xl bg-muted/30 pl-10 pr-10 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && tab === "login" && handleSubmit()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {tab === "signup" && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    Confirm Password
                  </Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your password"
                      className="h-11 rounded-xl bg-muted/30 pl-10 pr-10 text-sm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Error */}
            {error && (
              <motion.div variants={fadeUp} className="mt-4 rounded-xl border border-loss/20 bg-loss/5 p-3 text-center text-xs text-loss">
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <motion.div variants={fadeUp} className="mt-6">
              <Button
                className="h-11 w-full rounded-xl text-sm font-semibold"
                onClick={handleSubmit}
                disabled={isLoading || !email || !password || (tab === "signup" && password !== confirmPassword)}
              >
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : (
                  <>
                    {tab === "login" ? "Log In" : "Create Account"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>

            {/* Terms (signup only) */}
            {tab === "signup" && (
              <motion.p
                variants={fadeUp}
                className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground"
              >
                By creating an account, you agree to our{" "}
                <Link
                  href="/terms"
                  className="text-foreground underline underline-offset-2 hover:text-primary"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-foreground underline underline-offset-2 hover:text-primary"
                >
                  Privacy Policy
                </Link>
                .
              </motion.p>
            )}

            {/* Switch tab prompt */}
            <motion.p
              variants={fadeUp}
              className="mt-6 text-center text-sm text-muted-foreground"
            >
              {tab === "login"
                ? "Don\u2019t have an account? "
                : "Already have an account? "}
              <button
                onClick={() => setTab(tab === "login" ? "signup" : "login")}
                className="font-semibold text-primary hover:underline"
              >
                {tab === "login" ? "Sign Up" : "Log In"}
              </button>
            </motion.p>
          </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
