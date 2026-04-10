import { PrismaClient, type Plan, type BillingCycle } from "@prisma/client";

const prisma = new PrismaClient();

// ── Plan Pricing ──

const PLAN_PRICES: Record<string, Record<string, number>> = {
  FREE: { MONTHLY: 0, QUARTERLY: 0, YEARLY: 0 },
  PRO: { MONTHLY: 29, QUARTERLY: 75, YEARLY: 249 },
  MAX: { MONTHLY: 99, QUARTERLY: 249, YEARLY: 799 },
};

// ── Plan Limits ──

export const PLAN_LIMITS: Record<string, { maxStrategies: number; maxBrokers: number; maxBacktestsPerDay: number; maxDataYears: number }> = {
  FREE: { maxStrategies: 2, maxBrokers: 1, maxBacktestsPerDay: 5, maxDataYears: 1 },
  PRO: { maxStrategies: 20, maxBrokers: 5, maxBacktestsPerDay: 100, maxDataYears: 3 },
  MAX: { maxStrategies: -1, maxBrokers: -1, maxBacktestsPerDay: -1, maxDataYears: 5 }, // -1 = unlimited
};

/** Get price for a plan + cycle */
export function getPlanPrice(plan: string, cycle: string): number {
  return PLAN_PRICES[plan]?.[cycle] ?? 0;
}

/** Get all plans with pricing */
export function getAllPlans() {
  return [
    {
      id: "FREE",
      name: "Free",
      prices: { MONTHLY: 0, QUARTERLY: 0, YEARLY: 0 },
      limits: PLAN_LIMITS.FREE,
    },
    {
      id: "PRO",
      name: "Pro",
      prices: { MONTHLY: 29, QUARTERLY: 75, YEARLY: 249 },
      limits: PLAN_LIMITS.PRO,
    },
    {
      id: "MAX",
      name: "Max",
      prices: { MONTHLY: 99, QUARTERLY: 249, YEARLY: 799 },
      limits: PLAN_LIMITS.MAX,
    },
  ];
}

/** Calculate end date based on cycle */
function calculateEndDate(startDate: Date, cycle: BillingCycle): Date {
  const end = new Date(startDate);
  switch (cycle) {
    case "MONTHLY":
      end.setMonth(end.getMonth() + 1);
      break;
    case "QUARTERLY":
      end.setMonth(end.getMonth() + 3);
      break;
    case "YEARLY":
      end.setFullYear(end.getFullYear() + 1);
      break;
  }
  return end;
}

/** Subscribe user to a plan (or upgrade/downgrade) */
export async function subscribeToPlan(userId: string, plan: Plan, cycle: BillingCycle) {
  const price = getPlanPrice(plan, cycle);
  const now = new Date();
  const endDate = calculateEndDate(now, cycle);

  // Cancel any existing active subscription
  await prisma.subscription.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: now },
  });

  // Create new subscription
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      plan,
      cycle,
      amount: price,
      status: "ACTIVE",
      startDate: now,
      endDate,
    },
  });

  // Update user's plan
  await prisma.user.update({
    where: { id: userId },
    data: { plan },
  });

  return subscription;
}

/** Cancel subscription — keeps active until endDate */
export async function cancelSubscription(userId: string) {
  const active = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (!active) throw new Error("No active subscription to cancel");

  await prisma.subscription.update({
    where: { id: active.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return active;
}

/** Get active subscription for a user */
export async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/** Get subscription history */
export async function getSubscriptionHistory(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** Check and expire old subscriptions — run periodically */
export async function expireOldSubscriptions() {
  const now = new Date();
  const expired = await prisma.subscription.findMany({
    where: { status: "ACTIVE", endDate: { lte: now } },
  });

  for (const sub of expired) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "EXPIRED" },
    });

    // Downgrade user to FREE
    await prisma.user.update({
      where: { id: sub.userId },
      data: { plan: "FREE" },
    });

    console.log(`[Subscription] Expired: user ${sub.userId}, plan ${sub.plan}`);
  }

  return expired.length;
}

/** Check if user is within plan limits */
export async function checkPlanLimit(userId: string, resource: "strategies" | "brokers"): Promise<{ allowed: boolean; current: number; limit: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (!user) return { allowed: false, current: 0, limit: 0 };

  const limits = PLAN_LIMITS[user.plan];
  let current = 0;
  let limit = 0;

  if (resource === "strategies") {
    current = await prisma.deployedStrategy.count({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } } });
    limit = limits.maxStrategies;
  } else if (resource === "brokers") {
    current = await prisma.broker.count({ where: { userId } });
    limit = limits.maxBrokers;
  }

  // -1 = unlimited
  if (limit === -1) return { allowed: true, current, limit: -1 };

  return { allowed: current < limit, current, limit };
}
