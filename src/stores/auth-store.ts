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
  googleLogin: (params: { credential?: string; code?: string }) => Promise<boolean>
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
      storage: {
        getItem: (name: string) => {
          const value = typeof window !== "undefined" ? sessionStorage.getItem(name) : null;
          return value ? JSON.parse(value) : null;
        },
        setItem: (name: string, value: StorageValue<unknown>) => {
          if (typeof window !== "undefined") sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name: string) => {
          if (typeof window !== "undefined") sessionStorage.removeItem(name);
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
