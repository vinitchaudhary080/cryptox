"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Search,
  Sun,
  Moon,
  LayoutDashboard,
  Zap,
  BarChart3,
  Settings,
  Plug,
  Rocket,
  FlaskConical,
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

            {/* Mobile: theme toggle + Settings shortcut in place of the old menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 md:hidden"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Link
              href="/settings"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors md:hidden",
                pathname.startsWith("/settings")
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent",
              )}
              aria-label="Settings"
            >
              <Settings className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>
      </header>

    </>
  )
}
