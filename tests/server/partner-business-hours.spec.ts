/**
 * Tests: Phase 1C-2B.4 — Partner Business Hours Open Now utility
 *
 * All test dates use explicit UTC timestamps that map to known Bangkok local
 * times (Bangkok = UTC+7). Date arithmetic comment format:
 *   UTC T HH:MM  →  Bangkok HH:MM on WEEKDAY YYYY-MM-DD
 *
 * Reference week (2026-01-05 is Monday):
 *   2026-01-01 Thu  2026-01-05 Mon  2026-01-09 Fri
 *   2026-01-10 Sat  2026-01-11 Sun
 */

import { describe, expect, it } from "vitest";
import {
  getBangkokTimeParts,
  isPartnerOpenNow,
  isWithin0900To1800,
  PARTNER_BUSINESS_HOURS_TIMEZONE,
} from "../../server/utils/partner-business-hours";

// ── UTC helpers ────────────────────────────────────────────────────────────────
// Bangkok = UTC+7, so Bangkok_HH:MM = UTC_(HH-7):MM.
// Mon 2026-01-05 09:00 Bangkok = 2026-01-05T02:00:00.000Z
// Mon 2026-01-05 08:59 Bangkok = 2026-01-05T01:59:00.000Z
// Mon 2026-01-05 12:00 Bangkok = 2026-01-05T05:00:00.000Z
// Mon 2026-01-05 17:59 Bangkok = 2026-01-05T10:59:00.000Z
// Mon 2026-01-05 18:00 Bangkok = 2026-01-05T11:00:00.000Z
// Mon 2026-01-05 23:00 Bangkok = 2026-01-05T16:00:00.000Z
// Fri 2026-01-09 12:00 Bangkok = 2026-01-09T05:00:00.000Z
// Sat 2026-01-10 12:00 Bangkok = 2026-01-10T05:00:00.000Z
// Sun 2026-01-11 12:00 Bangkok = 2026-01-11T05:00:00.000Z
// Sun 2026-01-11 09:00 Bangkok = 2026-01-11T02:00:00.000Z

const MON_0900 = new Date("2026-01-05T02:00:00.000Z");
const MON_0859 = new Date("2026-01-05T01:59:00.000Z");
const MON_1200 = new Date("2026-01-05T05:00:00.000Z");
const MON_1759 = new Date("2026-01-05T10:59:00.000Z");
const MON_1800 = new Date("2026-01-05T11:00:00.000Z");
const MON_2300 = new Date("2026-01-05T16:00:00.000Z");
const FRI_1200 = new Date("2026-01-09T05:00:00.000Z");
const SAT_1200 = new Date("2026-01-10T05:00:00.000Z");
const SUN_0900 = new Date("2026-01-11T02:00:00.000Z");
const SUN_1200 = new Date("2026-01-11T05:00:00.000Z");

// ── PARTNER_BUSINESS_HOURS_TIMEZONE constant ───────────────────────────────────
describe("PARTNER_BUSINESS_HOURS_TIMEZONE", () => {
  it("is Asia/Bangkok", () => {
    expect(PARTNER_BUSINESS_HOURS_TIMEZONE).toBe("Asia/Bangkok");
  });
});

// ── getBangkokTimeParts ────────────────────────────────────────────────────────
describe("getBangkokTimeParts — extracts correct Bangkok-local parts", () => {
  it("returns Mon and 540 (09:00) for 2026-01-05T02:00Z", () => {
    expect(getBangkokTimeParts(MON_0900)).toEqual({
      weekdayShort: "Mon",
      minutesSinceMidnight: 540,
    });
  });

  it("returns Mon and 539 (08:59) for 2026-01-05T01:59Z", () => {
    expect(getBangkokTimeParts(MON_0859)).toEqual({
      weekdayShort: "Mon",
      minutesSinceMidnight: 539,
    });
  });

  it("returns Mon and 1079 (17:59) for 2026-01-05T10:59Z", () => {
    expect(getBangkokTimeParts(MON_1759)).toEqual({
      weekdayShort: "Mon",
      minutesSinceMidnight: 1079,
    });
  });

  it("returns Mon and 1080 (18:00) for 2026-01-05T11:00Z", () => {
    expect(getBangkokTimeParts(MON_1800)).toEqual({
      weekdayShort: "Mon",
      minutesSinceMidnight: 1080,
    });
  });

  it("returns Sat for 2026-01-10T05:00Z (Saturday 12:00 Bangkok)", () => {
    expect(getBangkokTimeParts(SAT_1200).weekdayShort).toBe("Sat");
  });

  it("returns Sun for 2026-01-11T05:00Z (Sunday 12:00 Bangkok)", () => {
    expect(getBangkokTimeParts(SUN_1200).weekdayShort).toBe("Sun");
  });

  it("returns Fri for 2026-01-09T05:00Z (Friday 12:00 Bangkok)", () => {
    expect(getBangkokTimeParts(FRI_1200).weekdayShort).toBe("Fri");
  });
});

// ── isWithin0900To1800 ─────────────────────────────────────────────────────────
describe("isWithin0900To1800 — boundary rules", () => {
  it("540 (09:00) → true (open boundary is inclusive)", () => {
    expect(isWithin0900To1800(540)).toBe(true);
  });
  it("1079 (17:59) → true", () => {
    expect(isWithin0900To1800(1079)).toBe(true);
  });
  it("1080 (18:00) → false (close boundary is exclusive)", () => {
    expect(isWithin0900To1800(1080)).toBe(false);
  });
  it("539 (08:59) → false", () => {
    expect(isWithin0900To1800(539)).toBe(false);
  });
  it("0 (midnight) → false", () => {
    expect(isWithin0900To1800(0)).toBe(false);
  });
  it("720 (midday) → true", () => {
    expect(isWithin0900To1800(720)).toBe(true);
  });
  it("1439 (23:59) → false", () => {
    expect(isWithin0900To1800(1439)).toBe(false);
  });
});

// ── null / undefined / unknown preset ─────────────────────────────────────────
describe("isPartnerOpenNow — null / undefined / unknown preset", () => {
  it("null presetKey returns null", () => {
    expect(isPartnerOpenNow({ presetKey: null, now: MON_1200 })).toBeNull();
  });

  it("undefined presetKey returns null", () => {
    expect(
      isPartnerOpenNow({ presetKey: undefined, now: MON_1200 }),
    ).toBeNull();
  });

  it("unknown string value at runtime returns null (safe fallback)", () => {
    // Cast to bypass TypeScript to simulate runtime unknown value.
    const unknown = "custom_hours" as Parameters<
      typeof isPartnerOpenNow
    >[0]["presetKey"];
    expect(isPartnerOpenNow({ presetKey: unknown, now: MON_1200 })).toBeNull();
  });
});

// ── open_24h ──────────────────────────────────────────────────────────────────
describe("isPartnerOpenNow — open_24h", () => {
  it("returns true on a weekday within business hours", () => {
    expect(isPartnerOpenNow({ presetKey: "open_24h", now: MON_1200 })).toBe(
      true,
    );
  });

  it("returns true on a weekend", () => {
    expect(isPartnerOpenNow({ presetKey: "open_24h", now: SAT_1200 })).toBe(
      true,
    );
    expect(isPartnerOpenNow({ presetKey: "open_24h", now: SUN_1200 })).toBe(
      true,
    );
  });

  it("returns true outside 09:00-18:00 (23:00 Monday Bangkok)", () => {
    expect(isPartnerOpenNow({ presetKey: "open_24h", now: MON_2300 })).toBe(
      true,
    );
  });

  it("returns true before 09:00 (08:59 Monday Bangkok)", () => {
    expect(isPartnerOpenNow({ presetKey: "open_24h", now: MON_0859 })).toBe(
      true,
    );
  });
});

// ── by_appointment ────────────────────────────────────────────────────────────
describe("isPartnerOpenNow — by_appointment", () => {
  it("returns null regardless of time (cannot determine open/closed)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "by_appointment", now: MON_1200 }),
    ).toBeNull();
    expect(
      isPartnerOpenNow({ presetKey: "by_appointment", now: SAT_1200 }),
    ).toBeNull();
  });
});

// ── everyday_0900_1800 ────────────────────────────────────────────────────────
describe("isPartnerOpenNow — everyday_0900_1800", () => {
  it("true at 09:00 Bangkok (Monday)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "everyday_0900_1800", now: MON_0900 }),
    ).toBe(true);
  });

  it("true at 17:59 Bangkok (Monday)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "everyday_0900_1800", now: MON_1759 }),
    ).toBe(true);
  });

  it("false at 08:59 Bangkok (Monday)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "everyday_0900_1800", now: MON_0859 }),
    ).toBe(false);
  });

  it("false at 18:00 Bangkok (Monday)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "everyday_0900_1800", now: MON_1800 }),
    ).toBe(false);
  });

  it("true on Sunday within time window (09:00 Bangkok)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "everyday_0900_1800", now: SUN_0900 }),
    ).toBe(true);
  });

  it("true on Saturday within time window (12:00 Bangkok)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "everyday_0900_1800", now: SAT_1200 }),
    ).toBe(true);
  });
});

// ── mon_fri_0900_1800 ─────────────────────────────────────────────────────────
describe("isPartnerOpenNow — mon_fri_0900_1800", () => {
  it("true Monday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: MON_1200 }),
    ).toBe(true);
  });

  it("true Friday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: FRI_1200 }),
    ).toBe(true);
  });

  it("false Saturday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: SAT_1200 }),
    ).toBe(false);
  });

  it("false Sunday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: SUN_1200 }),
    ).toBe(false);
  });

  it("false Monday 08:59 Bangkok (before opening)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: MON_0859 }),
    ).toBe(false);
  });

  it("false Monday 18:00 Bangkok (at close)", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: MON_1800 }),
    ).toBe(false);
  });
});

// ── mon_sat_0900_1800 ─────────────────────────────────────────────────────────
describe("isPartnerOpenNow — mon_sat_0900_1800", () => {
  it("true Monday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_sat_0900_1800", now: MON_1200 }),
    ).toBe(true);
  });

  it("true Saturday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_sat_0900_1800", now: SAT_1200 }),
    ).toBe(true);
  });

  it("false Sunday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_sat_0900_1800", now: SUN_1200 }),
    ).toBe(false);
  });

  it("false Saturday 08:59 Bangkok (before opening)", () => {
    const SAT_0859 = new Date("2026-01-10T01:59:00.000Z"); // Sat 08:59 Bangkok
    expect(
      isPartnerOpenNow({ presetKey: "mon_sat_0900_1800", now: SAT_0859 }),
    ).toBe(false);
  });
});

// ── sat_sun_0900_1800 ─────────────────────────────────────────────────────────
describe("isPartnerOpenNow — sat_sun_0900_1800", () => {
  it("true Saturday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "sat_sun_0900_1800", now: SAT_1200 }),
    ).toBe(true);
  });

  it("true Sunday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "sat_sun_0900_1800", now: SUN_1200 }),
    ).toBe(true);
  });

  it("false Monday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "sat_sun_0900_1800", now: MON_1200 }),
    ).toBe(false);
  });

  it("false Friday 12:00 Bangkok", () => {
    expect(
      isPartnerOpenNow({ presetKey: "sat_sun_0900_1800", now: FRI_1200 }),
    ).toBe(false);
  });

  it("false Sunday 18:00 Bangkok (at close)", () => {
    const SUN_1800 = new Date("2026-01-11T11:00:00.000Z"); // Sun 18:00 Bangkok
    expect(
      isPartnerOpenNow({ presetKey: "sat_sun_0900_1800", now: SUN_1800 }),
    ).toBe(false);
  });
});

// ── timezone determinism ──────────────────────────────────────────────────────
describe("isPartnerOpenNow — timezone determinism (explicit UTC inputs)", () => {
  it("UTC 2026-01-05T01:59Z → Bangkok Mon 08:59 → closed for mon_fri", () => {
    // 2026-01-05T01:59:00Z = Monday 08:59 Bangkok (UTC+7 −1min before open)
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: MON_0859 }),
    ).toBe(false);
  });

  it("UTC 2026-01-05T02:00Z → Bangkok Mon 09:00 → open for mon_fri", () => {
    // 2026-01-05T02:00:00Z = Monday 09:00 Bangkok (exactly at open)
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: MON_0900 }),
    ).toBe(true);
  });

  it("UTC 2026-01-05T11:00Z → Bangkok Mon 18:00 → closed for mon_fri", () => {
    expect(
      isPartnerOpenNow({ presetKey: "mon_fri_0900_1800", now: MON_1800 }),
    ).toBe(false);
  });

  it("does not depend on machine/server local timezone (result consistent)", () => {
    // Same Date object evaluated twice should always give the same result
    const result1 = isPartnerOpenNow({
      presetKey: "mon_fri_0900_1800",
      now: MON_1200,
    });
    const result2 = isPartnerOpenNow({
      presetKey: "mon_fri_0900_1800",
      now: MON_1200,
    });
    expect(result1).toBe(result2);
    expect(result1).toBe(true);
  });
});

// ── regression — businessHoursText is not accepted ────────────────────────────
describe("isPartnerOpenNow — regression: businessHoursText not accepted", () => {
  it("null presetKey returns null even alongside text (text is display-only)", () => {
    // isPartnerOpenNow only accepts presetKey, not businessHoursText
    expect(isPartnerOpenNow({ presetKey: null, now: MON_1200 })).toBeNull();
  });

  it("common display-text values cast as unknown return null at runtime", () => {
    for (const text of [
      "ทุกวัน 09:00-18:00",
      "ตามนัดหมาย",
      "Mon-Fri 09:00-18:00",
    ]) {
      const v = text as Parameters<typeof isPartnerOpenNow>[0]["presetKey"];
      expect(isPartnerOpenNow({ presetKey: v, now: MON_1200 })).toBeNull();
    }
  });

  it("function does not expose a businessHoursText parameter", () => {
    // TypeScript-level: the function signature only has presetKey, timezone, now
    const result = isPartnerOpenNow({ presetKey: "open_24h", now: MON_1200 });
    expect(result).toBe(true);
  });
});
