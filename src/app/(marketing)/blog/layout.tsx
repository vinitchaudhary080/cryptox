import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Blog, Guides for Indian Crypto Algo Traders",
  description:
    "Plain-English guides to algo trading on AlgoPulse: connecting Delta India / CoinDCX / Pi42 / Bybit, deploying strategies, reading backtest reports, and avoiding common mistakes.",
  alternates: { canonical: "https://algopulse.in/blog" },
  openGraph: {
    title: "AlgoPulse Blog, Guides for Indian Crypto Algo Traders",
    description:
      "How to connect a broker, deploy strategies, read backtest reports, and trade crypto algorithmically, free.",
    url: "https://algopulse.in/blog",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function BlogLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
