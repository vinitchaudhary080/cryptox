import { Router, type Request, type Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// List all available strategies (system templates)
router.get("/", async (_req: Request, res: Response) => {
  try {
    const strategies = await prisma.strategy.findMany({
      where: { isSystem: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: strategies });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get single strategy
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const strategy = await prisma.strategy.findUnique({ where: { id } });
    if (!strategy) {
      res.status(404).json({ success: false, error: "Strategy not found" });
      return;
    }
    res.json({ success: true, data: strategy });
  } catch (err: unknown) {
    const e = err as { message: string };
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
