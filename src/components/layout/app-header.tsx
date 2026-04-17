"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  Search,
  Sun,
  Moon,
  LayoutDashboard,
  Zap,
  BarChart3,
  Settings,
  Menu,
  X,
  Plug,
  Rocket,
  FlaskConical,
  ChevronRight,
  LogOut,
} from "lucide-react"
import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { NotificationPanel } from "./notification-panel"
import { SendNotificationDialog } from "@/components/admin/send-notification-dialog"
import { notificationApi } from "@/lib/api"
import { Megaphone } from "lucide-react"
import { Logo } from "@/components/ui/logo"

const showBacktest = process.env.NEXT_PUBLIC_SHOW_BACKTEST !== "false"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Portfolio overview" },
  { label: "Strategies", href: "/strategies", icon: Zap, description: "Browse & deploy" },
  { label: "Brokers", href: "/brokers", icon: Plug, description: "Manage exchanges" },
  { label: "Deployed", href: "/deployed", icon: Rocket, description: "Active strategies" },
  ...(showBacktest ? [{ label: "Backtest", href: "/backtest", icon: FlaskConical, description: "Test strategies" }] : []),
  { label: "Reports", href: "/reports", icon: BarChart3, description: "Analytics & PnL" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Account & alerts" },
]

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAuthStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      return
    }
    notificationApi
      .adminCheck()
      .then((r) => {
        const res = r as { success?: boolean; data?: { isAdmin?: boolean } }
        setIsAdmin(!!res?.data?.isAdmin)
      })
      .catch(() => setIsAdmin(false))
  }, [user])

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "U"

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileMenuOpen])

  // Close on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <>
      <header className="relative z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center">
              <Logo className="h-7 w-auto md:h-8" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right: Search + Actions */}
          <div className="flex items-center gap-2">
            <div className="relative hidden lg:block">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search strategies, assets..."
                className="h-9 w-[240px] bg-muted/50 pl-8 text-sm"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="hidden h-8 w-8 md:flex"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            {isAdmin && (
              <SendNotificationDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Send notification (admin)"
                  >
                    <Megaphone className="h-4 w-4" />
                  </Button>
                }
              />
            )}

            <NotificationPanel />

            <DropdownMenu>
              <DropdownMenuTrigger className="hidden h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors hover:bg-muted md:flex">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user?.name || user?.email || "User"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push("/settings")}>Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/billing")}>Billing</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <X className="h-4.5 w-4.5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="open"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Menu className="h-4.5 w-4.5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile menu — full overlay, above everything */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Panel — slides down from top */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed left-0 right-0 top-14 z-[70] mx-3 overflow-hidden rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl md:hidden"
            >
              {/* Search */}
              <div className="p-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    className="h-10 rounded-xl bg-muted/50 pl-9 text-sm"
                  />
                </div>
              </div>

              {/* Nav items */}
              <nav className="px-2 pb-2">
                {navItems.map((item, i) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3.5 rounded-xl px-3.5 py-3 transition-all active:scale-[0.98]",
                          isActive
                            ? "bg-primary/10"
                            : "hover:bg-accent/60"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          <item.icon className="h-[18px] w-[18px]" />
                        </div>
                        <div className="flex-1">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              isActive ? "text-primary" : "text-foreground"
                            )}
                          >
                            {item.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4",
                            isActive ? "text-primary" : "text-muted-foreground/40"
                          )}
                        />
                      </Link>
                    </motion.div>
                  )
                })}
              </nav>

              <div className="mx-4 my-1">
                <Separator />
              </div>

              {/* Bottom section: user + theme */}
              <div className="flex items-center justify-between p-4 pt-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{user?.name || user?.email || "User"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {user?.email || ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl text-muted-foreground"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
