import { prisma } from "./prisma.js";

// Deleting a shift always marks that (employee, day) as overridden, so the
// rolling-schedule generator never silently recreates it (e.g. a sick day).
// Shared by the manual delete route and (for open, unclaimed shifts) the
// time-off approval flow.
export async function removeShift(shiftId: string): Promise<void> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return;

  // An open shift has no assigned employee left to mark an override for —
  // that override was already created when the shift was opened.
  if (!shift.userId) {
    await prisma.shift.delete({ where: { id: shift.id } });
    return;
  }

  const date = new Date(shift.startsAt);
  date.setHours(0, 0, 0, 0);

  await prisma.$transaction([
    prisma.shift.delete({ where: { id: shift.id } }),
    prisma.scheduleOverride.upsert({
      where: { userId_date: { userId: shift.userId, date } },
      create: { userId: shift.userId, date },
      update: {},
    }),
  ]);
}
