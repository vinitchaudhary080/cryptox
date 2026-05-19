/**
 * Centralized TanStack Query hooks + key registry.
 *
 * Why one file: query keys must match across pages for cache-sharing to work.
 * When the strategies page and the deploy dialog both ask for "strategies",
 * they should get the same cached payload — that's only possible if both use
 * the same key. So we keep the key factory + hooks here, never inline.
 *
 * Conventions:
 * - Keys are arrays. The first element is the namespace ("strategies",
 *   "deployed"). Additional elements scope the query (filters, ids).
 * - Hooks return TanStack Query's full result object — callers can use
 *   `data`, `isPending`, `isFetching`, `error`, `refetch` etc.
 * - For mutations (deploy, pause, stop), pages should call the API directly
 *   and then `invalidateQueries` so the cached list refetches. Don't try to
 *   write mutation hooks here — they're page-specific.
 */
import { useQuery } from "@tanstack/react-query"
import { strategyApi, deployedApi, brokerApi, userApi, marketApi, portfolioApi } from "./api"

export const queryKeys = {
  strategies: () => ["strategies"] as const,
  strategy: (id: string) => ["strategies", id] as const,
  deployed: (filters?: { brokerId?: string; status?: string }) =>
    ["deployed", filters ?? {}] as const,
  deployedItem: (id: string) => ["deployed", id] as const,
  deployedTrades: (id: string, status?: "OPEN" | "CLOSED") =>
    ["deployed", id, "trades", status ?? "all"] as const,
  brokers: () => ["brokers"] as const,
  userProfile: () => ["user", "profile"] as const,
  marketOverview: () => ["market", "overview"] as const,
  portfolioStats: () => ["portfolio", "stats"] as const,
  portfolioTrades: (limit: number) => ["portfolio", "trades", limit] as const,
  portfolioReport: () => ["portfolio", "report"] as const,
}

// Strategies list — most-frequently-hit endpoint. 30s staleTime means
// navigating away and back is instant; background refetch keeps it fresh.
export function useStrategies() {
  return useQuery({
    queryKey: queryKeys.strategies(),
    queryFn: () => strategyApi.list(),
  })
}

export function useStrategy(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.strategy(id ?? ""),
    queryFn: () => strategyApi.get(id!),
    enabled: !!id,
  })
}

export function useDeployed(filters?: { brokerId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.deployed(filters),
    queryFn: () => deployedApi.list(filters),
    // Deployed status changes more often (trades opening/closing). Shorter
    // staleTime so refetch-on-focus catches updates faster.
    staleTime: 10_000,
  })
}

export function useDeployedItem(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.deployedItem(id ?? ""),
    queryFn: () => deployedApi.get(id!),
    enabled: !!id,
    staleTime: 10_000,
  })
}

export function useBrokers() {
  return useQuery({
    queryKey: queryKeys.brokers(),
    queryFn: () => brokerApi.list(),
  })
}

export function useUserProfile() {
  return useQuery({
    queryKey: queryKeys.userProfile(),
    queryFn: () => userApi.getProfile(),
    // Profile rarely changes mid-session — cache aggressively.
    staleTime: 5 * 60_000,
  })
}

export function useMarketOverview() {
  return useQuery({
    queryKey: queryKeys.marketOverview(),
    queryFn: () => marketApi.overview(),
    // Public endpoint, refetched every 60s.
    staleTime: 60_000,
  })
}

// Portfolio — used on dashboard. Short staleTime because trade activity
// makes these numbers move; window-focus refetch keeps them honest.
export function usePortfolioStats() {
  return useQuery({
    queryKey: queryKeys.portfolioStats(),
    queryFn: () => portfolioApi.stats(),
    staleTime: 15_000,
  })
}

export function usePortfolioTrades(limit = 10) {
  return useQuery({
    queryKey: queryKeys.portfolioTrades(limit),
    queryFn: () => portfolioApi.trades(limit),
    staleTime: 15_000,
  })
}

export function usePortfolioReport() {
  return useQuery({
    queryKey: queryKeys.portfolioReport(),
    queryFn: () => portfolioApi.report(),
    staleTime: 15_000,
  })
}
