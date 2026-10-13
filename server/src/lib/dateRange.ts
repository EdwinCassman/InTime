export function monthRange(month?: string): { start: Date; end: Date } {
  const now = new Date();
  const [year, mon] = (month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
    .split("-")
    .map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);
  return { start, end };
}
