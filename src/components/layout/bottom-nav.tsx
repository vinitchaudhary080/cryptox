"use client";

/**
 * Native app-style bottom navigation — mobile only (md:hidden).
 *
 * Five primary destinations fixed at the bottom of the viewport. Uses
 * safe-area-inset-bottom so the bar sits above the iOS home indicator.
 * Tapping the already-active tab scrolls the main scroll container to
 * the top — matches iOS/Android patterns.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Plug,
  Rocket,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Strategies", href: "/strategies", icon: Zap },
  { label: "Brokers", href: "/brokers", icon: Plug },
  { label: "Deployed", href: "/deployed", icon: Rocket },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleTap = (href: string, isActive: boolean) => {
    if (isActive) {
      // Re-tapping the active tab: scroll the main scroll container to top
      const main = document.querySelector("main");
      if (main) main.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push(href);
    }
  };

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 md:hidden",
        "border-t border-border/50 bg-background/85 backdrop-blur-xl",
      )}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="flex flex-1 justify-center">
              <Link
                href={tab.href}
                prefetch
                onClick={(e) => {
                  if (isActive) {
                    e.preventDefault();
                    handleTap(tab.href, true);
                  }
                }}
                className={cn(
                  "group flex w-full flex-col items-center justify-center gap-0.5 px-1 py-2 transition-all active:scale-[0.92]",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200",
                    isActive && "bg-primary/12",
                  )}
                >
                  <tab.icon
                    className={cn(
                      "h-[19px] w-[19px] transition-transform",
                      isActive && "scale-105",
                    )}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none tracking-tight",
                    isActive && "font-semibold",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
