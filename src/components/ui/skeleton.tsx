import { cn } from "@/lib/utils"

/**
 * Skeleton block — a content-shaped placeholder shown during loading.
 * Pulses subtly so the user knows the page is *loading*, not *broken*.
 *
 * Use directly for one-off rectangles, or compose into page-shaped
 * skeletons (see src/components/skeletons/*).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/60", className)}
      {...props}
    />
  )
}

export { Skeleton }
