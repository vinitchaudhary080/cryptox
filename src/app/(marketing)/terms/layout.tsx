import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms of Service — AlgoPulse",
  description:
    "Terms and conditions for using AlgoPulse, a free algorithmic crypto trading platform for Delta Exchange India, CoinDCX, Pi42, and Bybit.",
  alternates: { canonical: "https://algopulse.in/terms" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function TermsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
