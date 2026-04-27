/**
 * Booking-related runtime configuration.
 *
 * Centralizing these values lets us change them without touching the booking
 * UI, and keeps Phase 1 (global cutoff) and an eventual Phase 2 (per-branch
 * calendar) decoupled from concrete numbers.
 */

/**
 * Daily booking cutoff time (24h, local time).
 *
 * After this moment of day, customers cannot start a rental on the same day
 * — the earliest selectable start date becomes tomorrow. Platform staff and
 * super admins bypass this check.
 */
export const BOOKING_CUTOFF_HOUR = 15;
export const BOOKING_CUTOFF_MINUTE = 30;

/**
 * Platform roles that may bypass the daily cutoff.
 */
export const BOOKING_CUTOFF_BYPASS_ROLES = ["super_admin", "staff"] as const;

export type BookingCutoffBypassRole =
  (typeof BOOKING_CUTOFF_BYPASS_ROLES)[number];
