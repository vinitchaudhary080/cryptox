import type { ReactNode } from "react"
import { AppHeader } from "@/components/layout/app-header"
import { BottomNav } from "@/components/layout/bottom-nav"
import { AuthGuard } from "@/components/auth/auth-guard"
import { PushAutoResubscribe } from "@/components/layout/push-auto-resubscribe"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <PushAutoResubscribe />
      <div className="flex h-screen flex-col overflow-hidden">
        <AppHeader />
        {/* Extra bottom padding on mobile so content never sits under the fixed
            BottomNav. Padding scales with iOS safe-area inset (home indicator)
            so the last row stays fully visible on iPhones too. Desktop: no
            bottom nav, layout unchanged on md+. */}
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6 lg:p-8 lg:pb-8">
          {children}
        </main>
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
