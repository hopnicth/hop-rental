/**
 * Partner Business Hours — Open Now utility.
 *
 * Pure, deterministic utility for evaluating whether a partner is open at a
 * given instant, based on a machine-readable businessHoursPresetKey.
 *
 * Timezone: MVP always evaluates in Asia/Bangkok (UTC+7). The `timezone`
 * argument on isPartnerOpenNow is accepted for future API compatibility but
 * is ignored in this version — all time comparisons use Bangkok local time.
 *
 * Day-of-week convention: en-US locale short weekday names are used
 * ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat") — NOT the JS numeric
 * weekday (0 = Sunday) and NOT ISO numeric weekday (1 = Monday).
 *
 * Boundary rule: 09:00 is open, 17:59 is open, 18:00 is closed, 08:59 closed.
 * Overnight hours are not supported.
 */

import type { PartnerBusinessHoursPresetKey } from "~/types/partner";

export const PARTNER_BUSINESS_HOURS_TIMEZONE = "Asia/Bangkok";

/** Minutes-since-midnight for the open boundary (09:00 = 540). */
const OPEN_MINUTES = 9 * 60; // 540

/** Minutes-since-midnight for the close boundary (18:00 = 1080, exclusive). */
const CLOSE_MINUTES = 18 * 60; // 1080

// Pre-built day sets (en-US weekday short names).
const MON_TO_FRI = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const MON_TO_SAT = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const SAT_AND_SUN = new Set(["Sat", "Sun"]);

/**
 * Intl formatter that extracts Bangkok-local weekday + time parts.
 * hourCycle "h23" ensures hour ranges 0–23 (midnight = 00, never "24").
 */
const bangkokFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARTNER_BUSINESS_HOURS_TIMEZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Extract the Bangkok-local weekday short name and minutes-since-midnight
 * from a UTC Date object.
 *
 * Exported for unit testing; not intended for direct use by callers.
 */
export function getBangkokTimeParts(now: Date): {
  weekdayShort: string;
  minutesSinceMidnight: number;
} {
  const parts = bangkokFormatter.formatToParts(now);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekdayShort, minutesSinceMidnight: hour * 60 + minute };
}

/**
 * True if minutesSinceMidnight falls within [09:00, 18:00).
 * 09:00 (540) → true.  17:59 (1079) → true.  18:00 (1080) → false.
 *
 * Exported for unit testing.
 */
export function isWithin0900To1800(minutesSinceMidnight: number): boolean {
  return (
    minutesSinceMidnight >= OPEN_MINUTES &&
    minutesSinceMidnight < CLOSE_MINUTES
  );
}

/**
 * Determine whether a partner is open right now.
 *
 * @returns
 *   `true`  — partner is open
 *   `false` — partner is closed
 *   `null`  — cannot determine (null/undefined preset, by_appointment, unknown key)
 */
export function isPartnerOpenNow(args: {
  presetKey: PartnerBusinessHoursPresetKey | null | undefined;
  /** Reserved for future multi-timezone support. Ignored in MVP (always Bangkok). */
  timezone?: string | null;
  /** Override the current instant for testing. Defaults to new Date(). */
  now?: Date;
}): boolean | null {
  const { presetKey, now = new Date() } = args;

  if (presetKey == null) return null;
  if (presetKey === "open_24h") return true;
  if (presetKey === "by_appointment") return null;

  const { weekdayShort, minutesSinceMidnight } = getBangkokTimeParts(now);

  switch (presetKey) {
    case "everyday_0900_1800":
      return isWithin0900To1800(minutesSinceMidnight);

    case "mon_fri_0900_1800":
      return (
        MON_TO_FRI.has(weekdayShort) &&
        isWithin0900To1800(minutesSinceMidnight)
      );

    case "mon_sat_0900_1800":
      return (
        MON_TO_SAT.has(weekdayShort) &&
        isWithin0900To1800(minutesSinceMidnight)
      );

    case "sat_sun_0900_1800":
      return (
        SAT_AND_SUN.has(weekdayShort) &&
        isWithin0900To1800(minutesSinceMidnight)
      );

    default:
      // Runtime safety net for unknown preset keys at JS boundaries.
      return null;
  }
}
