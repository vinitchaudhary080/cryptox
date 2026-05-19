"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { persistQueryClient } from "@tanstack/react-query-persist-client"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import { useState, useEffect, type ReactNode } from "react"

// Bump this string whenever the cached data shape changes — old caches
// are silently discarded so users don't see stale fields after a deploy.
const CACHE_VERSION = "v1"

export function QueryProvider({ children }: { children: ReactNode }) {
  // useState ensures one client per browser session (not per render).
  // Defaults tuned for trading-app UX: data shown instantly from cache,
  // background-refetched on focus / reconnect / mount so it never goes
  // dangerously stale.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Must exceed the persister's maxAge so hydrated cache entries
            // aren't garbage-collected before they're shown.
            gcTime: 24 * 60 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  )

  // Set up localStorage persistence AFTER mount — avoids any SSR/hydration
  // mismatch since the QueryClientProvider tree is identical on server and
  // client; the persister just imperatively hydrates the cache once it's
  // available.
  useEffect(() => {
    if (typeof window === "undefined") return
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: `algopulse-query-cache-${CACHE_VERSION}`,
      throttleTime: 1000,
    })
    const [unsubscribe] = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: 24 * 60 * 60_000,
      buster: CACHE_VERSION,
    })
    return () => {
      unsubscribe()
    }
  }, [client])

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
