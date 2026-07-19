import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
  countQualifyingCustomerCancellations,
  evaluateBookingDepositRefundEligibility,
  isQualifyingCustomerCancellation,
  RENTAL_BOOKING_RESTRICTION_MESSAGE_TH,
  shouldRestrictForExcessiveCancellations,
} from "../../server/utils/rental-cancellation-policy";

const migration081 = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/081_customer_cancellation_refund_foundation.sql",
  ),
  "utf8",
);

describe("customer rental cancellation policy foundation", () => {
  it("uses Bangkok calendar-day logic for the 7-day Booking Deposit refund cutoff (§b tier, policy v2)", () => {
    const eligible = evaluateBookingDepositRefundEligibility({
      pickupDate: "2026-06-10",
      cancellationAt: "2026-06-03T16:59:59.000Z", // 2026-06-03 23:59:59 Bangkok
    });
    expect(eligible).toMatchObject({
      eligible: true,
      pickupLocalDate: "2026-06-10",
      cancellationLocalDate: "2026-06-03",
      refundCutoffLocalDate: "2026-06-03",
      policyVersion: BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
    });
    expect(BOOKING_DEPOSIT_REFUND_POLICY_VERSION).toBe(
      "booking_deposit_refund_calendar_day_v2",
    );

    const tooLate = evaluateBookingDepositRefundEligibility({
      pickupDate: "2026-06-10",
      cancellationAt: "2026-06-03T17:00:00.000Z", // 2026-06-04 00:00:00 Bangkok
    });
    expect(tooLate).toMatchObject({
      eligible: false,
      cancellationLocalDate: "2026-06-04",
      refundCutoffLocalDate: "2026-06-03",
    });
  });

  it("counts only qualifying customer web cancellations of confirmed paid bookings", () => {
    const events = [
      qualifying("2026-05-01T00:00:00.000Z"),
      qualifying("2026-04-01T00:00:00.000Z"),
      qualifying("2026-03-01T00:00:00.000Z"),
      qualifying("2026-02-01T00:00:00.000Z"),
      qualifying("2026-01-01T00:00:00.000Z"),
      qualifying("2025-12-01T00:00:00.000Z"),
      qualifying("2025-04-30T23:59:59.000Z"),
      {
        ...qualifying("2026-05-02T00:00:00.000Z"),
        cancellation_source: "admin_pos",
      },
      { ...qualifying("2026-05-03T00:00:00.000Z"), previous_status: "draft" },
      {
        ...qualifying("2026-05-04T00:00:00.000Z"),
        previous_booking_deposit_payment_status: "cancelled",
      },
      { ...qualifying("2026-05-05T00:00:00.000Z"), user_id: "other-user" },
    ];

    const result = countQualifyingCustomerCancellations({
      events,
      asOf: "2026-05-01T00:00:00.000Z",
      userId: "user-1",
    });

    expect(result.count).toBe(6);
    expect(shouldRestrictForExcessiveCancellations(5)).toBe(false);
    expect(shouldRestrictForExcessiveCancellations(result.count)).toBe(true);
  });

  it("honors explicit qualifies_for_restriction snapshots", () => {
    expect(
      isQualifyingCustomerCancellation({ qualifies_for_restriction: true }),
    ).toBe(true);
    expect(
      isQualifyingCustomerCancellation({
        qualifies_for_restriction: false,
        cancellation_initiator: "customer",
        cancellation_source: "customer_web",
        previous_status: "confirmed",
        previous_booking_deposit_payment_status: "paid",
      }),
    ).toBe(false);
  });

  it("keeps the locked Thai restriction support message available to backend guards", () => {
    expect(RENTAL_BOOKING_RESTRICTION_MESSAGE_TH).toContain(
      "บัญชีของคุณถูกจำกัดการจองเช่าชั่วคราว",
    );
    expect(RENTAL_BOOKING_RESTRICTION_MESSAGE_TH).toContain(
      "กรุณาติดต่อ HOPNIC",
    );
  });

  it("adds schema foundations without adding customer/admin runtime endpoints", () => {
    expect(migration081).toContain(
      "CREATE TABLE IF NOT EXISTS public.rental_booking_cancellation_events",
    );
    expect(migration081).toContain(
      "CREATE TABLE IF NOT EXISTS public.payment_refunds",
    );
    expect(migration081).toContain("rental_booking_restriction_status");
    expect(migration081).toContain("booking_deposit_refund_calendar_day_v1");
    expect(migration081).toContain("FOR ALL TO service_role");
    expect(migration081).not.toContain(
      'CREATE POLICY "payment_refunds_select_own"',
    );
  });

  it("keeps refund and booking cancellation foundations minimal and non-duplicative", () => {
    expect(migration081).toContain(
      "refund_proof_id UUID REFERENCES public.rental_booking_deposit_proofs",
    );
    expect(migration081).toContain(
      "original_mixed_payment_allocation_id UUID REFERENCES public.mixed_payment_allocations",
    );
    expect(migration081).not.toContain("proof_storage_bucket");
    expect(migration081).not.toContain("proof_storage_path");
    expect(migration081).not.toContain("proof_file_url");
    expect(migration081).not.toContain("original_mixed_payment_attempt_id");
    expect(migration081).not.toContain("cancellation_policy_snapshot");
  });
});

function qualifying(cancelledAt: string) {
  return {
    user_id: "user-1",
    cancelled_at: cancelledAt,
    cancellation_initiator: "customer",
    cancellation_source: "customer_web",
    previous_status: "confirmed",
    previous_booking_deposit_payment_status: "paid",
  };
}
