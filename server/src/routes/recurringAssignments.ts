import { Router } from "express";
import { z } from "zod";
import { ensureRollingSchedule } from "../lib/rollingSchedule.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const recurringAssignmentsRouter = Router();

recurringAssignmentsRouter.use(requireAuth, requireAdmin);

// The 14-slot cycle pattern — for one employee (?userId=) or everyone.
recurringAssignmentsRouter.get("/", async (req, res) => {
  const { userId } = req.query as { userId?: string };
  const assignments = await prisma.recurringAssignment.findMany({
    where: userId ? { userId } : undefined,
    include: { shiftTemplate: true },
  });
  res.json(assignments);
});

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const slotSchema = z
  .object({
    cycleDay: z.number().int().min(0).max(13),
    shiftTemplateId: z.string().min(1).nullable().optional(),
    customStartTime: z.string().regex(timePattern).nullable().optional(),
    customEndTime: z.string().regex(timePattern).nullable().optional(),
    customEndNextDay: z.boolean().optional(),
  })
  .refine(
    (slot) => {
      const hasTemplate = !!slot.shiftTemplateId;
      const hasCustom = !!slot.customStartTime && !!slot.customEndTime;
      // Off (neither), or exactly one of template / custom — never both.
      return !(hasTemplate && hasCustom);
    },
    { message: "A slot can use a template or custom times, not both" },
  );

const bulkSetSchema = z.object({
  userId: z.string().min(1),
  slots: z.array(slotSchema),
});

// Replaces this employee's entire 14-slot pattern in one go (the Recurring
// Schedule page edits one employee at a time, then saves everything at once
// rather than live-saving per cell). A slot left out, or with neither a
// template nor custom times, means "off" for that cycle day. Only affects
// the standing pattern going forward — it never rewrites days the rolling
// generator has already filled in.
recurringAssignmentsRouter.put("/bulk", async (req, res) => {
  const parsed = bulkSetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { userId, slots } = parsed.data;

  const toCreate = slots
    .filter((s) => s.shiftTemplateId || (s.customStartTime && s.customEndTime))
    .map((s) => ({
      userId,
      cycleDay: s.cycleDay,
      shiftTemplateId: s.shiftTemplateId ?? null,
      customStartTime: s.shiftTemplateId ? null : s.customStartTime ?? null,
      customEndTime: s.shiftTemplateId ? null : s.customEndTime ?? null,
      customEndNextDay: s.shiftTemplateId ? false : s.customEndNextDay ?? false,
    }));

  await prisma.$transaction([
    prisma.recurringAssignment.deleteMany({ where: { userId } }),
    ...(toCreate.length > 0 ? [prisma.recurringAssignment.createMany({ data: toCreate })] : []),
  ]);

  await ensureRollingSchedule();

  const updated = await prisma.recurringAssignment.findMany({
    where: { userId },
    include: { shiftTemplate: true },
  });
  res.json(updated);
});
