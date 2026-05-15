const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDateOnlyDays(value: string, days: number): string | null {
  const date = parseDateOnly(value);
  if (!date || !Number.isFinite(days)) return null;
  return formatDateOnly(new Date(date.getTime() + Math.trunc(days) * DAY_MS));
}

export function calculateCalendarDayDiff(
  startDate: string,
  endDate: string,
): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function calculateInclusiveRentalDays(
  startDate: string,
  returnDate: string,
): number {
  const diff = calculateCalendarDayDiff(startDate, returnDate);
  return diff >= 0 ? diff + 1 : 0;
}

export function toExclusiveEndDate(customerReturnDate: string): string | null {
  return addDateOnlyDays(customerReturnDate, 1);
}

export function toCustomerReturnDate(exclusiveEndDate: string): string | null {
  return addDateOnlyDays(exclusiveEndDate, -1);
}
