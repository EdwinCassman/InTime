import type { ShiftTemplate } from "@prisma/client";

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6; // Sunday, Saturday
}

function applyTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

// Computes the concrete start/end instants for a template on a specific calendar day,
// accounting for weekday-vs-weekend hours and shifts that run past midnight.
export function computeShiftTimes(template: ShiftTemplate, date: Date): { startsAt: Date; endsAt: Date } {
  const weekend = isWeekend(date.getDay());
  const start = weekend ? template.weekendStart : template.weekdayStart;
  const end = weekend ? template.weekendEnd : template.weekdayEnd;
  const endNextDay = weekend ? template.weekendEndNextDay : template.weekdayEndNextDay;
  return applyStartEnd(date, start, end, endNextDay);
}

// Same, but for a fixed custom time range (no weekday/weekend variation —
// the slot it came from already pins down a specific day).
export function computeCustomTimes(
  date: Date,
  startTime: string,
  endTime: string,
  endNextDay: boolean,
): { startsAt: Date; endsAt: Date } {
  return applyStartEnd(date, startTime, endTime, endNextDay);
}

function applyStartEnd(date: Date, start: string, end: string, endNextDay: boolean): { startsAt: Date; endsAt: Date } {
  const startsAt = applyTime(date, start);
  let endsAt = applyTime(date, end);
  if (endNextDay) {
    endsAt = new Date(endsAt);
    endsAt.setDate(endsAt.getDate() + 1);
  }
  return { startsAt, endsAt };
}
