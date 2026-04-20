import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const SITE_URL = "https://algopulse.in"
const SITE_NAME = "AlgoPulse"
const SITE_TAGLINE = "Free Algorithmic Crypto Trading for Delta India, CoinDCX, Pi42 & Bybit"
const SITE_DESCRIPTION =
  "Deploy pre-built algo trading strategies on BTC, ETH, SOL and 20+ coins, free. Connect Delta Exchange India, CoinDCX, Pi42 or Bybit, pick a strategy, and let AlgoPulse trade 24/7. Backtest on 3 years of real market data before going live. No code required."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
    "algo trading India",
    "crypto trading bot",
    "algorithmic crypto trading",
    "free crypto trading platform",
    "Delta Exchange India trading bot",
    "CoinDCX trading bot",
    "Pi42 trading bot",
    "Bybit trading bot",
    "Indian crypto algo platform",
    "automated crypto trading",
    "BTC algo strategy",
    "ETH algo strategy",
    "backtest crypto strategy",
    "no-code crypto bot",
    "crypto futures trading India",
    "Meri Strategy",
    "Supertrend crypto strategy",
    "Gann Matrix Momentum",
    "Support Resistance Breakout",
    "24x7 crypto trading automation",
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: "en_IN",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME}, free algo trading for Indian crypto traders`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "finance",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/Fabicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/Fabicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/Fabicon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-right" richColors closeButton expand theme="system" />
        </ThemeProvider>
      </body>
    </html>
  )
}
