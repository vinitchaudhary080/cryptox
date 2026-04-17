"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell,
  Check,
  CheckCheck,
  TrendingUp,
  TrendingDown,
  Rocket,
  Pause,
  Square,
  Play,
  AlertTriangle,
  Megaphone,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useNotificationStore } from "@/stores/notification-store"
import { useAuthStore } from "@/stores/auth-store"
import { cn } from "@/lib/utils"

type NotificationLike = {
  id: string
  type: string
  title: string
  message: string
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

const STRATEGY_TYPES = new Set([
  "trade_open",
  "trade_close",
  "trade_error",
  "strategy_deploy",
  "strategy_pause",
  "strategy_stop",
  "strategy_resume",
])

export function deepLinkForNotification(n: NotificationLike): string | null {
  if (!STRATEGY_TYPES.has(n.type)) return null
  const deployedId =
    (typeof n.data?.deployedId === "string" && n.data.deployedId) ||
    (typeof n.data?.deployedStrategyId === "string" && n.data.deployedStrategyId)
  return deployedId ? `/deployed/${deployedId}` : "/deployed"
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  trade_open: { icon: TrendingUp, color: "text-profit", bg: "bg-profit/10" },
  trade_close: { icon: TrendingDown, color: "text-primary", bg: "bg-primary/10" },
  trade_error: { icon: AlertTriangle, color: "text-loss", bg: "bg-loss/10" },
  strategy_deploy: { icon: Rocket, color: "text-primary", bg: "bg-primary/10" },
  strategy_pause: { icon: Pause, color: "text-warning", bg: "bg-warning/10" },
  strategy_stop: { icon: Square, color: "text-loss", bg: "bg-loss/10" },
  strategy_resume: { icon: Play, color: "text-profit", bg: "bg-profit/10" },
  admin_broadcast: { icon: Megaphone, color: "text-primary", bg: "bg-primary/10" },
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function NotificationItem({
  notification,
  onRead,
  onClick,
}: {
  notification: NotificationLike
  onRead: (id: string) => void
  onClick: () => void
}) {
  const config = TYPE_CONFIG[notification.type] ?? { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" }
  const Icon = config.icon

  const pnl = notification.data?.pnl as number | undefined

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
        !notification.read && "bg-primary/[0.03]"
      )}
      onClick={() => {
        if (!notification.read) onRead(notification.id)
        onClick()
      }}
    >
      {/* Unread dot */}
      {!notification.read && (
        <div className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />
      )}

      {/* Icon */}
      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-medium leading-tight", !notification.read && "text-foreground", notification.read && "text-muted-foreground")}>
            {notification.title}
          </p>
          {pnl !== undefined && (
            <span className={cn(
              "shrink-0 text-xs font-bold",
              pnl >= 0 ? "text-profit" : "text-loss"
            )}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          {timeAgo(notification.createdAt)}
        </p>
      </div>
    </div>
  )
}

export function NotificationPanel() {
  const { notifications, unreadCount, isOpen, setOpen, fetchNotifications, markAsRead, markAllAsRead } = useNotificationStore()
  const [viewing, setViewing] = useState<NotificationLike | null>(null)
  const { isAuthenticated, accessToken } = useAuthStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Fetch on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications()
    }
  }, [isAuthenticated, fetchNotifications])

  // Connect to Socket.io for real-time notifications
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const WS_URL = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:4000"
    const ioUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket`

    let ws: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      try {
        ws = new WebSocket(ioUrl.replace("http://", "ws://").replace("https://", "wss://"))

        ws.onopen = () => {
          // Socket.IO handshake with auth token
          ws?.send(`40{"token":"${accessToken}"}`)
        }

        ws.onmessage = (event) => {
          const msg = event.data as string

          if (msg.startsWith("42")) {
            try {
              const parsed = JSON.parse(msg.slice(2))
              if (parsed[0] === "notification:new" && parsed[1]) {
                useNotificationStore.getState().addNotification(parsed[1])
              }
            } catch { /* ignore */ }
          }
          if (msg === "2") ws?.send("3")
        }

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 5000)
        }
        ws.onerror = () => ws?.close()
      } catch { /* ignore */ }
    }

    connect()
    return () => { clearTimeout(reconnectTimeout); ws?.close() }
  }, [isAuthenticated, accessToken])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [isOpen, setOpen])

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={() => {
          setOpen(!isOpen)
          if (!isOpen) fetchNotifications()
        }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 top-14 z-50 mx-2 overflow-hidden rounded-xl border border-border/50 bg-background shadow-2xl sm:absolute sm:inset-x-auto sm:top-10 sm:right-0 sm:mx-0 sm:w-[380px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                    onClick={markAllAsRead}
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Notification List */}
            <div className="max-h-[420px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="mb-2 h-8 w-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground/60">
                    You&apos;ll see trade and strategy alerts here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {notifications.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onRead={markAsRead}
                      onClick={() => {
                        const link = deepLinkForNotification(n)
                        if (link) {
                          setOpen(false)
                          router.push(link)
                        } else {
                          setViewing(n)
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal view for informational / admin notifications */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-[480px]">
          {viewing && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {(() => {
                    const cfg = TYPE_CONFIG[viewing.type] ?? { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" }
                    const Icon = cfg.icon
                    return (
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", cfg.bg)}>
                        <Icon className={cn("h-5 w-5", cfg.color)} />
                      </div>
                    )
                  })()}
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-base">{viewing.title}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {new Date(viewing.createdAt).toLocaleString()}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-2 space-y-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {viewing.message}
                </p>

                {typeof viewing.data?.url === "string" && viewing.data.url.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const url = viewing.data!.url as string
                      setViewing(null)
                      setOpen(false)
                      if (url.startsWith("http")) {
                        window.open(url, "_blank", "noopener,noreferrer")
                      } else {
                        router.push(url)
                      }
                    }}
                  >
                    Open link
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
