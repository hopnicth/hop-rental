import {
  BOOKING_CUTOFF_BYPASS_ROLES,
  BOOKING_CUTOFF_HOUR,
  BOOKING_CUTOFF_MINUTE,
} from "~/config/booking";

/**
 * Returns true when the given moment is at or past the daily booking cutoff.
 * Same-day rentals are blocked once this returns true.
 */
export function isPastDailyCutoff(now: Date = new Date()): boolean {
  const cutoffMinutes = BOOKING_CUTOFF_HOUR * 60 + BOOKING_CUTOFF_MINUTE;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= cutoffMinutes;
}

/**
 * Format the cutoff time as HH:mm for display.
 */
export function formatCutoffTime(): string {
  const h = String(BOOKING_CUTOFF_HOUR).padStart(2, "0");
  const m = String(BOOKING_CUTOFF_MINUTE).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Returns true when a platform role bypasses the daily cutoff.
 */
export function canBypassBookingCutoff(
  platformRole: string | null | undefined,
): boolean {
  if (!platformRole) return false;
  return (BOOKING_CUTOFF_BYPASS_ROLES as readonly string[]).includes(
    platformRole,
  );
}
