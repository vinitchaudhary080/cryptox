import { Router, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import {
  getAllPlans,
  subscribeToPlan,
  cancelSubscription,
  getActiveSubscription,
  getSubscriptionHistory,
  checkPlanLimit,
} from "../services/subscription.service.js";
import type { Plan, BillingCycle } from "@prisma/client";

const router = Router();

// Get all plans with pricing
router.get("/plans", (_req, res: Response) => {
  res.json({ success: true, data: getAllPlans() });
});

// Get current subscription + history
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [active, history] = await Promise.all([
      getActiveSubscription(req.user!.userId),
      getSubscriptionHistory(req.user!.userId),
    ]);

    res.json({ success: true, data: { active, history } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Subscribe to a plan
router.post("/subscribe", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { plan, cycle } = req.body as { plan: string; cycle: string };

    if (!["FREE", "PRO", "MAX"].includes(plan)) {
      res.status(400).json({ success: false, error: "Invalid plan. Must be FREE, PRO, or MAX" });
      return;
    }
    if (!["MONTHLY", "QUARTERLY", "YEARLY"].includes(cycle)) {
      res.status(400).json({ success: false, error: "Invalid cycle. Must be MONTHLY, QUARTERLY, or YEARLY" });
      return;
    }

    const subscription = await subscribeToPlan(
      req.user!.userId,
      plan as Plan,
      cycle as BillingCycle,
    );

    res.json({ success: true, data: subscription });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Cancel subscription
router.post("/cancel", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sub = await cancelSubscription(req.user!.userId);
    res.json({
      success: true,
      data: sub,
      message: `Subscription cancelled. Active until ${sub.endDate.toISOString().split("T")[0]}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Check plan limits
router.get("/limits", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [strategies, brokers] = await Promise.all([
      checkPlanLimit(req.user!.userId, "strategies"),
      checkPlanLimit(req.user!.userId, "brokers"),
    ]);

    res.json({ success: true, data: { strategies, brokers } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
