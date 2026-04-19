import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy — AlgoPulse",
  description:
    "How AlgoPulse handles your personal information, API keys, and trading data. Transparent privacy practices for a free algo trading platform.",
  alternates: { canonical: "https://algopulse.in/privacy" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
