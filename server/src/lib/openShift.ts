import { prisma } from "./prisma.js";

// Marks a shift as open (unassigned) instead of deleting it, so it shows up
// on the schedule as available for another employee to claim. Also records a
// ScheduleOverride for the original employee, since they're confirmed off
// that day and the rolling generator should not re-fill their slot.
export async function openShift(shiftId: string): Promise<void> {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift || !shift.userId) return;

  const date = new Date(shift.startsAt);
  date.setHours(0, 0, 0, 0);

  await prisma.$transaction([
    prisma.shift.update({
      where: { id: shift.id },
      data: { originalUserId: shift.userId, userId: null },
    }),
    prisma.scheduleOverride.upsert({
      where: { userId_date: { userId: shift.userId, date } },
      create: { userId: shift.userId, date },
      update: {},
    }),
  ]);
}
