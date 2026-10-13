import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const shiftTemplatesRouter = Router();

shiftTemplatesRouter.use(requireAuth);

// Read-only for now: the three standard shifts are fixed business rules, seeded once.
shiftTemplatesRouter.get("/", async (_req, res) => {
  const templates = await prisma.shiftTemplate.findMany({ orderBy: { name: "asc" } });
  res.json(templates);
});
