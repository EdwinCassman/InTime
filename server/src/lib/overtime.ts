// Overtime rules:
// - "Simple" overtime is a continuous nightly band from 7pm to 7am (covers
//   the evening tail of a Closing shift and the early-morning start of an
//   Opening shift).
// - "Double" overtime is any part of a shift that falls on a Saturday or
//   Sunday calendar date — including just the last 15 minutes of a Friday
//   Closing shift that spill past midnight into Saturday.
// A shift is walked day by day (split at each midnight) so a shift crossing
// from a weekday into a weekend, or a weekend into a weekday, gets each
// portion classified by its own calendar day — e.g. a Sunday Closing shift
// (16:45-00:15) is 7.25h double overtime (the Sunday portion) plus 0.25h
// simple overtime (the 15 minutes that land on Monday morning).
export interface OvertimeBreakdown {
  simpleHours: number;
  doubleHours: number;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function overlapHours(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? ms / 1000 / 60 / 60 : 0;
}

export function computeOvertime(shift: { startsAt: Date; endsAt: Date }): OvertimeBreakdown {
  let simpleHours = 0;
  let doubleHours = 0;

  let cursor = startOfDay(shift.startsAt);

  while (cursor < shift.endsAt) {
    const nextDay = new Date(cursor);
    nextDay.setDate(nextDay.getDate() + 1);

    const segStart = shift.startsAt > cursor ? shift.startsAt : cursor;
    const segEnd = shift.endsAt < nextDay ? shift.endsAt : nextDay;

    if (segEnd > segStart) {
      const weekday = segStart.getDay(); // 0 = Sunday, 6 = Saturday
      if (weekday === 0 || weekday === 6) {
        doubleHours += (segEnd.getTime() - segStart.getTime()) / 1000 / 60 / 60;
      } else {
        const morningEnd = new Date(cursor);
        morningEnd.setHours(7, 0, 0, 0);
        const eveningStart = new Date(cursor);
        eveningStart.setHours(19, 0, 0, 0);

        simpleHours += overlapHours(segStart, segEnd, cursor, morningEnd);
        simpleHours += overlapHours(segStart, segEnd, eveningStart, nextDay);
      }
    }

    cursor = nextDay;
  }

  return { simpleHours, doubleHours };
}
