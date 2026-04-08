import { Router, type Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { exchangeService } from "../services/exchange.service.js";
import type { AuthRequest } from "../types/index.js";

const router = Router();
const prisma = new PrismaClient();

const addBrokerSchema = z.object({
  exchangeId: z.string(),
  name: z.string(),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  passphrase: z.string().optional(),
  ipWhitelist: z.boolean().optional(),
});

// List user's brokers
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const brokers = await prisma.broker.findMany({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        exchangeId: true,
        name: true,
        status: true,
        ipWhitelist: true,
        connectedAt: true,
        apiKey: true,
        apiSecret: true,
        passphrase: true,
        _count: { select: { deployedStrategies: true } },
      },
      orderBy: { connectedAt: "desc" },
    });

    const data = await Promise.all(
      brokers.map(async (broker) => {
        let balance: number | null = null;
        if (broker.status === "CONNECTED") {
          try {
            const exchange = exchangeService.getExchange(
              broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
            );
            const bal = await exchangeService.getBalance(exchange);
            const total = bal.total as unknown as Record<string, number> | undefined;
            balance = total?.["USDT"] ?? total?.["USD"] ?? 0;
          } catch { /* ignore */ }
        }
        return {
          id: broker.id,
          exchangeId: broker.exchangeId,
          name: broker.name,
          status: broker.status,
          connectedAt: broker.connectedAt,
          apiKeyPreview: broker.status === "CONNECTED" ? `****...${broker.apiKey.slice(-4)}` : "",
          balance,
          activeStrategies: broker._count.deployedStrategies,
        };
      }),
    );

    res.json({ success: true, data });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add new broker
router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = addBrokerSchema.parse(req.body);
    const testId = "test-" + Date.now();
    const exchange = exchangeService.getExchange(testId, data.exchangeId, data.apiKey, data.apiSecret, data.passphrase);
    const testResult = await exchangeService.testConnection(exchange);
    exchangeService.removeExchange(testId);

    if (!testResult.ok) {
      res.status(400).json({ success: false, error: testResult.error || "Failed to connect. Check your API credentials." });
      return;
    }

    const broker = await prisma.broker.create({
      data: {
        userId: req.user!.userId,
        exchangeId: data.exchangeId,
        name: data.name,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        passphrase: data.passphrase,
        ipWhitelist: data.ipWhitelist ?? false,
        status: "CONNECTED",
      },
      select: { id: true, exchangeId: true, name: true, status: true, connectedAt: true },
    });

    res.status(201).json({ success: true, data: broker });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ success: false, error: err.issues[0].message });
      return;
    }
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// Get broker detail with markets
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const broker = await prisma.broker.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!broker) {
      res.status(404).json({ success: false, error: "Broker not found" });
      return;
    }

    const exchange = exchangeService.getExchange(
      broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
    );
    const [balance, markets] = await Promise.all([
      exchangeService.getBalance(exchange),
      exchangeService.getMarkets(exchange),
    ]);
    const pairs = Object.keys(markets).filter((s) => s.includes("/USDT")).slice(0, 50);

    res.json({
      success: true,
      data: {
        id: broker.id,
        exchangeId: broker.exchangeId,
        name: broker.name,
        status: broker.status,
        connectedAt: broker.connectedAt,
        apiKeyPreview: `****...${broker.apiKey.slice(-4)}`,
        balance: balance.total,
        supportedPairs: pairs,
      },
    });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// Get live balance
router.get("/:id/balance", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const broker = await prisma.broker.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!broker) {
      res.status(404).json({ success: false, error: "Broker not found" });
      return;
    }
    const exchange = exchangeService.getExchange(
      broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
    );
    const balance = await exchangeService.getBalance(exchange);
    res.json({ success: true, data: balance.total });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// Get ticker
router.get("/:id/ticker/:symbol", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const symbol = (req.params.symbol as string).replace("-", "/");
    const broker = await prisma.broker.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!broker) {
      res.status(404).json({ success: false, error: "Broker not found" });
      return;
    }
    const exchange = exchangeService.getExchange(
      broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
    );
    const ticker = await exchangeService.getTicker(exchange, symbol);
    res.json({ success: true, data: ticker });
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message: string };
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  }
});

// Delete broker
router.delete("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const broker = await prisma.broker.findFirst({
      where: { id, userId: req.user!.userId },
    });
    if (!broker) {
      res.status(404).json({ success: false, error: "Broker not found" });
      return;
    }
    const activeDeployments = await prisma.deployedStrategy.count({
      where: { brokerId: broker.id, status: "ACTIVE" },
    });
    if (activeDeployments > 0) {
      res.status(400).json({ success: false, error: "Stop all active strategies before disconnecting" });
      return;
    }
    exchangeService.removeExchange(broker.id);
    await prisma.broker.delete({ where: { id: broker.id } });
    res.json({ success: true, message: "Broker disconnected" });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
