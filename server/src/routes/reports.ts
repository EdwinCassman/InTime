import { Router } from "express";
import { monthRange } from "../lib/dateRange.js";
import { computeOvertime } from "../lib/overtime.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
}

// Hours worked this month, per employee, counted straight from completed
// shifts (full scheduled duration, no lunch deduction) — a shift only counts
// once it has actually finished. Also breaks out how many of those hours are
// simple (weekday midnight-7am) or double (Saturday/Sunday) overtime, so the
// total can be annotated like "157h (12e, 7d)". Admins see everyone;
// employees see only themselves.
reportsRouter.get("/hours-summary", async (req, res) => {
  const { month } = req.query as { month?: string };
  const { start, end } = monthRange(month);
  const isAdmin = req.user!.role === "ADMIN";
  const now = new Date();

  const shifts = await prisma.shift.findMany({
    where: {
      userId: isAdmin ? { not: null } : req.user!.id,
      startsAt: { gte: start, lt: end },
      endsAt: { lte: now },
    },
    include: { user: { select: { id: true, name: true } } },
  });

  const totals = new Map<
    string,
    { userId: string; name: string; hours: number; simpleOvertimeHours: number; doubleOvertimeHours: number }
  >();
  for (const shift of shifts) {
    if (!shift.user) continue;
    const key = shift.userId!;
    const existing = totals.get(key) ?? {
      userId: key,
      name: shift.user.name,
      hours: 0,
      simpleOvertimeHours: 0,
      doubleOvertimeHours: 0,
    };
    existing.hours += hoursBetween(shift.startsAt, shift.endsAt);
    const overtime = computeOvertime(shift);
    existing.simpleOvertimeHours += overtime.simpleHours;
    existing.doubleOvertimeHours += overtime.doubleHours;
    totals.set(key, existing);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  res.json(
    Array.from(totals.values()).map((t) => ({
      ...t,
      hours: round(t.hours),
      simpleOvertimeHours: round(t.simpleOvertimeHours),
      doubleOvertimeHours: round(t.doubleOvertimeHours),
    })),
  );
});
