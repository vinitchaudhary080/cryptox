import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error-handler.js";
import type { AuthPayload } from "../types/index.js";

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
