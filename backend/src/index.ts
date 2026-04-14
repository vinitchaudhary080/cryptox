import dns from "dns";
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
import { initSocket, emitMarketOverview } from "./websocket/socket.js";
import ccxt, { type Exchange } from "ccxt";
import { strategyWorker } from "./workers/strategy-executor.js";

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
import { expireOldSubscriptions } from "./services/subscription.service.js";
import { scheduleDailySync } from "./backtest/data/sync-job.js";

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet({
  hsts: false,
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: [env.frontendUrl, "http://0.0.0.0:3000", "http://172.20.10.2:3000", "http://3.24.173.212:3000", "http://3.24.173.212", "http://10.67.170.229:3000"],
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
app.use("/api/deployed", deployLimiter, deployedRoutes);
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

// Start server
server.listen(env.port, "0.0.0.0", async () => {
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

  // Resume active strategy workers
  try {
    await strategyWorker.resumeAll();
  } catch (err) {
    console.error("[Server] Failed to resume strategies:", (err as Error).message);
  }

  // Start real-time market data broadcaster (every 10s)
  startMarketBroadcaster();

  // Schedule daily historical data sync (1 AM UTC)
  scheduleDailySync();

  // Check expired subscriptions on startup + every hour
  expireOldSubscriptions().catch(() => {});
  setInterval(() => expireOldSubscriptions().catch(() => {}), 60 * 60 * 1000);
});

// Market data broadcaster — pushes to all WebSocket clients every 10s
const MARKET_COINS = [
  { symbol: "BTC/USD:USD", short: "BTC", name: "Bitcoin", icon: "btc" },
  { symbol: "ETH/USD:USD", short: "ETH", name: "Ethereum", icon: "eth" },
  { symbol: "SOL/USD:USD", short: "SOL", name: "Solana", icon: "sol" },
  { symbol: "XRP/USD:USD", short: "XRP", name: "XRP", icon: "xrp" },
  { symbol: "DOGE/USD:USD", short: "DOGE", name: "Dogecoin", icon: "doge" },
];

function startMarketBroadcaster() {
  const delta = new (ccxt as unknown as Record<string, new (c: Record<string, unknown>) => Exchange>)["delta"]({
    enableRateLimit: true,
  });
  (delta.urls as Record<string, unknown>)["api"] = {
    public: "https://api.india.delta.exchange",
    private: "https://api.india.delta.exchange",
  };

  let marketsLoaded = false;

  const broadcast = async () => {
    try {
      if (!marketsLoaded) {
        await delta.loadMarkets();
        marketsLoaded = true;
      }

      const tickers = await Promise.allSettled(
        MARKET_COINS.map((c) => delta.fetchTicker(c.symbol)),
      );

      const data = tickers
        .map((r, i) => {
          if (r.status !== "fulfilled") return null;
          const t = r.value;
          return {
            symbol: MARKET_COINS[i].short,
            name: MARKET_COINS[i].name,
            icon: MARKET_COINS[i].icon,
            price: t.last ?? 0,
            change24h: t.percentage ?? 0,
            high24h: t.high ?? 0,
            low24h: t.low ?? 0,
            volume24h: t.baseVolume ?? 0,
            timestamp: t.timestamp,
          };
        })
        .filter(Boolean);

      emitMarketOverview(data);
    } catch (err) {
      console.error("[MarketBroadcast] Error:", (err as Error).message);
    }
  };

  // First broadcast after 2s, then every 10s
  setTimeout(broadcast, 2000);
  setInterval(broadcast, 10_000);
  console.log("[MarketBroadcast] Started — pushing every 10s");
}

export default app;
