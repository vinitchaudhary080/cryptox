import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About AlgoPulse — Free Algo Trading Platform for Indian Crypto Traders",
  description:
    "Learn why AlgoPulse was built: to give Indian retail crypto traders access to institutional-grade algo trading on Delta India, CoinDCX, Pi42, and Bybit — completely free.",
  alternates: { canonical: "https://algopulse.in/about" },
  openGraph: {
    title: "About AlgoPulse",
    description: "Institutional-grade algo trading, free for Indian crypto traders.",
    url: "https://algopulse.in/about",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function AboutLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
