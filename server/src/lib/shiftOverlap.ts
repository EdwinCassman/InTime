import { prisma } from "./prisma.js";

export function shiftsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

// Minimal (id, userId) rows for every other shift overlapping this one —
// enough to check "does this person already have a conflicting shift".
export async function findOverlappingShiftUserIds(shift: {
  id: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<(string | null)[]> {
  const windowStart = new Date(shift.startsAt);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(shift.endsAt);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const candidates = await prisma.shift.findMany({
    where: { id: { not: shift.id }, startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } },
    select: { id: true, userId: true, startsAt: true, endsAt: true },
  });
  return candidates.filter((c) => shiftsOverlap(shift, c)).map((c) => c.userId);
}
