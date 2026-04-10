import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create or find the test user
  let user = await prisma.user.findUnique({ where: { email: "test@cryptox.com" } });

  if (!user) {
    const hash = await bcrypt.hash("Test1234!", 12);
    user = await prisma.user.create({
      data: {
        email: "test@cryptox.com",
        name: "Test User",
        passwordHash: hash,
        plan: "MAX",
      },
    });
    console.log("Created test user:", user.id);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { plan: "MAX" } });
    console.log("Updated existing user:", user.id);
  }

  // Create subscription
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: "MAX",
      cycle: "YEARLY",
      amount: 0,
      status: "ACTIVE",
      startDate: new Date(),
      endDate,
    },
  });

  console.log("Plan: MAX | Cycle: YEARLY | Valid until:", endDate.toISOString().split("T")[0]);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
