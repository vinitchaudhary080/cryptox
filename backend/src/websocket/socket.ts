import { Server as HttpServer } from "http";
import { Server as SocketServer, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthPayload } from "../types/index.js";

let io: SocketServer;

export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: [env.frontendUrl, "http://10.67.170.229:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Auth middleware for WebSocket
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = jwt.verify(token, env.jwt.secret) as AuthPayload;
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    console.log(`[WS] User connected: ${userId}`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    socket.on("subscribe:ticker", (symbol: string) => {
      socket.join(`ticker:${symbol}`);
      console.log(`[WS] ${userId} subscribed to ticker:${symbol}`);
    });

    socket.on("unsubscribe:ticker", (symbol: string) => {
      socket.leave(`ticker:${symbol}`);
    });

    socket.on("disconnect", () => {
      console.log(`[WS] User disconnected: ${userId}`);
    });
  });

  return io;
}

/**
 * Emit a trade event to a specific user
 */
export function emitTradeUpdate(userId: string, data: unknown): void {
  if (io) {
    io.to(`user:${userId}`).emit("trade:update", data);
  }
}

/**
 * Emit portfolio value update
 */
export function emitPortfolioUpdate(userId: string, data: unknown): void {
  if (io) {
    io.to(`user:${userId}`).emit("portfolio:update", data);
  }
}

/**
 * Emit ticker to subscribers
 */
export function emitTicker(symbol: string, data: unknown): void {
  if (io) {
    io.to(`ticker:${symbol}`).emit("ticker:data", data);
  }
}

/**
 * Broadcast market overview to all connected clients
 */
export function emitMarketOverview(data: unknown): void {
  if (io) {
    io.emit("market:overview", data);
  }
}

export function getIO(): SocketServer {
  return io;
}
