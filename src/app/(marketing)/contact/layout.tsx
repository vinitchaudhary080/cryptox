import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Contact AlgoPulse, Support for Indian Crypto Algo Traders",
  description:
    "Get in touch with the AlgoPulse team. Questions about deploying strategies, connecting Delta India / CoinDCX / Pi42 / Bybit, or anything else, we're here to help.",
  alternates: { canonical: "https://algopulse.in/contact" },
  openGraph: {
    title: "Contact AlgoPulse",
    description: "Reach out for support, partnerships, or product feedback.",
    url: "https://algopulse.in/contact",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function ContactLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
