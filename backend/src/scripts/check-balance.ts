import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import { PrismaClient } from "@prisma/client";
import { exchangeService } from "../services/exchange.service.js";

const prisma = new PrismaClient();

async function main() {
  const broker = await prisma.broker.findFirst({
    where: { userId: "5d1a1e74-f326-4e7a-b90a-a9f4c5f9d2de", status: "CONNECTED" },
  });

  if (!broker) {
    console.log("No connected broker found");
    return;
  }

  console.log("Broker:", broker.name, "| Exchange:", broker.exchangeId);

  const exchange = exchangeService.getExchange(
    broker.id, broker.exchangeId, broker.apiKey, broker.apiSecret, broker.passphrase || undefined,
  );

  const balance = await exchangeService.getBalance(exchange);

  console.log("\n=== BALANCE ===");
  const total = balance.total as unknown as Record<string, number>;
  const free = balance.free as unknown as Record<string, number>;
  const used = balance.used as unknown as Record<string, number>;

  for (const [currency, amount] of Object.entries(total)) {
    if (amount > 0) {
      console.log(`${currency}: Total=${amount} | Free=${free[currency] ?? 0} | Used=${used[currency] ?? 0}`);
    }
  }

  // Check open positions
  try {
    const positions = await exchangeService.getPositions(exchange);
    if (Array.isArray(positions) && positions.length > 0) {
      console.log("\n=== OPEN POSITIONS ===");
      for (const pos of positions) {
        const p = pos as unknown as Record<string, unknown>;
        if (p.contracts && Number(p.contracts) > 0) {
          console.log(`${p.symbol} | Side: ${p.side} | Size: ${p.contracts} | PnL: ${p.unrealizedPnl}`);
        }
      }
    } else {
      console.log("\nNo open positions");
    }
  } catch (e) {
    console.log("\nPositions check error:", (e as Error).message);
  }
}

main().catch((e) => console.log("Error:", e.message)).finally(() => process.exit(0));
