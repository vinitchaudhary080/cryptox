import type { Metadata } from "next"
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

export const metadata: Metadata = {
  title: "AlgoPulse — Algorithmic Crypto Trading Platform",
  description:
    "Deploy AI-powered trading strategies, model portfolios, and copy top traders. No code required.",
  manifest: "/manifest.json",
  themeColor: "#0a0a0a",
  icons: {
    icon: [{ url: "/Fabicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/Fabicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/Fabicon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: "AlgoPulse",
    statusBarStyle: "black-translucent",
  },
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
