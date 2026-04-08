import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { createServer } from "http";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { initSocket } from "./websocket/socket.js";
import { strategyWorker } from "./workers/strategy-executor.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import brokerRoutes from "./routes/broker.routes.js";
import strategyRoutes from "./routes/strategy.routes.js";
import deployedRoutes from "./routes/deployed.routes.js";
import portfolioRoutes from "./routes/portfolio.routes.js";

const app = express();
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}));
app.use(compression());
app.use(morgan("dev"));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/brokers", brokerRoutes);
app.use("/api/strategies", strategyRoutes);
app.use("/api/deployed", deployedRoutes);
app.use("/api/portfolio", portfolioRoutes);

// Error handler
app.use(errorHandler);

// Initialize WebSocket
initSocket(server);

// Start server
server.listen(env.port, async () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         CryptoX Backend Server            ║
╠═══════════════════════════════════════════╣
║  HTTP:  http://localhost:${env.port}            ║
║  WS:    ws://localhost:${env.port}              ║
║  Env:   ${env.nodeEnv.padEnd(32)}║
╚═══════════════════════════════════════════╝
  `);

  // Resume active strategy workers
  try {
    await strategyWorker.resumeAll();
  } catch (err) {
    console.error("[Server] Failed to resume strategies:", (err as Error).message);
  }
});

export default app;
