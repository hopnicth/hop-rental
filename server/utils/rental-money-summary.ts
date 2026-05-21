import { createError } from "h3";
import type {
  RentalPaymentLine,
  RentalPaymentLineType,
  RentalPaymentTaxCategory,
} from "~~/app/types/rental-payment-line";
import { calculateBookingDepositDueNow } from "~~/app/utils/rental-payment-lines";

type Row = Record<string, unknown>;

export type RentalMoneyWarningCode =
  | "missing_payment_lines"
  | "missing_expected_line"
  | "duplicate_active_line"
  | "inconsistent_booking_total"
  | "legacy_limited_interpretation"
  | "line_semantics_conflict"
  | "settlement_data_limited"
  | "booking_not_return_eligible";

export interface RentalMoneyWarning {
  code: RentalMoneyWarningCode;
  message: string;
  severity: "info" | "warning";
  context?: Record<string, unknown>;
}

export interface RentalMoneySummary {
  booking: {
    id: string;
    reference: string;
    status: string;
    currencyCode: string;
  };
  bookingDeposit: {
    expectedAmount: number;
    paidAmount: number;
    paymentStatus: string | null;
    appliedToSecurityDepositAmount: number;
    isRevenue: false;
  };
  refundableSecurityDeposit: {
    expectedTotalAmount: number;
    coveredByBookingDepositAmount: number;
    remainingDueAtPickupAmount: number;
    heldAmount: number;
    isRevenue: false;
  };
  rentalFee: {
    expectedGrossAmount: number;
    expectedNetPayableAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    whtApplicable: boolean;
    whtRate: number;
    whtAmount: number;
    whtCertificateRequired: boolean;
    taxCategory: string | null;
    isRevenue: true;
  };
  pickupDue: {
    rentalFeeDueAmount: number;
    remainingSecurityDepositDueAmount: number;
    totalPickupDueAmount: number;
  };
  source: {
    hasPaymentLines: boolean;
    activePaymentLineCount: number;
    legacyFallbackUsed: boolean;
  };
  warnings: RentalMoneyWarning[];
}

export interface RentalSettlementDeduction {
  lineType: "damage_fee" | "late_fee";
  label: string;
  amount: number;
  taxCategory: string;
  source: "rental_booking_payment_line";
}

export interface RentalSettlementPreview {
  booking: RentalMoneySummary["booking"];
  depositHeld: {
    amount: number;
    bookingDepositContributionAmount: number;
  };
  deductions: {
    items: RentalSettlementDeduction[];
    totalAmount: number;
  };
  totals: {
    heldDepositAmount: number;
    totalDeductionAmount: number;
    refundDueAmount: number;
    extraDueAmount: number;
  };
  returnEligibility: {
    isCleanlyReturnEligible: boolean;
    expectedStatuses: string[];
    actualStatus: string;
  };
  warnings: RentalMoneyWarning[];
}

const RETURN_ELIGIBLE_STATUSES = new Set(["picked_up", "returned"]);
const DEDUCTION_LINE_TYPES = new Set<RentalPaymentLineType>([
  "damage_fee",
  "late_fee",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01;
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPosV3SameDayLine(line: RentalPaymentLine): boolean {
  return (
    line.source === "pos_v3_same_day_quote" ||
    text(line.metadata.bookingDepositPolicy) === "not_applicable_same_day"
  );
}

export function mapRentalPaymentLineRow(row: unknown): RentalPaymentLine {
  const r = asMetadata(row);
  return {
    lineType: text(r.line_type) as RentalPaymentLineType,
    taxCategory: text(r.tax_category) as RentalPaymentTaxCategory,
    descriptionTh: text(r.description_th),
    descriptionEn: text(r.description_en),
    grossAmount: money(r.gross_amount),
    whtApplicable: r.wht_applicable === true,
    whtRate: Number(r.wht_rate ?? 0) || 0,
    whtAmount: money(r.wht_amount),
    netPayableAmount: money(r.net_payable_amount),
    isRefundable: r.is_refundable === true,
    whtCertificateRequired: r.wht_certificate_required === true,
    appliesToSecurityDeposit: r.applies_to_security_deposit === true,
    reducesRemainingSecurityDeposit:
      r.reduces_remaining_security_deposit === true,
    status: text(r.status) === "voided" ? "voided" : "active",
    source: text(r.source) as RentalPaymentLine["source"],
    metadata: asMetadata(r.metadata),
  };
}

function sumLines(lines: RentalPaymentLine[], type: RentalPaymentLineType) {
  return lines
    .filter((line) => line.lineType === type)
    .reduce(
      (sum, line) => ({
        gross: money(sum.gross + line.grossAmount),
        net: money(sum.net + line.netPayableAmount),
        wht: money(sum.wht + line.whtAmount),
      }),
      { gross: 0, net: 0, wht: 0 },
    );
}

function firstLine(lines: RentalPaymentLine[], type: RentalPaymentLineType) {
  return lines.find((line) => line.lineType === type) ?? null;
}

function pushWarning(
  warnings: RentalMoneyWarning[],
  warning: RentalMoneyWarning,
) {
  warnings.push(warning);
}

export function buildRentalMoneySummary(input: {
  booking: Row;
  paymentLines?: unknown[] | null;
}): RentalMoneySummary {
  const booking = input.booking;
  const warnings: RentalMoneyWarning[] = [];
  const activeLines = (input.paymentLines ?? [])
    .map(mapRentalPaymentLineRow)
    .filter((line) => line.status === "active");
  const hasPaymentLines = activeLines.length > 0;
  const status = text(booking.status) || "unknown";
  const currencyCode = text(booking.currency_code) || "THB";
  const bookingId = text(booking.id);
  const rentalTotalSnapshot = money(booking.rental_total);
  const depositSnapshot = money(booking.deposit_amount);
  const bookingDepositLine = firstLine(activeLines, "booking_deposit");
  const rentalLine = firstLine(activeLines, "rental_fee");
  const securityDepositLine = firstLine(
    activeLines,
    "refundable_security_deposit",
  );
  const hasPosV3SameDayPolicy = activeLines.some(isPosV3SameDayLine);

  if (!hasPaymentLines) {
    pushWarning(warnings, {
      code: "missing_payment_lines",
      severity: "warning",
      message:
        "No active rental_booking_payment_lines found; summary uses booking snapshot fields and is limited for legacy data.",
    });
  }

  for (const type of [
    "rental_fee",
    "booking_deposit",
    "refundable_security_deposit",
  ] as const) {
    const count = activeLines.filter((line) => line.lineType === type).length;
    if (count > 1) {
      pushWarning(warnings, {
        code: "duplicate_active_line",
        severity: "warning",
        message: `Duplicate active ${type} payment lines found; amounts were summed for summary output.`,
        context: { lineType: type, count },
      });
    }
  }

  if (hasPaymentLines) {
    if (!rentalLine && rentalTotalSnapshot > 0) {
      pushWarning(warnings, {
        code: "missing_expected_line",
        severity: "warning",
        message:
          "Booking has rental_total but no active rental_fee payment line.",
      });
    }
    if (!securityDepositLine && depositSnapshot > 0) {
      pushWarning(warnings, {
        code: "missing_expected_line",
        severity: "warning",
        message:
          "Booking has deposit_amount but no active refundable_security_deposit payment line.",
      });
    }
  }

  const rentalTotals = sumLines(activeLines, "rental_fee");
  const bookingDepositTotals = sumLines(activeLines, "booking_deposit");
  const securityDepositTotals = sumLines(
    activeLines,
    "refundable_security_deposit",
  );
  const rentalFeeExpectedGross = hasPaymentLines
    ? rentalTotals.gross
    : rentalTotalSnapshot;
  const rentalFeeExpectedNet = hasPaymentLines
    ? rentalTotals.net || rentalTotals.gross
    : rentalTotalSnapshot;
  const bookingDepositExpected = hasPaymentLines
    ? bookingDepositTotals.gross
    : calculateBookingDepositDueNow({
        rentalDays: Number(booking.rental_days ?? 0),
        requiredSecurityDepositAmount: depositSnapshot,
      });
  const lineSecurityDepositRequired = money(
    bookingDepositLine?.metadata.securityDepositRequired,
  );
  const totalSecurityDepositExpected = hasPaymentLines
    ? lineSecurityDepositRequired ||
      money(bookingDepositTotals.gross + securityDepositTotals.gross) ||
      depositSnapshot
    : depositSnapshot;

  if (
    hasPaymentLines &&
    !nearlyEqual(rentalFeeExpectedGross, rentalTotalSnapshot)
  ) {
    pushWarning(warnings, {
      code: "inconsistent_booking_total",
      severity: "warning",
      message:
        "Active rental_fee payment-line total differs from rental_bookings.rental_total.",
      context: {
        paymentLineTotal: rentalFeeExpectedGross,
        bookingTotal: rentalTotalSnapshot,
      },
    });
  }
  if (
    hasPaymentLines &&
    !nearlyEqual(totalSecurityDepositExpected, depositSnapshot)
  ) {
    pushWarning(warnings, {
      code: "inconsistent_booking_total",
      severity: "warning",
      message:
        "Payment-line refundable security deposit interpretation differs from rental_bookings.deposit_amount.",
      context: {
        paymentLineTotal: totalSecurityDepositExpected,
        bookingDepositAmount: depositSnapshot,
      },
    });
  }

  for (const line of activeLines) {
    if (
      ["booking_deposit", "refundable_security_deposit"].includes(
        line.lineType,
      ) &&
      (line.whtApplicable || line.whtAmount > 0 || !line.isRefundable)
    ) {
      pushWarning(warnings, {
        code: "line_semantics_conflict",
        severity: "warning",
        message:
          "Refundable deposit line has WHT or non-refundable semantics, which conflicts with current policy.",
        context: { lineType: line.lineType },
      });
    }
  }

  const dedicatedBookingDepositPaid = money(
    booking.booking_deposit_paid_amount,
  );
  const legacyDepositPaid = money(booking.deposit_paid_amount);
  const bookingDepositPaid =
    dedicatedBookingDepositPaid ||
    Math.min(legacyDepositPaid, bookingDepositExpected);
  if (
    !dedicatedBookingDepositPaid &&
    legacyDepositPaid > 0 &&
    bookingDepositExpected > 0
  ) {
    pushWarning(warnings, {
      code: "legacy_limited_interpretation",
      severity: "info",
      message:
        "Dedicated booking_deposit_paid_amount is unavailable/zero; booking deposit paid amount was inferred from legacy deposit_paid_amount.",
    });
  }
  const bookingDepositApplied = Math.min(
    totalSecurityDepositExpected,
    bookingDepositPaid,
  );
  // Phase 2E-B1.5 + same-day correction:
  // deposit_paid_amount is credited toward pickup due ONLY when either:
  //   1. booking_deposit_paid_amount > 0  → future POS V3 booking with booking deposit, or
  //   2. active payment lines carry the same-day discriminator
  //      (source/metadata => booking deposit not applicable for same-day).
  // Legacy bookings with booking_deposit_paid_amount = 0 remain excluded.
  const pickupRemainingDepositCovered =
    (dedicatedBookingDepositPaid > 0 || hasPosV3SameDayPolicy) &&
    text(booking.deposit_payment_status) === "paid"
      ? money(booking.deposit_paid_amount)
      : 0;
  const totalDepositCovered =
    bookingDepositApplied + pickupRemainingDepositCovered;
  const remainingSecurityDue = Math.max(
    0,
    money(totalSecurityDepositExpected - totalDepositCovered),
  );
  const checkoutPaid = money(booking.checkout_paid_amount);
  const pickupPaidPool = checkoutPaid;
  const rentalFeePaid = Math.min(rentalFeeExpectedNet, pickupPaidPool);
  const remainingDepositPaid = Math.max(0, pickupPaidPool - rentalFeePaid);
  const rentalFeeOutstanding = Math.max(
    0,
    money(rentalFeeExpectedNet - rentalFeePaid),
  );
  const pickupStatuses = new Set(["picked_up", "returned"]);
  const heldDeposit = pickupStatuses.has(status)
    ? Math.min(
        totalSecurityDepositExpected,
        Math.max(
          legacyDepositPaid,
          bookingDepositApplied + remainingDepositPaid,
        ),
      )
    : bookingDepositApplied;

  return {
    booking: {
      id: bookingId,
      reference:
        text(booking.asset_code) || text(booking.product_name) || bookingId,
      status,
      currencyCode,
    },
    bookingDeposit: {
      expectedAmount: bookingDepositExpected,
      paidAmount: bookingDepositPaid,
      paymentStatus:
        text(booking.booking_deposit_payment_status) ||
        text(booking.deposit_payment_status) ||
        null,
      appliedToSecurityDepositAmount: bookingDepositApplied,
      isRevenue: false,
    },
    refundableSecurityDeposit: {
      expectedTotalAmount: totalSecurityDepositExpected,
      coveredByBookingDepositAmount: bookingDepositApplied,
      remainingDueAtPickupAmount: remainingSecurityDue,
      heldAmount: money(heldDeposit),
      isRevenue: false,
    },
    rentalFee: {
      expectedGrossAmount: rentalFeeExpectedGross,
      expectedNetPayableAmount: rentalFeeExpectedNet,
      paidAmount: rentalFeePaid,
      outstandingAmount: rentalFeeOutstanding,
      whtApplicable: Boolean(rentalLine?.whtApplicable),
      whtRate: Number(rentalLine?.whtRate ?? 0),
      whtAmount: rentalTotals.wht,
      whtCertificateRequired: Boolean(rentalLine?.whtCertificateRequired),
      taxCategory: rentalLine?.taxCategory ?? null,
      isRevenue: true,
    },
    pickupDue: {
      rentalFeeDueAmount: rentalFeeOutstanding,
      remainingSecurityDepositDueAmount: remainingSecurityDue,
      // Rental fee is deferred to return/settlement (Phase 2E-B2+).
      // Pickup is only gated on remaining security deposit.
      totalPickupDueAmount: remainingSecurityDue,
    },
    source: {
      hasPaymentLines,
      activePaymentLineCount: activeLines.length,
      legacyFallbackUsed: !hasPaymentLines,
    },
    warnings,
  };
}

export function buildRentalSettlementPreview(input: {
  summary: RentalMoneySummary;
  paymentLines?: unknown[] | null;
}): RentalSettlementPreview {
  const activeLines = (input.paymentLines ?? [])
    .map(mapRentalPaymentLineRow)
    .filter((line) => line.status === "active");
  const warnings = [...input.summary.warnings];
  const deductionLines = activeLines.filter((line) =>
    DEDUCTION_LINE_TYPES.has(line.lineType),
  );
  if (deductionLines.length === 0) {
    warnings.push({
      code: "settlement_data_limited",
      severity: "info",
      message:
        "No active damage_fee or late_fee payment lines found; settlement preview assumes zero canonical deductions.",
    });
  }
  const actualStatus = input.summary.booking.status;
  const isCleanlyReturnEligible = RETURN_ELIGIBLE_STATUSES.has(actualStatus);
  if (!isCleanlyReturnEligible) {
    warnings.push({
      code: "booking_not_return_eligible",
      severity: "warning",
      message:
        "Booking is not currently in a clean return-preview status based on existing status conventions.",
      context: {
        actualStatus,
        expectedStatuses: [...RETURN_ELIGIBLE_STATUSES],
      },
    });
  }
  const deductions = deductionLines.map<RentalSettlementDeduction>((line) => ({
    lineType: line.lineType as "damage_fee" | "late_fee",
    label: line.descriptionEn || line.descriptionTh || line.lineType,
    amount: line.grossAmount,
    taxCategory: line.taxCategory,
    source: "rental_booking_payment_line",
  }));
  const totalDeductions = money(
    deductions.reduce((sum, deduction) => sum + deduction.amount, 0),
  );
  const heldDeposit = input.summary.refundableSecurityDeposit.heldAmount;
  return {
    booking: input.summary.booking,
    depositHeld: {
      amount: heldDeposit,
      bookingDepositContributionAmount:
        input.summary.bookingDeposit.appliedToSecurityDepositAmount,
    },
    deductions: {
      items: deductions,
      totalAmount: totalDeductions,
    },
    totals: {
      heldDepositAmount: heldDeposit,
      totalDeductionAmount: totalDeductions,
      refundDueAmount: Math.max(0, money(heldDeposit - totalDeductions)),
      extraDueAmount: Math.max(0, money(totalDeductions - heldDeposit)),
    },
    returnEligibility: {
      isCleanlyReturnEligible,
      expectedStatuses: [...RETURN_ELIGIBLE_STATUSES],
      actualStatus,
    },
    warnings,
  };
}

export async function loadRentalMoneySummaryInput(input: {
  adminClient: { from: (table: string) => any };
  bookingId: string;
}) {
  const { data: booking, error } = await input.adminClient
    .from("rental_bookings")
    .select(
      "id, status, asset_code, product_name, rental_days, currency_code, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_status, deposit_refund_status, deposit_refund_amount, checkout_total_amount, checkout_paid_amount, booking_deposit_payment_status, booking_deposit_paid_amount",
    )
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!booking) {
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  }
  const { data: paymentLines, error: linesError } = await input.adminClient
    .from("rental_booking_payment_lines")
    .select(
      "line_type, tax_category, description_th, description_en, gross_amount, wht_applicable, wht_rate, wht_amount, net_payable_amount, is_refundable, wht_certificate_required, applies_to_security_deposit, reduces_remaining_security_deposit, status, source, metadata",
    )
    .eq("booking_id", input.bookingId)
    .order("created_at", { ascending: true });
  if (linesError) {
    throw createError({ statusCode: 500, statusMessage: linesError.message });
  }
  return { booking: booking as Row, paymentLines: paymentLines ?? [] };
}
