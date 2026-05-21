import { createError } from "h3";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";
import type { RentalDepositPaymentMethod } from "~~/app/types/rental-booking";
import type { RentalMoneyWarningCode } from "~~/server/utils/rental-money-summary";
import {
  assertRentalFulfillmentPrerequisites,
  completeRentalBookingFulfillment,
  type AdminClient,
} from "~~/server/utils/rental-fulfillment";
import {
  assertPickupReadinessBranchAccess,
  loadRentalPickupReadiness,
  type RentalPickupReadiness,
} from "~~/server/utils/rental-pickup-readiness";

export interface PosV2PickupCompletePayload {
  paymentMethod?: RentalDepositPaymentMethod | null;
  collectedAmount?: number | null;
  signatureDataUrl?: string | null;
  branchId?: string | null;
  idempotencyKey?: string | null;
}

export interface PosV2PickupCompletionResult {
  completion: {
    bookingId: string;
    status: string;
    pickupCompleted: true;
  };
  booking: AdminRentalBookingDetail;
  readiness: RentalPickupReadiness;
  moneySummary: RentalPickupReadiness["moneySummary"];
  payment: {
    paymentMethod: RentalDepositPaymentMethod;
    collectedAmount: number;
    expectedPickupAmount: number;
    rentalFeeDueAmount: number;
    remainingSecurityDepositDueAmount: number;
    refundableSecurityDepositHeldAmount: number;
    bookingDepositPaidAmount: number;
    bookingDepositPaymentStatus: string | null;
  };
}

const PAYMENT_METHODS = new Set<RentalDepositPaymentMethod>([
  "cash",
  "qr_transfer",
  "bank_transfer",
  "card",
  "other",
]);

const MATERIAL_MONEY_WARNING_CODES = new Set<RentalMoneyWarningCode>([
  "missing_payment_lines",
  "missing_expected_line",
  "duplicate_active_line",
  "inconsistent_booking_total",
  "line_semantics_conflict",
  "legacy_limited_interpretation",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01;
}

function assertValidPaymentMethod(value: unknown): RentalDepositPaymentMethod {
  const method = text(value) as RentalDepositPaymentMethod;
  if (!PAYMENT_METHODS.has(method)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Invalid payment method",
    });
  }
  return method;
}

function assertNoReadinessBlockers(readiness: RentalPickupReadiness): void {
  if (readiness.readiness.classification !== "blocked") return;
  throw createError({
    statusCode: 422,
    statusMessage: `Pickup readiness is blocked: ${readiness.readiness.blockers
      .map((blocker) => blocker.code)
      .join(", ")}`,
  });
}

function assertCompletionWarningsAllowed(
  readiness: RentalPickupReadiness,
): void {
  const futurePickup = readiness.readiness.warnings.find(
    (warning) => warning.code === "pickup_date_in_future",
  );
  if (futurePickup) {
    throw createError({
      statusCode: 422,
      statusMessage:
        "Future pickup date cannot be completed in POS V2 Phase 4B1",
    });
  }

  const materialMoneyWarnings = readiness.moneyWarnings.filter((warning) =>
    MATERIAL_MONEY_WARNING_CODES.has(warning.code),
  );
  if (materialMoneyWarnings.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Pickup completion blocked by money summary warnings: ${materialMoneyWarnings
        .map((warning) => warning.code)
        .join(", ")}`,
    });
  }
}

async function recordPickupPayment(input: {
  adminClient: AdminClient;
  bookingId: string;
  paymentMethod: RentalDepositPaymentMethod;
  collectedAmount: number;
  heldDepositAmount: number;
}) {
  const now = new Date().toISOString();
  const { data, error } = await input.adminClient
    .from("rental_bookings")
    .update({
      deposit_paid_amount: input.heldDepositAmount,
      deposit_payment_method: input.paymentMethod,
      deposit_payment_status: "paid",
      deposit_paid_at: now,
      deposit_refund_status: "not_refunded",
      checkout_paid_amount: input.collectedAmount,
      checkout_payment_method: input.paymentMethod,
    })
    .eq("id", input.bookingId)
    .eq("status", "confirmed")
    .select("id, status, deposit_paid_amount, deposit_payment_status")
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) {
    throw createError({
      statusCode: 409,
      statusMessage:
        "Pickup payment was not recorded because booking is no longer confirmed",
    });
  }
}

export async function completePosV2RentalPickup(input: {
  adminClient: AdminClient;
  userId: string;
  platformRole: string;
  bookingId: string;
  payload: PosV2PickupCompletePayload;
}): Promise<PosV2PickupCompletionResult> {
  const readiness = await loadRentalPickupReadiness({
    adminClient: input.adminClient,
    bookingId: input.bookingId,
  });
  await assertPickupReadinessBranchAccess({
    adminClient: input.adminClient,
    userId: input.userId,
    platformRole: input.platformRole,
    branchId: readiness.rental.branchId,
  });
  assertNoReadinessBlockers(readiness);
  assertCompletionWarningsAllowed(readiness);

  const paymentMethod = assertValidPaymentMethod(input.payload.paymentMethod);
  const collectedAmount = money(input.payload.collectedAmount);
  const moneySummary = readiness.moneySummary;
  // POS V2 collects both rental fee and remaining security deposit at pickup.
  // totalPickupDueAmount now reflects deposit-only gate (Phase 2E-B1+); use the
  // explicit sum here to preserve POS V2 collection semantics unchanged.
  const expectedPickupAmount = money(
    moneySummary.pickupDue.rentalFeeDueAmount +
      moneySummary.pickupDue.remainingSecurityDepositDueAmount,
  );
  if (!nearlyEqual(collectedAmount, expectedPickupAmount)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Collected amount must equal server-calculated pickup due ${expectedPickupAmount}`,
    });
  }

  const branchId = text(input.payload.branchId) || readiness.rental.branchId;
  await assertRentalFulfillmentPrerequisites({
    adminClient: input.adminClient,
    userId: input.userId,
    platformRole: input.platformRole,
    bookingId: input.bookingId,
    eventType: "pickup",
    payload: {
      signatureDataUrl: input.payload.signatureDataUrl,
      branchId,
      idempotencyKey: text(input.payload.idempotencyKey) || null,
    },
    requirePaidPickupDeposit: false,
  });

  const heldDepositAmount = money(
    moneySummary.refundableSecurityDeposit.expectedTotalAmount,
  );
  await recordPickupPayment({
    adminClient: input.adminClient,
    bookingId: input.bookingId,
    paymentMethod,
    collectedAmount,
    heldDepositAmount,
  });

  let booking: AdminRentalBookingDetail;
  try {
    booking = await completeRentalBookingFulfillment({
      adminClient: input.adminClient,
      userId: input.userId,
      platformRole: input.platformRole,
      bookingId: input.bookingId,
      eventType: "pickup",
      payload: {
        signatureDataUrl: input.payload.signatureDataUrl,
        branchId,
        idempotencyKey:
          text(input.payload.idempotencyKey) ||
          `pos-v2:pickup:${input.bookingId}:${Date.now()}`,
      },
    });
  } catch (error) {
    const err = error as {
      statusCode?: number;
      statusMessage?: string;
      message?: string;
    };
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: `Pickup payment was recorded but fulfillment failed: ${
        err.statusMessage ?? err.message ?? "unknown error"
      }`,
    });
  }

  return {
    completion: {
      bookingId: input.bookingId,
      status: booking.status,
      pickupCompleted: true,
    },
    booking,
    readiness,
    moneySummary,
    payment: {
      paymentMethod,
      collectedAmount,
      expectedPickupAmount,
      rentalFeeDueAmount: money(moneySummary.pickupDue.rentalFeeDueAmount),
      remainingSecurityDepositDueAmount: money(
        moneySummary.pickupDue.remainingSecurityDepositDueAmount,
      ),
      refundableSecurityDepositHeldAmount: heldDepositAmount,
      bookingDepositPaidAmount: money(moneySummary.bookingDeposit.paidAmount),
      bookingDepositPaymentStatus: moneySummary.bookingDeposit.paymentStatus,
    },
  };
}
