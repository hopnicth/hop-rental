import { describe, expect, it, vi } from "vitest";
import {
  buildRentalMoneySummary,
  buildRentalSettlementPreview,
} from "../../server/utils/rental-money-summary";

const mockState = vi.hoisted(() => ({
  routerParams: {} as Record<string, string>,
  booking: null as Record<string, unknown> | null,
  paymentLines: [] as Array<Record<string, unknown>>,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: (_event: unknown, name: string) =>
    mockState.routerParams[name],
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({
    adminClient: {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          maybeSingle: async () =>
            table === "rental_bookings"
              ? { data: mockState.booking, error: null }
              : { data: null, error: null },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve(
              table === "rental_booking_payment_lines"
                ? { data: mockState.paymentLines, error: null }
                : { data: [], error: null },
            ).then(resolve),
        };
        return chain;
      },
    },
    userId: "staff-1",
    platformRole: "staff",
  }),
}));

const endpoint = (
  await import("../../server/api/admin/rental-bookings/[id]/money-summary.get")
).default;

function booking(extra: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    status: "confirmed",
    asset_code: "CAM-1",
    product_name: "Camera",
    rental_days: 5,
    currency_code: "THB",
    rental_total: 10000,
    deposit_amount: 5000,
    deposit_paid_amount: 0,
    deposit_payment_status: "paid",
    booking_deposit_payment_status: "paid",
    booking_deposit_paid_amount: 200,
    checkout_paid_amount: 0,
    ...extra,
  };
}

function line(
  lineType: string,
  grossAmount: number,
  extra: Record<string, unknown> = {},
) {
  const isDeposit = ["booking_deposit", "refundable_security_deposit"].includes(
    lineType,
  );
  const whtAmount = Number(extra.wht_amount ?? 0);
  return {
    line_type: lineType,
    tax_category:
      lineType === "rental_fee"
        ? "rental_income"
        : lineType === "booking_deposit"
          ? "partial_refundable_security_deposit"
          : lineType === "late_fee"
            ? "penalty_income"
            : lineType === "damage_fee"
              ? "damage_compensation"
              : "refundable_security_deposit",
    description_th: lineType,
    description_en: lineType,
    gross_amount: grossAmount,
    wht_applicable: whtAmount > 0,
    wht_rate: whtAmount > 0 ? 0.05 : 0,
    wht_amount: whtAmount,
    net_payable_amount: grossAmount - whtAmount,
    is_refundable: isDeposit,
    wht_certificate_required: whtAmount > 0,
    applies_to_security_deposit: isDeposit,
    reduces_remaining_security_deposit: lineType === "booking_deposit",
    status: "active",
    source: "system",
    metadata:
      lineType === "booking_deposit" ? { securityDepositRequired: 5000 } : {},
    ...extra,
  };
}

function baseLines(extra: Array<Record<string, unknown>> = []) {
  return [
    line("rental_fee", 10000, { wht_amount: 500 }),
    line("booking_deposit", 200),
    line("refundable_security_deposit", 4800),
    ...extra,
  ];
}

describe("rental money summary", () => {
  it("keeps booking deposit, refundable security deposit, and rental fee separate", () => {
    const summary = buildRentalMoneySummary({
      booking: booking(),
      paymentLines: baseLines(),
    });

    expect(summary.bookingDeposit).toMatchObject({
      expectedAmount: 200,
      paidAmount: 200,
      appliedToSecurityDepositAmount: 200,
      isRevenue: false,
    });
    expect(summary.refundableSecurityDeposit).toMatchObject({
      expectedTotalAmount: 5000,
      coveredByBookingDepositAmount: 200,
      remainingDueAtPickupAmount: 4800,
      isRevenue: false,
    });
    expect(summary.rentalFee).toMatchObject({
      expectedGrossAmount: 10000,
      expectedNetPayableAmount: 9500,
      whtApplicable: true,
      whtRate: 0.05,
      whtAmount: 500,
      whtCertificateRequired: true,
      taxCategory: "rental_income",
      isRevenue: true,
    });
    // Rental fee is deferred to return — totalPickupDueAmount = remaining security deposit only.
    expect(summary.pickupDue).toMatchObject({
      rentalFeeDueAmount: 9500,
      remainingSecurityDepositDueAmount: 4800,
      totalPickupDueAmount: 4800,
    });
  });

  it("rental fee outstanding does NOT increase totalPickupDueAmount — pickup gate is deposit-only", () => {
    // booking() default has checkout_paid_amount = 0 (rental fee unpaid / deferred).
    // baseLines() has rental_fee 10000 (9500 net after WHT), booking_deposit 200, security_deposit 4800.
    const summary = buildRentalMoneySummary({
      booking: booking(),
      paymentLines: baseLines(),
    });

    expect(summary.rentalFee.outstandingAmount).toBeGreaterThan(0);
    expect(summary.refundableSecurityDeposit.remainingDueAtPickupAmount).toBe(
      4800,
    );
    // totalPickupDueAmount = remaining security deposit only — rental fee must NOT be included.
    expect(summary.pickupDue.totalPickupDueAmount).toBe(4800);
    expect(summary.pickupDue.rentalFeeDueAmount).toBeGreaterThan(0);
  });

  it("remaining security deposit due is reflected in totalPickupDueAmount (deposit-only gate)", () => {
    // Scenario: booking deposit paid = 0 → full security deposit of 5000 still outstanding.
    const summary = buildRentalMoneySummary({
      booking: booking({ booking_deposit_paid_amount: 0 }),
      paymentLines: [
        line("rental_fee", 10000, { wht_amount: 500 }),
        line("refundable_security_deposit", 5000),
      ],
    });

    expect(summary.refundableSecurityDeposit.remainingDueAtPickupAmount).toBe(
      5000,
    );
    expect(summary.pickupDue.totalPickupDueAmount).toBe(5000);
  });

  it("warns instead of silently trusting legacy bookings without payment lines", () => {
    const summary = buildRentalMoneySummary({
      booking: booking(),
      paymentLines: [],
    });

    expect(summary.source).toMatchObject({
      hasPaymentLines: false,
      legacyFallbackUsed: true,
    });
    expect(summary.warnings.map((warning) => warning.code)).toContain(
      "missing_payment_lines",
    );
  });

  it("warns and sums duplicate active lines where detectable", () => {
    const summary = buildRentalMoneySummary({
      booking: booking({ rental_total: 11000 }),
      paymentLines: baseLines([line("rental_fee", 1000)]),
    });

    expect(summary.rentalFee.expectedGrossAmount).toBe(11000);
    expect(summary.warnings.map((warning) => warning.code)).toContain(
      "duplicate_active_line",
    );
  });

  it("warns when deposit lines contain WHT/non-refundable conflicts", () => {
    const summary = buildRentalMoneySummary({
      booking: booking(),
      paymentLines: baseLines([
        line("refundable_security_deposit", 100, {
          wht_applicable: true,
          wht_amount: 5,
          net_payable_amount: 95,
        }),
      ]),
    });

    expect(summary.warnings.map((warning) => warning.code)).toContain(
      "line_semantics_conflict",
    );
  });
});

describe("rental settlement preview", () => {
  it("computes refund due when held deposit exceeds deductions", () => {
    const paymentLines = baseLines([
      line("damage_fee", 1000),
      line("late_fee", 500),
    ]);
    const summary = buildRentalMoneySummary({
      booking: booking({ status: "picked_up", checkout_paid_amount: 14300 }),
      paymentLines,
    });
    const preview = buildRentalSettlementPreview({ summary, paymentLines });

    expect(preview.depositHeld.amount).toBe(5000);
    expect(preview.deductions.totalAmount).toBe(1500);
    expect(preview.totals).toMatchObject({
      heldDepositAmount: 5000,
      totalDeductionAmount: 1500,
      refundDueAmount: 3500,
      extraDueAmount: 0,
    });
  });

  it("computes extra due when deductions exceed held deposit", () => {
    const paymentLines = baseLines([line("damage_fee", 6500)]);
    const summary = buildRentalMoneySummary({
      booking: booking({ status: "picked_up", checkout_paid_amount: 14300 }),
      paymentLines,
    });
    const preview = buildRentalSettlementPreview({ summary, paymentLines });

    expect(preview.totals).toMatchObject({
      refundDueAmount: 0,
      extraDueAmount: 1500,
    });
  });

  it("surfaces limitation warnings when canonical deduction lines are absent", () => {
    const summary = buildRentalMoneySummary({
      booking: booking({ status: "picked_up", checkout_paid_amount: 14300 }),
      paymentLines: baseLines(),
    });
    const preview = buildRentalSettlementPreview({
      summary,
      paymentLines: baseLines(),
    });

    expect(preview.deductions.totalAmount).toBe(0);
    expect(preview.warnings.map((warning) => warning.code)).toContain(
      "settlement_data_limited",
    );
  });
});

describe("admin rental booking money-summary endpoint", () => {
  it("returns read-only money summary and settlement preview sections", async () => {
    mockState.routerParams = { id: "booking-1" };
    mockState.booking = booking();
    mockState.paymentLines = baseLines();

    const result = await endpoint({});

    expect(result).toHaveProperty("moneySummary");
    expect(result).toHaveProperty("settlementPreview");
    expect(result.moneySummary.booking.id).toBe("booking-1");
    expect(result.settlementPreview.totals.totalDeductionAmount).toBe(0);
  });
});
