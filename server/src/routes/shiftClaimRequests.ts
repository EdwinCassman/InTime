import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { findOverlappingShiftUserIds } from "../lib/shiftOverlap.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const shiftClaimRequestsRouter = Router();

shiftClaimRequestsRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DENIED"]).optional(),
});

shiftClaimRequestsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const requests = await prisma.shiftClaimRequest.findMany({
    where: { status: parsed.data.status },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(requests);
});

const decideSchema = z.object({ status: z.enum(["APPROVED", "DENIED"]) });

// Approving one request assigns the shift to that user and automatically
// denies every other pending request for the same shift.
shiftClaimRequestsRouter.patch("/:id", async (req, res) => {
  const parsed = decideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const request = await prisma.shiftClaimRequest.findUnique({ where: { id: req.params.id } });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (request.status !== "PENDING") {
    return res.status(409).json({ error: "This request has already been resolved" });
  }

  if (parsed.data.status === "DENIED") {
    const updated = await prisma.shiftClaimRequest.update({
      where: { id: request.id },
      data: { status: "DENIED", resolvedAt: new Date() },
      include: { user: { select: { id: true, name: true } } },
    });
    return res.json(updated);
  }

  if (!request.shiftId) {
    return res.status(409).json({ error: "This shift no longer exists" });
  }
  const shift = await prisma.shift.findUnique({ where: { id: request.shiftId } });
  if (!shift || shift.userId) {
    return res.status(409).json({ error: "This shift is no longer open" });
  }

  const overlappingUserIds = await findOverlappingShiftUserIds(shift);
  if (overlappingUserIds.includes(request.userId)) {
    return res.status(409).json({ error: "This person now has a conflicting shift at that time" });
  }

  const now = new Date();
  const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 1000 / 60 / 60;

  // If this shift is still tagged with an absence (it was opened by marking
  // someone absent, not just a plain time-off approval), record a permanent
  // COVERAGE event for whoever's claiming it — these hours weren't part of
  // their own original schedule, so routes/reports.ts needs its own
  // historical record of it, independent of whatever the shift's live
  // absenceType/absenceUserId end up reflecting later.
  const [, , , updated] = await prisma.$transaction([
    prisma.shift.update({
      where: { id: shift.id },
      data: { userId: request.userId, originalUserId: null },
    }),
    prisma.shiftClaimRequest.updateMany({
      where: { shiftId: shift.id, status: "PENDING", id: { not: request.id } },
      data: { status: "DENIED", resolvedAt: now },
    }),
    prisma.shiftClaimRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", resolvedAt: now },
    }),
    prisma.shiftClaimRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { user: { select: { id: true, name: true } } },
    }),
    ...(shift.absenceType
      ? [
          prisma.absenceEvent.create({
            data: {
              shiftId: shift.id,
              employeeId: request.userId,
              kind: "COVERAGE" as const,
              absenceType: shift.absenceType,
              hours,
              shiftDate: shift.startsAt,
              markedAt: now,
            },
          }),
        ]
      : []),
  ]);

  res.json(updated);
});
