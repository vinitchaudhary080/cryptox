import { create } from "zustand"
import { toast } from "sonner"
import { notificationApi } from "@/lib/api"

function toastForType(type: string, title: string, message: string, onClick?: () => void) {
  const opts = { description: message, duration: 6000, onClick } as const
  switch (type) {
    case "trade_open":
    case "strategy_deploy":
    case "strategy_resume":
      return toast.success(title, opts)
    case "trade_close":
      return toast.success(title, opts)
    case "trade_error":
    case "strategy_stop":
      return toast.error(title, opts)
    case "strategy_pause":
      return toast.warning(title, opts)
    case "admin_broadcast":
      return toast.info(title, opts)
    default:
      return toast(title, opts)
  }
}

type Notification = {
  id: string
  type: string
  title: string
  message: string
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

type NotificationState = {
  notifications: Notification[]
  unreadCount: number
  isOpen: boolean

  setOpen: (open: boolean) => void
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  addNotification: (n: Notification) => void
}

// Notification sound — simple beep using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = "sine"
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
    // Second tone for pleasant "ding"
    setTimeout(() => {
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1320
      osc2.type = "sine"
      gain2.gain.setValueAtTime(0.1, ctx.currentTime)
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc2.start(ctx.currentTime)
      osc2.stop(ctx.currentTime + 0.2)
    }, 100)
  } catch {
    // Audio not supported
  }
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,

  setOpen: (open) => set({ isOpen: open }),

  fetchNotifications: async () => {
    const res = await notificationApi.list(30)
    if (res.success && res.data) {
      const d = res.data as { notifications: Notification[]; unreadCount: number }
      set({ notifications: d.notifications, unreadCount: d.unreadCount })
    }
  },

  markAsRead: async (id) => {
    await notificationApi.markRead(id)
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },

  markAllAsRead: async () => {
    await notificationApi.markAllRead()
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  addNotification: (n) => {
    // Deduplicate — skip if already exists
    const exists = get().notifications.some((existing) => existing.id === n.id)
    if (exists) return

    playNotificationSound()
    set((state) => ({
      notifications: [n, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }))

    // Live on-screen toast
    const deepLink =
      typeof n.data?.url === "string"
        ? (n.data.url as string)
        : typeof n.data?.deployedId === "string"
          ? `/deployed/${n.data.deployedId}`
          : undefined
    toastForType(n.type, n.title, n.message, deepLink ? () => {
      if (typeof window !== "undefined") window.location.href = deepLink
    } : undefined)
  },
}))
