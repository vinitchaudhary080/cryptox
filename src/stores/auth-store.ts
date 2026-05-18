import { create } from "zustand"
import { persist, type StorageValue } from "zustand/middleware"
import { authApi } from "@/lib/api"

type User = {
  id: string
  email: string
  name: string | null
  plan: string
}

type AuthState = {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<boolean>
  signup: (email: string, password: string, name?: string) => Promise<boolean>
  googleLogin: (params: { credential?: string; code?: string; redirectUri?: string }) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.login(email, password)
          if (res.success && res.data) {
            const d = res.data as { user: User; accessToken: string; refreshToken: string }
            set({
              user: d.user,
              accessToken: d.accessToken,
              refreshToken: d.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            })
            return true
          }
          set({ isLoading: false, error: res.error || "Login failed" })
          return false
        } catch {
          set({ isLoading: false, error: "Network error" })
          return false
        }
      },

      signup: async (email, password, name) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.signup(email, password, name)
          if (res.success && res.data) {
            const d = res.data as { user: User; accessToken: string; refreshToken: string }
            set({
              user: d.user,
              accessToken: d.accessToken,
              refreshToken: d.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            })
            return true
          }
          set({ isLoading: false, error: res.error || "Signup failed" })
          return false
        } catch {
          set({ isLoading: false, error: "Network error" })
          return false
        }
      },

      googleLogin: async (params) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.google(params)
          if (res.success && res.data) {
            const d = res.data as { user: User; accessToken: string; refreshToken: string }
            set({
              user: d.user,
              accessToken: d.accessToken,
              refreshToken: d.refreshToken,
              isAuthenticated: true,
              isLoading: false,
            })
            return true
          }
          set({ isLoading: false, error: res.error || "Google login failed" })
          return false
        } catch {
          set({ isLoading: false, error: "Network error" })
          return false
        }
      },

      logout: async () => {
        const { refreshToken } = get()
        if (refreshToken) {
          await authApi.logout(refreshToken).catch(() => {})
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "cryptox-auth",
      // localStorage (not sessionStorage) so the session survives iOS PWA
      // restarts. iOS clears the in-memory session when the standalone PWA
      // is backgrounded long enough — sessionStorage went with it, forcing
      // a fresh login on every relaunch. localStorage is durable across
      // app restarts (and only clears on explicit logout, browser data
      // clear, or iOS storage eviction after ~weeks of non-use). Refresh
      // tokens still expire on the server side (JWT_REFRESH_EXPIRES_IN=7d).
      storage: {
        getItem: (name: string) => {
          const value = typeof window !== "undefined" ? localStorage.getItem(name) : null;
          return value ? JSON.parse(value) : null;
        },
        setItem: (name: string, value: StorageValue<unknown>) => {
          if (typeof window !== "undefined") localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name: string) => {
          if (typeof window !== "undefined") localStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
