// "cycleDay" (0-13) identifies a slot in an employee's standing 2-week pattern:
// 0-6 = "week 1" (Mon-Sun of an even ISO week number), 7-13 = "week 2" (odd ISO
// week number). This is computed fresh from the real calendar every time —
// not from a fixed reference date — so it never drifts out of sync with real
// weeks, even across a 53-ISO-week year.
export const CYCLE_LENGTH_DAYS = 14;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekdayMonFirst(date: Date): number {
  return (date.getDay() + 6) % 7; // 0 = Monday ... 6 = Sunday
}

// Standard ISO 8601 week number (1-53), based on this date's local Y/M/D.
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function isEvenIsoWeek(date: Date): boolean {
  return isoWeekNumber(date) % 2 === 0;
}

// 0-13: position of `date` within the repeating pattern (0 = Monday of an even ISO week).
export function cycleDayOf(date: Date): number {
  return weekdayMonFirst(date) + (isEvenIsoWeek(date) ? 0 : 7);
}

// The next date (today or later) that falls on the given cycle day. Scans
// forward day by day rather than assuming strict 14-day periodicity, since a
// 53-ISO-week year can occasionally repeat a parity across the year boundary.
export function nextDateForCycleDay(cycleDay: number, from: Date = new Date()): Date {
  const today = startOfDay(from);
  for (let i = 0; i < 21; i++) {
    const candidate = new Date(today);
    candidate.setDate(candidate.getDate() + i);
    if (cycleDayOf(candidate) === cycleDay) return candidate;
  }
  return today; // unreachable in practice
}
