import { Server as HttpServer } from "http";
import { Server as SocketServer, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Emitter } from "@socket.io/redis-emitter";
import { Redis } from "ioredis";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthPayload } from "../types/index.js";

let io: SocketServer | null = null;
let emitter: Emitter | null = null;

function buildRedisClients() {
  const pubClient = new Redis(env.redis.url, { maxRetriesPerRequest: null });
  const subClient = pubClient.duplicate();
  return { pubClient, subClient };
}

/**
 * Initialize socket.io server with Redis adapter (for the web process).
 * Worker process should NOT call this — use initEmitter() instead.
 */
export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed = [
          env.frontendUrl,
          "http://10.67.170.229:3000",
          "http://3.24.173.212:3000",
          "https://cryptox-lovat-six.vercel.app",
        ];
        if (allowed.includes(origin)) return callback(null, true);
        if (/^https:\/\/cryptox-[a-z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
        if (/^https:\/\/cryptox-[a-z0-9-]+-vinits-projects-2eeca486\.vercel\.app$/.test(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Attach Redis adapter so events broadcast from the worker process
  // also reach clients connected to this web process.
  const { pubClient, subClient } = buildRedisClients();
  io.adapter(createAdapter(pubClient, subClient));

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
 * Initialize a Redis-backed emitter for processes that don't run a socket.io
 * server (e.g. the worker process). Events emitted via the helpers below will
 * be published through Redis and forwarded to clients by the web process.
 */
export function initEmitter(): void {
  const client = new Redis(env.redis.url, { maxRetriesPerRequest: null });
  emitter = new Emitter(client);
}

function emit(room: string | null, event: string, data: unknown): void {
  // Prefer the in-process io when it exists (web process). Fall back to the
  // cross-process Redis emitter (worker process).
  if (io) {
    if (room) io.to(room).emit(event, data);
    else io.emit(event, data);
    return;
  }
  if (emitter) {
    if (room) emitter.to(room).emit(event, data);
    else emitter.emit(event, data);
  }
}

export function emitTradeUpdate(userId: string, data: unknown): void {
  emit(`user:${userId}`, "trade:update", data);
}

export function emitPortfolioUpdate(userId: string, data: unknown): void {
  emit(`user:${userId}`, "portfolio:update", data);
}

export function emitTicker(symbol: string, data: unknown): void {
  emit(`ticker:${symbol}`, "ticker:data", data);
}

export function emitMarketOverview(data: unknown): void {
  emit(null, "market:overview", data);
}

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.IO not initialized in this process");
  return io;
}
