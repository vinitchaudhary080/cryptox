import dns from "dns";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
dns.setDefaultResultOrder("ipv4first"); // Force IPv4 — fixes Delta IP whitelist issue

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import swaggerUi from "swagger-ui-express";
import { createServer } from "http";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { generalLimiter, authLimiter, deployLimiter } from "./middleware/rate-limit.js";
import { swaggerSpec } from "./config/swagger.js";
import { initSocket } from "./websocket/socket.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import brokerRoutes from "./routes/broker.routes.js";
import strategyRoutes from "./routes/strategy.routes.js";
import deployedRoutes from "./routes/deployed.routes.js";
import portfolioRoutes from "./routes/portfolio.routes.js";
import marketRoutes from "./routes/market.routes.js";
import userRoutes from "./routes/user.routes.js";
import historicalRoutes from "./backtest/routes/historical.routes.js";
import backtestRoutes from "./backtest/routes/backtest.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: false,
}));
const allowedOrigins = [
  env.frontendUrl,
  "http://0.0.0.0:3000",
  "http://172.20.10.2:3000",
  "http://3.24.173.212:3000",
  "http://3.24.173.212",
  "http://10.67.170.229:3000",
  "https://cryptox-lovat-six.vercel.app",
  "https://algopulse.in",
  "https://www.algopulse.in",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/cryptox-[a-z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
    if (/^https:\/\/cryptox-[a-z0-9-]+-vinits-projects-2eeca486\.vercel\.app$/.test(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));
app.use(compression());
app.use(morgan("dev"));
app.use(express.json());

// Trust the reverse proxy / load balancer so rate limiter sees real client IPs
app.set("trust proxy", 1);

// Global API rate limit (per IP)
app.use("/api", generalLimiter);

// Swagger API Docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "CryptoX API Docs",
}));
app.get("/docs.json", (_req, res) => res.json(swaggerSpec));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/brokers", brokerRoutes);
app.use("/api/strategies", strategyRoutes);
// Deploy limiter only applies to the POST that creates a new deployment;
// reads (dashboard polling) must not be throttled.
app.use("/api/deployed", (req, res, next) => {
  if (req.method === "POST" && req.path === "/") return deployLimiter(req, res, next);
  return next();
}, deployedRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/user", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/historical", historicalRoutes);
app.use("/api/backtest", backtestRoutes);

// Error handler
app.use(errorHandler);

// Initialize WebSocket
initSocket(server);

// Mark orphaned RUNNING backtests as FAILED (from prior crashes / tsx restarts)
prisma.backtestRun
  .updateMany({ where: { status: "RUNNING" }, data: { status: "FAILED" } })
  .then((r) => { if (r.count > 0) console.log(`[Startup] Marked ${r.count} orphaned backtests as FAILED`); })
  .catch(() => {});

// Start server
server.listen(env.port, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         CryptoX Backend Server            ║
╠═══════════════════════════════════════════╣
║  HTTP:  http://0.0.0.0:${env.port}              ║
║  WS:    ws://0.0.0.0:${env.port}                ║
║  Docs:  http://0.0.0.0:${env.port}/docs         ║
║  Env:   ${env.nodeEnv.padEnd(32)}║
╚═══════════════════════════════════════════╝
  `);
});

// ── Graceful shutdown ─────────────────────────────────────────
// tsx watch sends SIGTERM before respawning. Close the HTTP server so the
// port is released BEFORE the new process tries to bind — prevents the
// recurring EADDRINUSE crash that was killing the dev backend.
function shutdown(signal: string) {
  console.log(`[Server] ${signal} received — closing HTTP server...`);
  server.close(() => {
    console.log("[Server] HTTP server closed. Exiting.");
    process.exit(0);
  });
  // Force exit after 3s if close hangs (stuck connections, etc.)
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
