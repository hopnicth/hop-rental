/**
 * Tests: Rental Section Split UI — /user/rentals
 *
 * Covers:
 *  1. Status constants declared correctly (ACTIVE / TERMINAL)
 *  2. currentRentals computed: status-only, no date comparison
 *  3. historicalRentals computed: status-only, no date comparison
 *  4. allDisplayedBookings watcher replaces old sortedBookings watcher
 *  5. i18n keys present for section headers, descriptions, and empty states
 *  6. Template: section headers, descriptions, opacity-80 for historical
 *  7. Sort toggle gated on currentRentals (not allDisplayedBookings)
 *  8. No date-based grouping logic (no isPickupDatePast / isPickupPastWithActiveStatus)
 *  9. All pre-existing required patterns still present (regression guard)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rentalsPage = readFileSync(
  resolve(process.cwd(), "app/pages/user/rentals/index.vue"),
  "utf8",
);

describe("Rental section split — status constants", () => {
  it('declares ACTIVE_STATUSES: ["draft", "confirmed", "picked_up"]', () => {
    expect(rentalsPage).toContain(
      'ACTIVE_STATUSES: BookingStatus[] = ["draft", "confirmed", "picked_up"]',
    );
  });

  it('declares TERMINAL_STATUSES: ["cancelled", "returned", "no_show"]', () => {
    expect(rentalsPage).toContain(
      'TERMINAL_STATUSES: BookingStatus[] = ["cancelled", "returned", "no_show"]',
    );
  });
});

describe("Rental section split — computeds (status-only grouping)", () => {
  it("currentRentals filters by ACTIVE_STATUSES only — no date check", () => {
    expect(rentalsPage).toContain("const currentRentals = computed(");
    expect(rentalsPage).toContain("ACTIVE_STATUSES.includes(b.status)");
    expect(rentalsPage).not.toContain(
      "ACTIVE_STATUSES.includes(b.status) && !isPickupDatePast(b)",
    );
  });

  it("historicalRentals filters by TERMINAL_STATUSES only — no date check", () => {
    expect(rentalsPage).toContain("const historicalRentals = computed(");
    expect(rentalsPage).toContain("TERMINAL_STATUSES.includes(b.status)");
    expect(rentalsPage).not.toContain(
      "TERMINAL_STATUSES.includes(b.status) || isPickupDatePast(b)",
    );
  });

  it("defines allDisplayedBookings as currentRentals + historicalRentals", () => {
    expect(rentalsPage).toContain("const allDisplayedBookings = computed(");
    expect(rentalsPage).toContain("...currentRentals.value");
    expect(rentalsPage).toContain("...historicalRentals.value");
  });

  it("historicalRentals uses compareBookingsByPickupDateDesc for sort", () => {
    expect(rentalsPage).toContain(".sort(compareBookingsByPickupDateDesc)");
  });
});

describe("Rental section split — no date-based grouping logic", () => {
  it("does not define isPickupDatePast", () => {
    expect(rentalsPage).not.toContain("function isPickupDatePast(");
  });

  it("does not define isPickupPastWithActiveStatus", () => {
    expect(rentalsPage).not.toContain("function isPickupPastWithActiveStatus(");
  });

  it("does not render a pickup-date-passed badge", () => {
    expect(rentalsPage).not.toContain("isPickupPastWithActiveStatus(booking)");
    expect(rentalsPage).not.toContain('"rentalsPage.pickupDatePassed"');
  });
});

describe("Rental section split — watcher", () => {
  it("refundProof watcher iterates allDisplayedBookings, not sortedBookings", () => {
    expect(rentalsPage).toContain(
      "allDisplayedBookings.value.map((booking) => booking.bookingId)",
    );
    expect(rentalsPage).not.toContain(
      "sortedBookings.value.map((booking) => booking.bookingId)",
    );
    expect(rentalsPage).not.toContain("sortedBookings");
  });
});

describe("Rental section split — template sections", () => {
  it("renders current section header with i18n key", () => {
    expect(rentalsPage).toContain('t("rentalsPage.currentSection")');
  });

  it("renders current section description with i18n key", () => {
    expect(rentalsPage).toContain('t("rentalsPage.currentSectionDesc")');
  });

  it("renders historical section header with i18n key", () => {
    expect(rentalsPage).toContain('t("rentalsPage.historicalSection")');
  });

  it("renders historical section description with i18n key", () => {
    expect(rentalsPage).toContain('t("rentalsPage.historicalSectionDesc")');
  });

  it("historical section cards carry opacity-80 class", () => {
    expect(rentalsPage).toContain("opacity-80");
  });

  it("sort toggle is gated on currentRentals.length", () => {
    expect(rentalsPage).toContain('v-if="currentRentals.length > 0"');
  });

  it("loading skeleton and empty state use allDisplayedBookings.length", () => {
    expect(rentalsPage).toContain("allDisplayedBookings.length === 0");
  });
});

describe("Rental section split — i18n keys in all locale files", () => {
  const locales = ["en", "th", "cn", "jp"];
  const requiredKeys = [
    '"currentSection"',
    '"currentSectionDesc"',
    '"historicalSection"',
    '"historicalSectionDesc"',
    '"noCurrentRentals"',
    '"noHistoricalRentals"',
  ];

  it.each(locales)("%s.json has all required section keys", (locale) => {
    const src = readFileSync(
      resolve(process.cwd(), `i18n/locales/${locale}.json`),
      "utf8",
    );
    for (const key of requiredKeys) {
      expect(src, `${locale}.json missing key ${key}`).toContain(key);
    }
  });

  it("th.json has real Thai for historicalSection (not NEEDS_TRANSLATION)", () => {
    const th = readFileSync(
      resolve(process.cwd(), "i18n/locales/th.json"),
      "utf8",
    );
    const match = th.match(/"historicalSection":\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain("[NEEDS_TRANSLATION]");
  });

  it("th.json historicalSection uses the correct label (สิ้นสุดแล้ว not เลยวันรับ)", () => {
    const th = readFileSync(
      resolve(process.cwd(), "i18n/locales/th.json"),
      "utf8",
    );
    expect(th).toContain('"historicalSection"');
    expect(th).toContain("สิ้นสุดแล้ว");
    expect(th).not.toContain('"historicalSection": "ประวัติการเช่าและรายการที่เลยวันรับ"');
  });
});

// ── Regression guard: pre-existing required patterns must still be present ──
describe("Rental section split — regression guard", () => {
  const required = [
    "compareBookingsByPickupDate",
    "pickupSortDirection",
    "togglePickupSort",
    "rentalsPage.sortByPickup",
    "sortPickupEarliest",
    "sortPickupLatest",
    "pickupDayNumber(booking)",
    "pickupDayClass(booking)",
    "isPickupTomorrow(booking)",
    "rentalsPage.pickupTomorrowBadge",
    "border-error/80",
    'timeZone: "Asia/Bangkok"',
    "goToDetail(booking)",
    "goToCancelRefund(booking)",
    "canRequestCancellationRefund(booking)",
    "/api/user/rental-bookings/refund-proof-status",
    "goToRefundProof(booking)",
    "rentalsPage.detail.viewRefundProof",
  ];

  it.each(required)("still contains: %s", (pattern) => {
    expect(rentalsPage).toContain(pattern);
  });

  it("does not contain direct booking status mutation", () => {
    expect(rentalsPage).not.toContain(
      'updateBookingStatus(target.bookingId, "cancelled")',
    );
  });
});
