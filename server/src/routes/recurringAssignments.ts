import { Router } from "express";
import { z } from "zod";
import { ensureRollingSchedule } from "../lib/rollingSchedule.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const recurringAssignmentsRouter = Router();

recurringAssignmentsRouter.use(requireAuth, requireAdmin);

// The full 14-day cycle pattern for every employee, used to render the recurring-schedule grid.
recurringAssignmentsRouter.get("/", async (_req, res) => {
  const assignments = await prisma.recurringAssignment.findMany({
    include: { shiftTemplate: true },
  });
  res.json(assignments);
});

const setSchema = z.object({
  userId: z.string().min(1),
  cycleDay: z.number().int().min(0).max(13),
  shiftTemplateId: z.string().min(1).nullable(),
});

// Upserts (or, with a null template, clears) a single employee/cycle-day cell in the
// recurring pattern. Only affects the standing pattern going forward — it never
// rewrites days the rolling generator has already filled in.
recurringAssignmentsRouter.put("/", async (req, res) => {
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { userId, cycleDay, shiftTemplateId } = parsed.data;

  if (shiftTemplateId === null) {
    await prisma.recurringAssignment.deleteMany({ where: { userId, cycleDay } });
    res.status(204).send();
    return;
  }

  const assignment = await prisma.recurringAssignment.upsert({
    where: { userId_cycleDay: { userId, cycleDay } },
    create: { userId, cycleDay, shiftTemplateId },
    update: { shiftTemplateId },
    include: { shiftTemplate: true },
  });

  await ensureRollingSchedule();
  res.json(assignment);
});
