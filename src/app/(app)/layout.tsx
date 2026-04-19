import type { ReactNode } from "react"
import { AppHeader } from "@/components/layout/app-header"
import { BottomNav } from "@/components/layout/bottom-nav"
import { AuthGuard } from "@/components/auth/auth-guard"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden">
        <AppHeader />
        {/* Extra bottom padding on mobile so content never sits under the fixed
            BottomNav (64px nav + iOS safe-area).  Desktop: no bottom nav, so no
            extra padding — keeps the existing layout unchanged on md+. */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6 lg:p-8 lg:pb-8">
          {children}
        </main>
        <BottomNav />
      </div>
    </AuthGuard>
  )
}
