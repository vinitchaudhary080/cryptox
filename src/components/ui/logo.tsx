import { cn } from "@/lib/utils";

/**
 * AlgoPulse wordmark.
 *
 * Swaps between /lightlogo.svg (light theme) and /logo.svg (dark theme)
 * using Tailwind's `dark:` variant, which is driven by next-themes toggling
 * the `.dark` class on <html>. Pure CSS — no useEffect flicker on hydration.
 */
export function Logo({ className, alt = "AlgoPulse" }: { className?: string; alt?: string }) {
  return (
    <>
      {/* Light theme logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/lightlogo.svg"
        alt={alt}
        className={cn(className, "block dark:hidden")}
      />
      {/* Dark theme logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt={alt}
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
