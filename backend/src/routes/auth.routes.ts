import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";
import { isDisposableEmail, generateOTP, sendOTPEmail } from "../services/email.service.js";

const router = Router();
const prisma = new PrismaClient();
const googleClient = new OAuth2Client(
  env.google.clientId,
  env.google.clientSecret,
  "postmessage",
);

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── Signup — creates unverified account + sends OTP ──

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const data = signupSchema.parse(req.body);

    // Block disposable emails
    if (isDisposableEmail(data.email)) {
      res.status(400).json({ success: false, error: "Temporary/disposable email addresses are not allowed. Please use a real email." });
      return;
    }

    // Create account (unverified)
    const result = await authService.signup(data.email, data.password, data.name);

    // Generate OTP and save
    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.user.update({
      where: { email: data.email },
      data: { verifyCode: otp, verifyExpiry: expiry, emailVerified: false },
    });

    // Send OTP email
    const sent = await sendOTPEmail(data.email, otp);
    if (!sent) {
      console.error("[Auth] Failed to send OTP email to", data.email);
    }

    res.status(201).json({
      success: true,
      data: { ...result, emailVerified: false },
      message: "Account created. Please verify your email with the OTP sent to your inbox.",
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0].message });
      return;
    }
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// ── Verify OTP ──

router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ success: false, error: "Email and OTP required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, verifyCode: true, verifyExpiry: true, emailVerified: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    if (user.emailVerified) {
      res.json({ success: true, message: "Email already verified" });
      return;
    }

    if (!user.verifyCode || !user.verifyExpiry) {
      res.status(400).json({ success: false, error: "No OTP pending. Request a new one." });
      return;
    }

    if (new Date() > user.verifyExpiry) {
      res.status(400).json({ success: false, error: "OTP expired. Request a new one." });
      return;
    }

    if (user.verifyCode !== otp) {
      res.status(400).json({ success: false, error: "Invalid OTP. Please check and try again." });
      return;
    }

    // Verify the account
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyCode: null, verifyExpiry: null },
    });

    res.json({ success: true, message: "Email verified successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── Resend OTP ──

router.post("/resend-otp", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, error: "Email required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      res.status(404).json({ success: false, error: "Account not found" });
      return;
    }

    if (user.emailVerified) {
      res.json({ success: true, message: "Email already verified" });
      return;
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verifyCode: otp, verifyExpiry: expiry },
    });

    const sent = await sendOTPEmail(email, otp);
    if (!sent) {
      res.status(500).json({ success: false, error: "Failed to send OTP. Please try again." });
      return;
    }

    res.json({ success: true, message: "OTP resent to your email." });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ── Login — block unverified accounts ──

router.post("/login", async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    // Check if email is verified before allowing login
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { emailVerified: true, googleId: true },
    });

    if (user && !user.emailVerified && !user.googleId) {
      // Resend OTP automatically
      const otp = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.user.update({
        where: { email: data.email },
        data: { verifyCode: otp, verifyExpiry: expiry },
      });
      await sendOTPEmail(data.email, otp);

      res.status(403).json({
        success: false,
        error: "Email not verified. A new OTP has been sent to your email.",
        needsVerification: true,
        email: data.email,
      });
      return;
    }

    const result = await authService.login(data.email, data.password);
    res.json({ success: true, data: result });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0].message });
      return;
    }
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// ── Refresh Token ──

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: "Refresh token required" });
      return;
    }
    const tokens = await authService.refreshAccessToken(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// ── Logout ──

router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    res.json({ success: true, message: "Logged out" });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Google OAuth (auto-verified) ──

router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential, code, redirectUri } = req.body as {
      credential?: string;
      code?: string;
      redirectUri?: string;
    };

    let googleId: string;
    let email: string;
    let name: string | null = null;
    let avatarUrl: string | null = null;

    if (code) {
      // Use a per-request client so we can match the redirect_uri the frontend
      // actually used (popup flow → "postmessage", redirect flow → site URL).
      const client = new OAuth2Client(
        env.google.clientId,
        env.google.clientSecret,
        redirectUri || "postmessage",
      );
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) {
        res.status(401).json({ success: false, error: "Failed to get ID token from Google" });
        return;
      }
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.google.clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload?.email) {
        res.status(401).json({ success: false, error: "Invalid Google token" });
        return;
      }
      googleId = payload.sub;
      email = payload.email;
      name = payload.name ?? null;
      avatarUrl = payload.picture ?? null;
    } else if (credential) {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.google.clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload?.email) {
        res.status(401).json({ success: false, error: "Invalid Google token" });
        return;
      }
      googleId = payload.sub;
      email = payload.email;
      name = payload.name ?? null;
      avatarUrl = payload.picture ?? null;
    } else {
      res.status(400).json({ success: false, error: "Google credential or auth code required" });
      return;
    }

    const result = await authService.googleAuth(googleId, email, name ?? undefined, avatarUrl ?? undefined);

    // Google OAuth users are auto-verified
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message: string };
    console.error("[Auth] Google auth error:", e.message);
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

export default router;
