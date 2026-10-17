import type { AbsenceType } from "@prisma/client";
import { prisma } from "./prisma.js";

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
}

// Marks a shift as an absence (Sjuk/VAB/Ledig/Semester): opens it up for a
// coworker to claim — same mechanics as approving a time-off request — while
// tagging the reason so it's tracked separately for payroll. Also records a
// permanent AbsenceEvent for whoever currently holds the shift, since a
// shift can be marked absent more than once across its life (e.g. a coworker
// claims it and is later marked absent themselves) — the live
// absenceType/absenceUserId fields only reflect the latest such action, but
// routes/reports.ts needs every one of them to stay correct. Only valid on a
// shift that's still assigned to someone.
export async function markShiftAbsence(shiftId: string, type: AbsenceType): Promise<boolean> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || !shift.userId) return false;

  const date = new Date(shift.startsAt);
  date.setHours(0, 0, 0, 0);
  const now = new Date();

  await prisma.$transaction([
    prisma.shift.update({
      where: { id: shift.id },
      data: {
        originalUserId: shift.userId,
        absenceUserId: shift.userId,
        userId: null,
        absenceType: type,
        absenceMarkedAt: now,
      },
    }),
    prisma.scheduleOverride.upsert({
      where: { userId_date: { userId: shift.userId, date } },
      create: { userId: shift.userId, date },
      update: {},
    }),
    prisma.absenceEvent.create({
      data: {
        shiftId: shift.id,
        employeeId: shift.userId,
        kind: "ABSENCE",
        absenceType: type,
        hours: hoursBetween(shift.startsAt, shift.endsAt),
        shiftDate: shift.startsAt,
        markedAt: now,
      },
    }),
  ]);
  return true;
}

// Undoes a mark-absence action: only possible while the shift is still
// unclaimed, since once a coworker picks it up there's no single owner to
// hand it back to. Also removes the AbsenceEvent it created — since undo is
// only allowed before anyone's claimed it, there's always exactly one such
// unresolved event (marking absence requires an assigned shift, so this
// action can't happen twice in a row without an intervening claim).
export async function clearShiftAbsence(shiftId: string): Promise<"ok" | "not_found" | "already_claimed"> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || !shift.absenceType || !shift.originalUserId) return "not_found";
  if (shift.userId) return "already_claimed";

  const date = new Date(shift.startsAt);
  date.setHours(0, 0, 0, 0);

  await prisma.$transaction([
    prisma.shift.update({
      where: { id: shift.id },
      data: {
        userId: shift.originalUserId,
        originalUserId: null,
        absenceType: null,
        absenceUserId: null,
        absenceMarkedAt: null,
      },
    }),
    prisma.scheduleOverride.deleteMany({ where: { userId: shift.originalUserId, date } }),
    prisma.absenceEvent.deleteMany({
      where: { shiftId: shift.id, employeeId: shift.absenceUserId!, kind: "ABSENCE" },
    }),
  ]);
  return "ok";
}
