export const CYCLE_LENGTH_DAYS = 14;

// Any fixed Monday works as the phase reference for the repeating 14-day cycle —
// it's never shown to users, it just anchors cycleDay 0 to a Monday.
const CYCLE_ANCHOR = new Date(2024, 0, 1);

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 0-13: position of `date` within the repeating 14-day cycle (0 = Monday of week 1).
export function cycleDayOf(date: Date): number {
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(CYCLE_ANCHOR).getTime()) / (1000 * 60 * 60 * 24),
  );
  return ((diffDays % CYCLE_LENGTH_DAYS) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS;
}

// The next date (today or later) that falls on the given cycle day — used to show
// employees/admins a concrete upcoming date for an otherwise abstract cycle slot.
export function nextDateForCycleDay(cycleDay: number, from: Date = new Date()): Date {
  const today = startOfDay(from);
  const diff = (cycleDay - cycleDayOf(today) + CYCLE_LENGTH_DAYS) % CYCLE_LENGTH_DAYS;
  const result = new Date(today);
  result.setDate(result.getDate() + diff);
  return result;
}
