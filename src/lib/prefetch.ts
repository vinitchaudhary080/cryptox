/**
 * Route-data prefetcher — fires the API calls a destination page needs
 * before the user actually navigates there.
 *
 * Hooked into nav `onMouseEnter` (desktop) and `onTouchStart` (mobile).
 * Hover-to-click latency is typically 200-500ms; touch-down-to-up is
 * 100-200ms. That's enough head-start that by the time React mounts the
 * destination page, TanStack Query already has the data cached and renders
 * instantly — no loader, no flash of "Loading…".
 *
 * `prefetchQuery` is idempotent: if the cache is already fresh (within
 * staleTime), it's a no-op. So we can fire on every hover without worrying
 * about wasted bandwidth.
 */
import type { QueryClient } from "@tanstack/react-query"
import { strategyApi, deployedApi, brokerApi, portfolioApi, backtestApi, historicalApi } from "./api"
import { queryKeys } from "./queries"

type Prefetcher = (qc: QueryClient) => void

// Map href → list of prefetch fns. Each page declares what it needs.
const ROUTE_PREFETCHERS: Record<string, Prefetcher[]> = {
  "/dashboard": [
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.brokers(), queryFn: () => brokerApi.list() }),
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.portfolioStats(), queryFn: () => portfolioApi.stats() }),
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.portfolioTrades(10), queryFn: () => portfolioApi.trades(10) }),
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.portfolioReport(), queryFn: () => portfolioApi.report() }),
  ],
  "/strategies": [
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.strategies(), queryFn: () => strategyApi.list() }),
  ],
  "/deployed": [
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.deployed({ brokerId: "all", status: "all" }), queryFn: () => deployedApi.list({ brokerId: "all", status: "all" }) }),
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.brokers(), queryFn: () => brokerApi.list() }),
  ],
  "/brokers": [
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.brokers(), queryFn: () => brokerApi.list() }),
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.portfolioStats(), queryFn: () => portfolioApi.stats() }),
  ],
  "/reports": [
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.portfolioReport(), queryFn: () => portfolioApi.report() }),
  ],
  "/backtest": [
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.backtestRuns(1, 50), queryFn: () => backtestApi.listRuns(1, 50) }),
    (qc) => qc.prefetchQuery({ queryKey: queryKeys.historicalStatus(), queryFn: () => historicalApi.status() }),
  ],
}

export function prefetchRoute(href: string, qc: QueryClient): void {
  const fns = ROUTE_PREFETCHERS[href]
  if (!fns) return
  for (const fn of fns) fn(qc)
}
