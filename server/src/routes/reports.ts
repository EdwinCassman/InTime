import { Router } from "express";
import { z } from "zod";
import type { AbsenceType } from "@prisma/client";
import { monthRange, previousMonth } from "../lib/dateRange.js";
import { computeOvertime } from "../lib/overtime.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
}

const round = (n: number) => Math.round(n * 100) / 100;

const DEDUCTING_ABSENCE_TYPES: AbsenceType[] = ["SICK", "VAB", "UNPAID_LEAVE"];

const ABSENCE_LABELS: Record<AbsenceType, string> = {
  SICK: "Sjuk",
  VAB: "VAB",
  UNPAID_LEAVE: "Ledig",
  VACATION: "Semester",
};

const optionalMonthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

// Hours worked this month, per employee, counted straight from completed
// shifts (full scheduled duration, no lunch deduction) — a shift only counts
// once it has actually finished. Also breaks out how many of those hours are
// simple (weekday midnight-7am) or double (Saturday/Sunday) overtime, so the
// total can be annotated like "157h (12e, 7d)". Admins see everyone;
// employees see only themselves.
reportsRouter.get("/hours-summary", async (req, res) => {
  const parsedQuery = optionalMonthSchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.flatten() });
  }
  const { month } = parsedQuery.data;
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

  res.json(
    Array.from(totals.values()).map((t) => ({
      ...t,
      hours: round(t.hours),
      simpleOvertimeHours: round(t.simpleOvertimeHours),
      doubleOvertimeHours: round(t.doubleOvertimeHours),
    })),
  );
});

const monthSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

// Whether a month's hours have already been sent to the salary office. Before
// a lock, any absence change for a shift in that month just corrects that
// month's own reported hours directly. Once locked, a change made afterwards
// can't alter what was already submitted, so it's deferred to next month.
reportsRouter.get("/payroll-lock", requireAdmin, async (req, res) => {
  const parsed = monthSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const lock = await prisma.payrollLock.findUnique({ where: { month: parsed.data.month } });
  res.json({ month: parsed.data.month, lockedAt: lock?.lockedAt ?? null });
});

reportsRouter.post("/payroll-lock", requireAdmin, async (req, res) => {
  const parsed = monthSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const lock = await prisma.payrollLock.upsert({
    where: { month: parsed.data.month },
    create: { month: parsed.data.month },
    update: {},
  });
  res.json({ month: lock.month, lockedAt: lock.lockedAt });
});

reportsRouter.delete("/payroll-lock/:month", requireAdmin, async (req, res) => {
  await prisma.payrollLock.deleteMany({ where: { month: req.params.month } });
  res.json({ month: req.params.month, lockedAt: null });
});

// Admin-only: the two payroll views (see routes/shifts.ts mark-absence
// endpoints for how shifts get tagged, and lib/absence.ts for the
// AbsenceEvent ledger this reads from).
//
// A plain shift (no absence involved) always counts toward whoever currently
// owns it. Every absence-related hour instead comes from the permanent
// AbsenceEvent log — not the shift's live absenceType/absenceUserId, which
// only reflect the most recent handoff and would be wrong once a shift
// changes hands more than once (e.g. Edwin is marked Sjuk, Andreas claims it,
// then Andreas is *also* marked Sjuk for that same shift: Andreas's coverage
// and his own absence must both be accounted for, netting to zero for him,
// while Edwin's original shortfall stays untouched).
//
// For each ABSENCE event: VACATION always counts in full for that employee,
// this month, no deferral. Sjuk/VAB/Ledig counts this month only if it was
// "deferred" — i.e. the shift's month was already locked (hours sent to the
// salary office) before the absence was marked, so there's no more room to
// correct what was submitted; it then also creates next month's negative
// adjustment. If marked before any lock, it's simply excluded instead (still
// time to correct this month's own number).
//
// For each COVERAGE event (claiming an absence-opened shift): counts this
// month only if NOT deferred (the coverage happened before the shift's month
// was locked, so it's already part of what gets submitted); if deferred, it's
// excluded this month and instead creates next month's positive adjustment.
//
// "Current" mirrors "expected" but only for completed shifts (endsAt <= now)
// — a real-time progress check, not itself the payroll figure.
reportsRouter.get("/monthly-hours", requireAdmin, async (req, res) => {
  const parsedQuery = optionalMonthSchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.flatten() });
  }
  const { month } = parsedQuery.data;
  const { start, end } = monthRange(month);
  const monthStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthStr = previousMonth(month);
  const { start: prevStart, end: prevEnd } = monthRange(prevMonthStr);
  const now = new Date();

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const employeeIds = employees.map((e) => e.id);

  const eventInclude = { shift: { select: { startsAt: true, endsAt: true } } } as const;

  const [normalShifts, monthEvents, prevMonthEvents, monthLock, prevMonthLock] = await Promise.all([
    // Plain shifts: no absence involved at all, counted the ordinary way.
    prisma.shift.findMany({
      where: { startsAt: { gte: start, lt: end }, userId: { in: employeeIds }, absenceType: null },
    }),
    prisma.absenceEvent.findMany({
      where: { shiftDate: { gte: start, lt: end }, employeeId: { in: employeeIds } },
      include: eventInclude,
    }),
    prisma.absenceEvent.findMany({
      where: { shiftDate: { gte: prevStart, lt: prevEnd }, employeeId: { in: employeeIds } },
      include: eventInclude,
      orderBy: { shiftDate: "asc" },
    }),
    prisma.payrollLock.findUnique({ where: { month: monthStr } }),
    prisma.payrollLock.findUnique({ where: { month: prevMonthStr } }),
  ]);

  function isDeferred(markedAt: Date, lock: { lockedAt: Date } | null): boolean {
    return lock != null && markedAt > lock.lockedAt;
  }

  const sumHours = (list: { startsAt: Date; endsAt: Date }[]) =>
    list.reduce((sum, s) => sum + hoursBetween(s.startsAt, s.endsAt), 0);
  const sumOvertime = (list: { startsAt: Date; endsAt: Date }[]) =>
    list.reduce(
      (acc, s) => {
        const ot = computeOvertime(s);
        return { simple: acc.simple + ot.simpleHours, double: acc.double + ot.doubleHours };
      },
      { simple: 0, double: 0 },
    );

  const dateFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long" });

  const rows = employees.map((emp) => {
    const ownNormalShifts = normalShifts.filter((s) => s.userId === emp.id);
    const ownEvents = monthEvents.filter((e) => e.employeeId === emp.id);

    const expectedExtra: { startsAt: Date; endsAt: Date }[] = [];
    const currentExtra: { startsAt: Date; endsAt: Date }[] = [];
    let vacationHoursTotal = 0;

    for (const e of ownEvents) {
      const times = e.shift;
      if (e.kind === "ABSENCE") {
        if (e.absenceType === "VACATION") {
          expectedExtra.push(times);
          if (times.endsAt <= now) {
            currentExtra.push(times);
            vacationHoursTotal += hoursBetween(times.startsAt, times.endsAt);
          }
        } else if (isDeferred(e.markedAt, monthLock)) {
          expectedExtra.push(times); // frozen/already submitted — not reality, so not in "current"
        }
        // else: corrected within the month — simply excluded, no adjustment anywhere
      } else {
        // COVERAGE
        if (!isDeferred(e.markedAt, monthLock)) {
          expectedExtra.push(times);
          if (times.endsAt <= now) currentExtra.push(times);
        }
        // else: deferred — excluded this month, becomes next month's bonus instead
      }
    }

    const expectedShiftsForEmp = [...ownNormalShifts, ...expectedExtra];
    const currentShiftsForEmp = [...ownNormalShifts.filter((s) => s.endsAt <= now), ...currentExtra];

    const expectedOvertime = sumOvertime(expectedShiftsForEmp);
    const currentOvertime = sumOvertime(currentShiftsForEmp);

    const prevOwnEvents = prevMonthEvents.filter((e) => e.employeeId === emp.id);
    const deductionItems = prevOwnEvents
      .filter(
        (e) =>
          e.kind === "ABSENCE" &&
          DEDUCTING_ABSENCE_TYPES.includes(e.absenceType) &&
          isDeferred(e.markedAt, prevMonthLock),
      )
      .map((e) => ({
        date: dateFormatter.format(e.shift.startsAt),
        hours: -round(hoursBetween(e.shift.startsAt, e.shift.endsAt)),
        type: e.absenceType,
        label: ABSENCE_LABELS[e.absenceType],
      }));
    const bonusItems = prevOwnEvents
      .filter((e) => e.kind === "COVERAGE" && isDeferred(e.markedAt, prevMonthLock))
      .map((e) => ({
        date: dateFormatter.format(e.shift.startsAt),
        hours: round(hoursBetween(e.shift.startsAt, e.shift.endsAt)),
        type: e.absenceType,
        label: ABSENCE_LABELS[e.absenceType],
      }));
    const adjustmentItems = [...deductionItems, ...bonusItems].sort((a, b) => a.date.localeCompare(b.date));
    const adjustmentHours = round(adjustmentItems.reduce((sum, i) => sum + i.hours, 0));

    return {
      userId: emp.id,
      name: emp.name,
      expectedHours: round(sumHours(expectedShiftsForEmp)),
      expectedSimpleOvertimeHours: round(expectedOvertime.simple),
      expectedDoubleOvertimeHours: round(expectedOvertime.double),
      currentHours: round(sumHours(currentShiftsForEmp)),
      currentSimpleOvertimeHours: round(currentOvertime.simple),
      currentDoubleOvertimeHours: round(currentOvertime.double),
      vacationHours: round(vacationHoursTotal),
      adjustmentHours,
      adjustmentItems,
    };
  });

  res.json(rows);
});
