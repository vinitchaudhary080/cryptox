import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Loading-state skeleton for /dashboard — mirrors the real layout
 * (stat cards row, chart, allocation pie, recent trades).
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Greeting / header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/50 bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <Skeleton className="mt-3 h-6 w-24" />
              <Skeleton className="mt-2 h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + side card */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50 bg-card/80 lg:col-span-2">
          <CardContent className="p-4">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="p-4">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="mx-auto h-40 w-40 rounded-full" />
          </CardContent>
        </Card>
      </div>

      {/* Recent trades */}
      <Card className="border-border/50 bg-card/80">
        <CardContent className="p-4">
          <Skeleton className="mb-4 h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border/30 py-3 last:border-0">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2 w-16" />
                </div>
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
