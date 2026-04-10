import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { PrismaClient } from "@prisma/client";
import { exchangeService } from "../services/exchange.service.js";

const prisma = new PrismaClient();

async function main() {
  const broker = await prisma.broker.findUnique({
    where: { id: "0a471946-8b46-44f7-8c72-dbce4dc60cca" },
  });
  if (!broker) return;

  const exchange = exchangeService.getExchange(
    broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
  );

  console.log("Closing test position — SELL 1 contract...");
  const order = await exchangeService.placeMarketOrder(exchange, "BTC/USD:USD", "sell", 1);
  console.log("CLOSED! Order ID:", order.id, "| Price:", order.average ?? order.price);

  // Check balance after
  const bal = await exchangeService.getBalance(exchange);
  const free = (bal.free as unknown as Record<string, number>)["USD"];
  console.log("Free balance now:", "$" + free?.toFixed(2));
}

main().catch((e) => console.log("Error:", e.message)).finally(() => process.exit(0));
