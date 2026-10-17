function normalizedMonth(month?: string): { year: number; mon: number } {
  const now = new Date();
  const [year, mon] = (month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    .split("-")
    .map(Number);
  return { year, mon };
}

export function monthRange(month?: string): { start: Date; end: Date } {
  const { year, mon } = normalizedMonth(month);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);
  return { start, end };
}

// "YYYY-MM" for the calendar month immediately before the given one.
export function previousMonth(month?: string): string {
  const { year, mon } = normalizedMonth(month);
  const prev = new Date(year, mon - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}
