"use client"

import type { ReactNode } from "react"
import { GoogleOAuthProvider } from "@react-oauth/google"

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  )
}
