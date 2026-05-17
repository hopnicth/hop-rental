import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRentalBookingDepositGatewayResult,
  assertBookingDepositAgreementAccepted,
  assertGatewayAmountMatchesBookingDeposit,
  canRetryBookingDepositPayment,
  computeBookingDepositLinesFromBooking,
  recordBookingDepositAgreementAcceptance,
  resolveActiveBookingDepositTerms,
} from "../../server/utils/rental-booking-deposit-payment";
import { confirmRentalBooking } from "~~/server/utils/rental-booking-confirmation";
import { recordPaymentAlert } from "~~/server/utils/payments";

vi.mock("~~/server/utils/rental-booking-confirmation", () => ({
  confirmRentalBooking: vi.fn(),
  loadRentalBookingForConfirmation: vi.fn(),
  validateRentalBookingForConfirmation: vi.fn(),
}));

vi.mock("~~/server/utils/payments", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/utils/payments")
  >("../../server/utils/payments");
  return { ...actual, recordPaymentAlert: vi.fn() };
});

type Row = Record<string, unknown>;

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "draft",
    rental_days: 5,
    rental_total: 2900,
    deposit_amount: 3000,
    currency_code: "THB",
    booking_deposit_payment_status: "pending",
    ...overrides,
  };
}

function paidCharge() {
  return {
    gatewayChargeId: "chrg_1",
    gatewaySourceId: "src_1",
    status: "paid" as const,
    amount: 200,
    currency: "THB",
    authorizeUri: null,
    qrImageUrl: null,
    expiresAt: null,
    failureCode: null,
    failureMessage: null,
    raw: { id: "chrg_1", amount: 20000, currency: "thb" },
  };
}

function fakeClient() {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> =
    [];
  return {
    updates,
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          const chain = {
            eq: () => chain,
            neq: () => chain,
            select: () => chain,
            single: async () => ({
              data: { id: "attempt-1", ...payload },
              error: null,
            }),
          };
          return chain;
        },
      };
    },
  };
}

function agreementClient(input: { canonical?: boolean } = {}) {
  const state = {
    agreement_acceptance_logs: [] as Row[],
    rental_booking_deposit_agreements: [] as Row[],
  };
  return {
    state,
    async rpc() {
      return input.canonical
        ? {
            data: [
              {
                id: "agreement-version-1",
                version: "booking_deposit_terms_v2",
                title: "Booking Deposit Terms v2",
                content_body: "Canonical Booking Deposit Terms",
                content_hash: "hash-1",
                rendered_text_hash: "rendered-hash-1",
              },
            ],
            error: null,
          }
        : { data: [], error: null };
    },
    from(table: string) {
      let insertPayload: Row | null = null;
      const filters: Array<[string, unknown]> = [];
      const rows = () => (state as any)[table] as Row[];
      const matching = () =>
        rows().filter((row) => filters.every(([k, v]) => row[k] === v));
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => (
          filters.push([key, value]),
          chain
        ),
        insert: (payload: Row) => {
          insertPayload = payload;
          return chain;
        },
        maybeSingle: async () => {
          if (insertPayload) {
            const row = { id: `${table}-1`, ...insertPayload };
            rows().push(row);
            return { data: row, error: null };
          }
          return { data: matching()[0] ?? null, error: null };
        },
        then: (resolveFn: any) => {
          if (insertPayload)
            rows().push({ id: `${table}-1`, ...insertPayload });
          return resolveFn({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

describe("rental booking deposit payment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires accepted Booking Deposit agreement", () => {
    expect(() => assertBookingDepositAgreementAccepted(false)).toThrow(
      /Booking Deposit agreement/i,
    );
    expect(() => assertBookingDepositAgreementAccepted(true)).not.toThrow();
  });

  it("falls back to legacy Booking Deposit Terms when no canonical version is published", async () => {
    const terms = await resolveActiveBookingDepositTerms(agreementClient());
    expect(terms.canonical).toBe(false);
    expect(terms.acceptedTermsVersion).toBe("booking_deposit_terms_v1");
    expect(terms.termsSnapshot).toContain("เงินมัดจำจอง");
  });

  it("records canonical agreement acceptance when active Booking Deposit Terms exist", async () => {
    const client = agreementClient({ canonical: true });
    const terms = await recordBookingDepositAgreementAcceptance({
      client,
      bookingId: "booking-1",
      userId: "user-1",
      paymentAttemptId: "attempt-1",
      acceptedAt: "2026-06-01T00:00:00.000Z",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });
    expect(terms).toMatchObject({
      canonical: true,
      acceptedTermsVersion: "booking_deposit_terms_v2",
      acceptanceLogId: "agreement_acceptance_logs-1",
    });
    expect(client.state.agreement_acceptance_logs[0]).toMatchObject({
      agreement_type: "booking_deposit_terms",
      source_type: "rental_booking_payment_attempt",
    });
    expect(client.state.rental_booking_deposit_agreements[0]).toMatchObject({
      agreement_version_id: "agreement-version-1",
      agreement_acceptance_log_id: "agreement_acceptance_logs-1",
      accepted_terms_version: "booking_deposit_terms_v2",
      terms_snapshot: "Canonical Booking Deposit Terms",
    });
  });

  it("calculates 200 THB Booking Deposit for rentals up to 30 days", () => {
    const { bookingDeposit, summary } = computeBookingDepositLinesFromBooking({
      booking: booking({
        rental_days: 30,
        rental_total: 1000,
        deposit_amount: 5000,
      }),
    });
    expect(bookingDeposit.grossAmount).toBe(200);
    expect(summary.bookingDepositDueNow).toBe(200);
    expect(summary.remainingSecurityDepositDueAtPickup).toBe(4800);
  });

  it("calculates 1,000 THB Booking Deposit for rentals over 30 days", () => {
    const { bookingDeposit, summary } = computeBookingDepositLinesFromBooking({
      booking: booking({
        rental_days: 31,
        rental_total: 1000,
        deposit_amount: 5000,
      }),
    });
    expect(bookingDeposit.grossAmount).toBe(1000);
    expect(summary.bookingDepositDueNow).toBe(1000);
    expect(summary.remainingSecurityDepositDueAtPickup).toBe(4000);
  });

  it("caps server-computed Booking Deposit at required security deposit", () => {
    const { bookingDeposit, summary } = computeBookingDepositLinesFromBooking({
      booking: booking({
        rental_days: 31,
        rental_total: 1000,
        deposit_amount: 500,
      }),
    });
    expect(bookingDeposit.grossAmount).toBe(500);
    expect(summary.bookingDepositDueNow).toBe(500);
    expect(summary.remainingSecurityDepositDueAtPickup).toBe(0);
  });

  it("validates gateway amount against booking_deposit only", () => {
    assertGatewayAmountMatchesBookingDeposit(200, "THB", {
      amount: 20000,
      currency: "thb",
    });
    expect(() =>
      assertGatewayAmountMatchesBookingDeposit(200, "THB", {
        amount: 500000,
        currency: "thb",
      }),
    ).toThrow(/PAYMENT_AMOUNT_MISMATCH/);
  });

  it("marks Booking Deposit paid and calls confirm logic without direct confirmed update", async () => {
    vi.mocked(confirmRentalBooking).mockResolvedValue({
      id: "booking-1",
      status: "confirmed",
    });
    const client = fakeClient();

    await applyRentalBookingDepositGatewayResult({
      client,
      booking: booking(),
      attempt: {
        id: "attempt-1",
        booking_id: "booking-1",
        amount: 200,
        method: "promptpay",
      },
      result: paidCharge(),
    });

    expect(confirmRentalBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking-1",
        userId: "user-1",
        requireBookingDepositPaid: true,
      }),
    );
    expect(client.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "rental_bookings",
          payload: expect.objectContaining({
            booking_deposit_payment_status: "paid",
          }),
        }),
      ]),
    );
    expect(
      client.updates.some((update) => update.payload.status === "confirmed"),
    ).toBe(false);
  });

  it("moves paid-but-unconfirmed bookings to admin review state", async () => {
    vi.mocked(confirmRentalBooking).mockRejectedValue(
      new Error("availability conflict"),
    );
    const client = fakeClient();

    await applyRentalBookingDepositGatewayResult({
      client,
      booking: booking(),
      attempt: {
        id: "attempt-1",
        booking_id: "booking-1",
        amount: 200,
        method: "promptpay",
      },
      result: paidCharge(),
    });

    expect(client.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "rental_bookings",
          payload: expect.objectContaining({
            booking_deposit_payment_status: "paid_confirm_failed",
          }),
        }),
      ]),
    );
    expect(recordPaymentAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "booking_deposit_confirm_failed" }),
    );
  });

  it("allows retry for expired or failed unpaid draft Booking Deposit attempts", () => {
    expect(
      canRetryBookingDepositPayment({
        booking: booking({ booking_deposit_payment_status: "expired" }),
        latestAttempt: { status: "expired" },
      }),
    ).toBe(true);
    expect(
      canRetryBookingDepositPayment({
        booking: booking({ booking_deposit_payment_status: "failed" }),
        latestAttempt: { status: "failed" },
      }),
    ).toBe(true);
  });

  it("does not retry duplicate paid Booking Deposit attempts", () => {
    expect(
      canRetryBookingDepositPayment({
        booking: booking({ booking_deposit_payment_status: "paid" }),
        latestAttempt: { status: "expired" },
      }),
    ).toBe(false);
    expect(
      canRetryBookingDepositPayment({
        booking: booking({
          status: "confirmed",
          booking_deposit_payment_status: "paid",
        }),
        latestAttempt: { status: "failed" },
      }),
    ).toBe(false);
  });
});
