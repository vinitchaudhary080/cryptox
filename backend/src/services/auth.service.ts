import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error-handler.js";
import type { AuthPayload } from "../types/index.js";
import {
  generateOTP,
  sendPasswordResetOtpEmail,
  sendPasswordResetConfirmationEmail,
} from "./email.service.js";

const prisma = new PrismaClient();

function generateTokens(payload: AuthPayload) {
  const accessToken = jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
  const refreshToken = jwt.sign({ ...payload, jti: uuid() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
  return { accessToken, refreshToken };
}

export async function signup(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, plan: true, createdAt: true },
  });

  const tokens = generateTokens({ userId: user.id, email: user.email });

  const decoded = jwt.decode(tokens.refreshToken) as jwt.JwtPayload;
  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date((decoded?.exp ?? 0) * 1000),
    },
  });

  return { user, ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const tokens = generateTokens({ userId: user.id, email: user.email });

  const decoded = jwt.decode(tokens.refreshToken) as jwt.JwtPayload;
  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date((decoded?.exp ?? 0) * 1000),
    },
  });

  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser, ...tokens };
}

export async function refreshAccessToken(token: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  let payload: AuthPayload;
  try {
    const decoded = jwt.verify(token, env.jwt.refreshSecret) as AuthPayload;
    payload = { userId: decoded.userId, email: decoded.email };
  } catch {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new AppError(401, "Invalid refresh token");
  }

  // Rotate: delete old, create new
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const tokens = generateTokens(payload);
  const decoded2 = jwt.decode(tokens.refreshToken) as jwt.JwtPayload;
  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: payload.userId,
      expiresAt: new Date((decoded2?.exp ?? 0) * 1000),
    },
  });

  return tokens;
}

export async function logout(token: string) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function googleAuth(googleId: string, email: string, name?: string, avatarUrl?: string) {
  let user = await prisma.user.findUnique({ where: { googleId } });

  if (!user) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, avatarUrl: avatarUrl || user.avatarUrl },
      });
    } else {
      user = await prisma.user.create({
        data: { email, googleId, name, avatarUrl },
      });
    }
  }

  const tokens = generateTokens({ userId: user.id, email: user.email });
  const decoded = jwt.decode(tokens.refreshToken) as jwt.JwtPayload;
  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date((decoded?.exp ?? 0) * 1000),
    },
  });

  const { passwordHash: _, ...safeUser } = user;
  return { user: safeUser, ...tokens };
}

// ── Password reset (forgot-password flow, Approach C) ────────────

const RESET_OTP_TTL_MS = 10 * 60 * 1000;            // 10 min
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;          // 10 min
const RESET_OTP_MAX_ATTEMPTS = 5;
const RESET_OTP_RESEND_COOLDOWN_MS = 60 * 1000;     // 60 s between requests per account

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Step 1 — user enters their email. We always return success (no account
 * enumeration). If the email does exist, we generate a fresh OTP and email it.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return; // silently pass — do not reveal account existence

  // Cooldown — if we sent an OTP less than 60 s ago, skip to prevent spam
  if (user.resetOtpExpiry) {
    const lastSentAt = user.resetOtpExpiry.getTime() - RESET_OTP_TTL_MS;
    if (Date.now() - lastSentAt < RESET_OTP_RESEND_COOLDOWN_MS) {
      return;
    }
  }

  const otp = generateOTP();
  const expiry = new Date(Date.now() + RESET_OTP_TTL_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtp: otp,
      resetOtpExpiry: expiry,
      resetOtpAttempts: 0,
      resetTokenHash: null,
      resetTokenExpiry: null,
    },
  });

  await sendPasswordResetOtpEmail(user.email, otp);
}

/**
 * Step 2 — validate the OTP. On success, issue a short-lived reset JWT that
 * the client must present to step 3. The JWT's sha256 is stored on the user
 * so it can be single-used.
 */
export async function verifyPasswordResetOtp(email: string, otp: string): Promise<{ resetToken: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.resetOtp || !user.resetOtpExpiry) {
    throw new AppError(400, "Invalid or expired code");
  }
  if (user.resetOtpExpiry.getTime() < Date.now()) {
    throw new AppError(400, "Code has expired — request a new one");
  }
  if ((user.resetOtpAttempts ?? 0) >= RESET_OTP_MAX_ATTEMPTS) {
    throw new AppError(429, "Too many invalid attempts — request a new code");
  }
  if (user.resetOtp !== otp.trim()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetOtpAttempts: { increment: 1 } },
    });
    throw new AppError(400, "Invalid code");
  }

  // OTP correct — issue reset token
  const resetToken = jwt.sign(
    { userId: user.id, purpose: "password_reset" },
    env.jwt.secret,
    { expiresIn: "10m" } as jwt.SignOptions,
  );

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtp: null,              // consume OTP
      resetOtpExpiry: null,
      resetOtpAttempts: 0,
      resetTokenHash: sha256(resetToken),
      resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return { resetToken };
}

/**
 * Step 3 — use the reset token to actually change the password.
 * Token is single-use (hash cleared), all refresh tokens revoked,
 * confirmation email fired.
 */
export async function resetPasswordWithToken(resetToken: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError(400, "Password must be at least 8 characters");
  }

  let decoded: { userId: string; purpose?: string };
  try {
    decoded = jwt.verify(resetToken, env.jwt.secret) as { userId: string; purpose?: string };
  } catch {
    throw new AppError(401, "Reset link is invalid or has expired");
  }
  if (decoded.purpose !== "password_reset" || !decoded.userId) {
    throw new AppError(401, "Reset link is invalid");
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.resetTokenHash || !user.resetTokenExpiry) {
    throw new AppError(401, "Reset link already used or revoked");
  }
  if (user.resetTokenHash !== sha256(resetToken)) {
    throw new AppError(401, "Reset link is invalid");
  }
  if (user.resetTokenExpiry.getTime() < Date.now()) {
    throw new AppError(401, "Reset link has expired — start over");
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        resetTokenHash: null, // burn the token
        resetTokenExpiry: null,
      },
    }),
    // Revoke every active session — force re-login everywhere
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ]);

  // Fire-and-forget — don't block the response if SMTP is slow
  sendPasswordResetConfirmationEmail(user.email).catch(() => {});
}
