import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { openShift } from "../lib/openShift.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const timeOffRequestsRouter = Router();

timeOffRequestsRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DENIED"]).optional(),
});

timeOffRequestsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requests = await prisma.timeOffRequest.findMany({
    where: { status: parsed.data.status },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(requests);
});

const decideSchema = z.object({ status: z.enum(["APPROVED", "DENIED"]) });

timeOffRequestsRouter.patch("/:id", async (req, res) => {
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const request = await prisma.timeOffRequest.findUnique({ where: { id: req.params.id } });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (request.status !== "PENDING") {
    return res.status(409).json({ error: "This request has already been resolved" });
  }

  if (parsed.data.status === "APPROVED" && request.shiftId) {
    await openShift(request.shiftId);
  }

  const updated = await prisma.timeOffRequest.update({
    where: { id: request.id },
    data: { status: parsed.data.status, resolvedAt: new Date() },
    include: { user: { select: { id: true, name: true } } },
  });

  res.json(updated);
});
