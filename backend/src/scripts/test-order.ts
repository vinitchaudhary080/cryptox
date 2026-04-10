import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { PrismaClient } from "@prisma/client";
import { exchangeService } from "../services/exchange.service.js";

const prisma = new PrismaClient();

async function main() {
  const broker = await prisma.broker.findUnique({
    where: { id: "0a471946-8b46-44f7-8c72-dbce4dc60cca" },
  });

  if (!broker) {
    console.log("Broker not found");
    return;
  }

  const exchange = exchangeService.getExchange(
    broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
  );

  // Test 1: Balance
  try {
    const bal = await exchangeService.getBalance(exchange);
    const total = bal.total as unknown as Record<string, number>;
    const free = bal.free as unknown as Record<string, number>;
    console.log("Balance OK! Total:", total["USD"], "| Free:", free["USD"]);
  } catch (e) {
    console.log("Balance FAILED:", (e as Error).message);
    return;
  }

  // Test 2: Place test order
  try {
    console.log("Placing BUY 1 contract BTC/USD:USD...");
    const order = await exchangeService.placeMarketOrder(exchange, "BTC/USD:USD", "buy", 1);
    console.log("ORDER SUCCESS!");
    console.log("  Order ID:", order.id);
    console.log("  Fill Price:", order.average ?? order.price);
    console.log("  Filled:", order.filled);
    console.log("  Fee:", JSON.stringify(order.fee));
    console.log("  Status:", order.status);
  } catch (e) {
    console.log("Order FAILED:", (e as Error).message);
  }
}

main().catch((e) => console.log("Error:", e.message)).finally(() => process.exit(0));
