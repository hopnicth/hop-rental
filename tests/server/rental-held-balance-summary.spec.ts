import { describe, expect, it } from "vitest";
import { buildRentalHeldBalanceSummary } from "../../server/utils/rental-held-balance-summary";

function event(
  eventType: string,
  amount: number,
  extra: Record<string, unknown> = {},
) {
  return {
    rental_booking_id: "booking-1",
    event_type: eventType,
    amount,
    currency_code: "THB",
    status: "posted",
    ...extra,
  };
}

describe("rental held-balance summary", () => {
  it("summarizes booking deposit collection as held balance", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [event("booking_deposit_collection", 200)],
    });

    expect(summary.collections).toMatchObject({
      bookingDepositCollectedAmount: 200,
      totalHeldBalanceCollectedAmount: 200,
    });
    expect(summary.currentHeldBalanceAvailableAmount).toBe(200);
    expect(summary.state).toMatchObject({
      hasCanonicalEvents: true,
      eventCount: 1,
    });
  });

  it("separates booking deposit and pickup held-balance collections", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        event("pickup_held_balance_collection", 4800),
      ],
    });

    expect(summary.collections).toMatchObject({
      bookingDepositCollectedAmount: 200,
      pickupHeldBalanceCollectedAmount: 4800,
      totalHeldBalanceCollectedAmount: 5000,
    });
    expect(summary.currentHeldBalanceAvailableAmount).toBe(5000);
  });

  it("isolates same-day held-balance collection", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [event("same_day_held_balance_collection", 5200)],
    });

    expect(summary.collections).toMatchObject({
      sameDayHeldBalanceCollectedAmount: 5200,
      totalHeldBalanceCollectedAmount: 5200,
    });
  });

  it("reduces available balance for settlement application", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        event("pickup_held_balance_collection", 4800),
        event("settlement_application", 1000),
      ],
    });

    expect(summary.reductions).toMatchObject({
      settlementAppliedAmount: 1000,
      totalHeldBalanceReducedAmount: 1000,
    });
    expect(summary.currentHeldBalanceAvailableAmount).toBe(4000);
  });

  it("reduces available balance for refund", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [event("booking_deposit_collection", 200), event("refund", 50)],
    });

    expect(summary.reductions.refundedAmount).toBe(50);
    expect(summary.currentHeldBalanceAvailableAmount).toBe(150);
  });

  it("reduces available balance for forfeiture", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        event("forfeiture", 200),
      ],
    });

    expect(summary.reductions.forfeitedAmount).toBe(200);
    expect(summary.currentHeldBalanceAvailableAmount).toBe(0);
  });

  it("summarizes a mixed event sequence", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        event("pickup_held_balance_collection", 4800),
        event("same_day_held_balance_collection", 0),
        event("settlement_application", 1000),
        event("refund", 500),
        event("forfeiture", 100),
      ],
    });

    expect(summary.collections.totalHeldBalanceCollectedAmount).toBe(5000);
    expect(summary.reductions.totalHeldBalanceReducedAmount).toBe(1600);
    expect(summary.currentHeldBalanceAvailableAmount).toBe(3400);
  });

  it("ignores voided events", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        event("refund", 200, { status: "voided" }),
      ],
    });

    expect(summary.reductions.totalHeldBalanceReducedAmount).toBe(0);
    expect(summary.currentHeldBalanceAvailableAmount).toBe(200);
    expect(summary.state.eventCount).toBe(1);
  });

  it("warns when reductions exceed collections and returns negative available balance", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [event("booking_deposit_collection", 200), event("refund", 300)],
    });

    expect(summary.currentHeldBalanceAvailableAmount).toBe(-100);
    expect(summary.state.warnings.map((warning) => warning.code)).toContain(
      "HELD_BALANCE_NEGATIVE_AVAILABLE",
    );
  });

  it("warns when posted event currencies are mixed", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200, { currency_code: "THB" }),
        event("pickup_held_balance_collection", 100, { currency_code: "USD" }),
      ],
    });

    expect(summary.state.warnings.map((warning) => warning.code)).toContain(
      "HELD_BALANCE_MIXED_CURRENCY",
    );
  });

  it("does not use legacy booking money fields when canonical events exist", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        {
          rental_booking_id: "booking-1",
          status: "posted",
          event_type: "legacy_mock",
          booking_deposit_paid_amount: 9999,
          deposit_paid_amount: 9999,
          checkout_paid_amount: 9999,
          amount: 0,
          currency_code: "THB",
        },
      ],
    });

    expect(summary.collections.totalHeldBalanceCollectedAmount).toBe(200);
    expect(summary.state.warnings.map((warning) => warning.code)).toContain(
      "HELD_BALANCE_UNSUPPORTED_EVENT_TYPE",
    );
  });

  // ── Phase 2E-B1.5: remaining_security_deposit_collection ─────────────────────

  it("accumulates remaining_security_deposit_collection into pickupHeldBalanceCollectedAmount", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [event("remaining_security_deposit_collection", 4800)],
    });

    expect(summary.collections.pickupHeldBalanceCollectedAmount).toBe(4800);
    expect(summary.collections.totalHeldBalanceCollectedAmount).toBe(4800);
    expect(summary.currentHeldBalanceAvailableAmount).toBe(4800);
    expect(summary.state.warnings).toHaveLength(0);
  });

  it("accumulates remaining_security_deposit_collection alongside booking deposit (future booking path)", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [
        event("booking_deposit_collection", 200),
        event("remaining_security_deposit_collection", 4800),
      ],
    });

    expect(summary.collections.bookingDepositCollectedAmount).toBe(200);
    expect(summary.collections.pickupHeldBalanceCollectedAmount).toBe(4800);
    expect(summary.collections.totalHeldBalanceCollectedAmount).toBe(5000);
    expect(summary.currentHeldBalanceAvailableAmount).toBe(5000);
    expect(summary.state.warnings).toHaveLength(0);
  });

  it("accumulates remaining_security_deposit_collection alone (same-day full deposit path)", () => {
    const summary = buildRentalHeldBalanceSummary({
      rentalBookingId: "booking-1",
      events: [event("remaining_security_deposit_collection", 5000)],
    });

    expect(summary.collections.pickupHeldBalanceCollectedAmount).toBe(5000);
    expect(summary.collections.bookingDepositCollectedAmount).toBe(0);
    expect(summary.collections.totalHeldBalanceCollectedAmount).toBe(5000);
    expect(summary.state.warnings).toHaveLength(0);
  });
});
