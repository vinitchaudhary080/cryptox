import type { ReactNode } from "react"
import { AppHeader } from "@/components/layout/app-header"
import { AuthGuard } from "@/components/auth/auth-guard"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
