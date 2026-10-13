import { cycleDayOf } from "./cycle.js";
import { prisma } from "./prisma.js";
import { computeShiftTimes } from "./shiftTemplates.js";

// Always keep at least this many days filled in, even if nobody's browsed that far ahead yet.
const MIN_WINDOW_DAYS = 14;
// Hard ceiling so a single request (e.g. someone jumping the schedule view far into the
// future) can't trigger a huge generation — a year is far more than anyone needs to plan.
const MAX_WINDOW_DAYS = 365;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / (1000 * 60 * 60 * 24));
}

// Fills in any missing days, from today through at least `through` (default:
// MIN_WINDOW_DAYS out), from each employee's recurring cycle pattern. Pass the
// furthest date currently being viewed so browsing further into the future
// always finds it populated, rather than only ever generating a fixed window.
// A day is skipped only if a shift already exists there, or if it was
// explicitly overridden (see ScheduleOverride — created when a shift is
// deleted, so e.g. a sick day stays empty). Otherwise it's always re-evaluated
// against the current pattern, so adding or changing a recurring assignment
// backfills correctly even if the window was already viewed before. Safe to
// call as often as needed.
export async function ensureRollingSchedule(through?: Date): Promise<void> {
  const today = startOfDay(new Date());
  const requestedDays = through ? daysBetween(today, through) + 1 : MIN_WINDOW_DAYS;
  const windowDays = Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, requestedDays));

  const days = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
  const windowEnd = days[days.length - 1];
  const windowEndExclusive = new Date(windowEnd);
  windowEndExclusive.setDate(windowEndExclusive.getDate() + 1);

  const assignments = await prisma.recurringAssignment.findMany({
    include: { shiftTemplate: true },
  });
  if (assignments.length === 0) return;

  const userIds = [...new Set(assignments.map((a) => a.userId))];

  const [existingShifts, overrides] = await Promise.all([
    prisma.shift.findMany({
      where: { userId: { in: userIds }, startsAt: { gte: today, lt: windowEndExclusive } },
      select: { userId: true, startsAt: true },
    }),
    prisma.scheduleOverride.findMany({
      where: { userId: { in: userIds }, date: { gte: today, lt: windowEndExclusive } },
    }),
  ]);

  const occupiedKeys = new Set(existingShifts.map((s) => `${s.userId}|${startOfDay(s.startsAt).getTime()}`));
  const overriddenKeys = new Set(overrides.map((o) => `${o.userId}|${o.date.getTime()}`));

  const assignmentsByUserAndCycleDay = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) {
    assignmentsByUserAndCycleDay.set(`${a.userId}|${a.cycleDay}`, a);
  }

  const shiftsToCreate: { userId: string; startsAt: Date; endsAt: Date; shiftTemplateId: string; fromRecurring: boolean }[] = [];

  for (const day of days) {
    const cycleDay = cycleDayOf(day);
    for (const userId of userIds) {
      const key = `${userId}|${day.getTime()}`;
      if (occupiedKeys.has(key) || overriddenKeys.has(key)) continue;

      const assignment = assignmentsByUserAndCycleDay.get(`${userId}|${cycleDay}`);
      if (!assignment) continue; // day off under the current pattern

      const { startsAt, endsAt } = computeShiftTimes(assignment.shiftTemplate, day);
      shiftsToCreate.push({
        userId,
        startsAt,
        endsAt,
        shiftTemplateId: assignment.shiftTemplateId,
        fromRecurring: true,
      });
    }
  }

  if (shiftsToCreate.length > 0) {
    await prisma.shift.createMany({ data: shiftsToCreate });
  }
}
