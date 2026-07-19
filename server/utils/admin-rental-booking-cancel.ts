/**
 * Staff late-cancel forfeiture (design §A case 2, T3 walk 2).
 *
 * §F inversion pattern (gate 132): requirePlatformAdmin at the endpoint,
 * then every post-guard refusal here writes a best-effort DENIED row to
 * money_ops_decision_logs BEFORE throwing; the ALLOWED row is written
 * FAIL-CLOSED before the money RPC (no log, no forfeiture).
 *
 * Money authority: f_cancel_rental_booking_admin mode 'late_cancel_forfeit'
 * (mig 129) — cancellation event + late_cancellation_forfeiture disposition
 * + non-VAT recognition + full held-balance forfeiture + residue-0, one txn.
 * This wrapper owns: window derivation (7-day tier, policy v2), decision
 * logging, and the late_cancel_forfeit deposit-action-log row (127 vocab).
 */
import { createError } from "h3";
import { asUuidOrNull } from "~~/server/utils/kyc-documents";
import { logMoneyOpsDecision } from "~~/server/utils/money-ops-log";
import {
  BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
  evaluateBookingDepositRefundEligibility,
} from "~~/server/utils/rental-cancellation-policy";

type Row = Record<string, unknown>;
type AnyClient = {
  from(table: string): any;
  rpc?: (
    name: string,
    params: Row,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const BOOKING_SELECT =
  "id, user_id, status, start_date, currency_code, booking_deposit_payment_status, booking_deposit_paid_amount, deposit_paid_amount";
const COMPANY_BOOKING_SELECT =
  BOOKING_SELECT +
  ", booking_deposit_payment_attempt_id, booking_deposit_mixed_allocation_id";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function lateCancelForfeitRentalBooking(input: {
  client: AnyClient;
  rawBookingId: unknown;
  actorUserId: string;
  actorRole: string;
  reason: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null; amount?: number | null } = {},
  ): Promise<never> {
    // Best-effort: the denial log must never block the refusal itself.
    await logMoneyOpsDecision(input.client, {
      operation: "late_cancel_forfeit",
      decision: "denied",
      denialReason,
      entityType: extra.entityId === null ? null : "rental_booking",
      entityId: extra.entityId ?? null,
      amount: extra.amount ?? null,
      ...actor,
    });
    throw createError({ statusCode, statusMessage });
  }

  // Decision-G purity: malformed raw ids are never logged.
  const bookingId = asUuidOrNull(input.rawBookingId);
  if (!bookingId)
    await deny("malformed_booking_id", 404, "Booking not found", {
      entityId: null,
    });

  if (input.actorRole !== "staff" && input.actorRole !== "super_admin")
    await deny("actor_role_invalid", 403, "Forbidden", { entityId: bookingId });

  const reason = text(input.reason);
  if (!reason)
    await deny("reason_required", 422, "Cancellation reason is required", {
      entityId: bookingId,
    });

  const { data: booking, error: loadError } = await input.client
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (loadError)
    throw createError({ statusCode: 500, statusMessage: loadError.message });
  if (!booking)
    await deny("booking_not_found", 404, "Booking not found", {
      entityId: bookingId,
    });

  const row = booking as Row;
  const depositAmount =
    Number(row.booking_deposit_paid_amount ?? 0) ||
    Number(row.deposit_paid_amount ?? 0);

  if (row.status !== "confirmed")
    await deny("booking_not_cancellable", 409, "BOOKING_NOT_CANCELLABLE", {
      entityId: bookingId,
    });
  if (row.booking_deposit_payment_status !== "paid")
    await deny("deposit_not_paid", 409, "BOOKING_DEPOSIT_NOT_PAID", {
      entityId: bookingId,
    });

  // 7-day tier (policy v2): staff forfeit is legal ONLY inside the window —
  // while the customer still qualifies for self-serve refund, forfeit denied.
  const eligibility = evaluateBookingDepositRefundEligibility({
    pickupDate: String(row.start_date),
  });
  if (eligibility.eligible)
    await deny(
      "window_not_reached",
      409,
      "LATE_CANCEL_WINDOW_NOT_REACHED",
      { entityId: bookingId, amount: depositAmount },
    );

  // ALLOWED row: FAIL-CLOSED before the money RPC.
  await logMoneyOpsDecision(
    input.client,
    {
      operation: "late_cancel_forfeit",
      decision: "allowed",
      entityType: "rental_booking",
      entityId: bookingId,
      amount: depositAmount,
      currencyCode: text(row.currency_code) || "THB",
      ...actor,
    },
    { failClosed: true },
  );

  if (typeof input.client.rpc !== "function")
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  const { data: rpcData, error: rpcError } = await input.client.rpc(
    "f_cancel_rental_booking_admin",
    {
      p_mode: "late_cancel_forfeit",
      p_booking_id: bookingId,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
      p_reason: reason,
      p_cancelled_at: new Date().toISOString(),
      p_pickup_local_date: eligibility.pickupLocalDate,
      p_cancellation_local_date: eligibility.cancellationLocalDate,
      p_refund_cutoff_date: eligibility.refundCutoffLocalDate,
      p_refund_policy_version: BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
    },
  );
  if (rpcError) {
    const message = String(rpcError.message ?? "");
    // Correction row (KYC storage_download_failed analogue): an allowed row
    // exists but the money action did not commit.
    await logMoneyOpsDecision(input.client, {
      operation: "late_cancel_forfeit",
      decision: "denied",
      denialReason: "rpc_failed_after_allow",
      entityType: "rental_booking",
      entityId: bookingId,
      amount: depositAmount,
      ...actor,
    });
    if (
      message.startsWith("LATE_CANCEL_WINDOW_NOT_REACHED") ||
      message.startsWith("BOOKING_NOT_") ||
      message.startsWith("BOOKING_ALREADY_FULFILLED") ||
      message.startsWith("BOOKING_DEPOSIT_NOT_PAID") ||
      message.startsWith("BOOKING_CANCELLATION_CONFLICT")
    ) {
      throw createError({ statusCode: 409, statusMessage: message });
    }
    console.error("late-cancel forfeit RPC failed:", message);
    throw createError({
      statusCode: 500,
      statusMessage: "Late-cancel forfeiture failed",
    });
  }

  // Deposit action log (127 vocabulary) — house audit trail, same flow.
  const { error: auditError } = await input.client
    .from("rental_booking_deposit_action_logs")
    .insert({
      booking_id: bookingId,
      action: "late_cancel_forfeit",
      staff_user_id: input.actorUserId,
      old_values: { status: "confirmed" },
      new_values: {
        status: "cancelled",
        disposition: "forfeited",
        policyVersion: "booking_deposit_forfeiture_late_cancel_v1",
      },
      change_summary: `late-cancel forfeiture (booking ${bookingId})`,
      reason,
    });
  if (auditError)
    throw createError({ statusCode: 500, statusMessage: auditError.message });

  return rpcData as Row;
}

/**
 * Company-side cancellation (design §A case 3, T3 walk 3).
 *
 * §F inversion — THE extended KYC-download pattern on money: the endpoint
 * uses requirePlatformAdmin; the EXPLICIT super_admin check lives here so a
 * staff denial is LOGGED (operation='company_cancel', denied/not_super_admin)
 * BEFORE the 403. Full refund ALWAYS (§b): the amount authority is the
 * mig-129 RPC (company mode derives it; wrapper never computes money).
 * Bank details are the wrapper contract — collected up front, passed to the
 * RPC, NEVER written to the decision log (NO-PII invariant).
 */
export async function companyCancelRentalBooking(input: {
  client: AnyClient;
  rawBookingId: unknown;
  actorUserId: string;
  actorRole: string;
  reason: unknown;
  refundBankName?: unknown;
  refundBankAccountNumber?: unknown;
  refundBankAccountName?: unknown;
  refundContactPhone?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const actor = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as const;

  async function deny(
    denialReason: string,
    statusCode: number,
    statusMessage: string,
    extra: { entityId?: string | null; amount?: number | null } = {},
  ): Promise<never> {
    await logMoneyOpsDecision(input.client, {
      operation: "company_cancel",
      decision: "denied",
      denialReason,
      entityType: extra.entityId === null ? null : "rental_booking",
      entityId: extra.entityId ?? null,
      amount: extra.amount ?? null,
      ...actor,
    });
    throw createError({ statusCode, statusMessage });
  }

  const bookingId = asUuidOrNull(input.rawBookingId);
  if (!bookingId)
    await deny("malformed_booking_id", 404, "Booking not found", {
      entityId: null,
    });

  // THE INVERSION: explicit super_admin check with the denial logged first.
  if (input.actorRole !== "super_admin")
    await deny("not_super_admin", 403, "Forbidden", { entityId: bookingId });

  const reason = text(input.reason);
  if (!reason)
    await deny("reason_required", 422, "Cancellation reason is required", {
      entityId: bookingId,
    });

  const { data: booking, error: loadError } = await input.client
    .from("rental_bookings")
    .select(COMPANY_BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (loadError)
    throw createError({ statusCode: 500, statusMessage: loadError.message });
  if (!booking)
    await deny("booking_not_found", 404, "Booking not found", {
      entityId: bookingId,
    });

  const row = booking as Row;
  if (row.status === "cancelled") {
    // Idempotent replay (walk-4 pattern, mirrors the RPC's alreadyCancelled
    // branch): no money action occurs, so no decision row is written.
    return { ok: true, alreadyCancelled: true, bookingId } as Row;
  }
  if (row.status !== "draft" && row.status !== "confirmed")
    await deny("booking_not_cancellable", 409, "BOOKING_NOT_CANCELLABLE", {
      entityId: bookingId,
    });

  const depositCaptured =
    row.booking_deposit_payment_status === "paid" ||
    row.booking_deposit_payment_status === "paid_confirm_failed";
  const depositAmount = depositCaptured
    ? Number(row.booking_deposit_paid_amount ?? 0) ||
      Number(row.deposit_paid_amount ?? 0)
    : null;

  let sourceType: string | null = null;
  let attemptId: string | null = null;
  let allocationId: string | null = null;
  const bank = {
    name: text(input.refundBankName),
    accountNumber: text(input.refundBankAccountNumber),
    accountName: text(input.refundBankAccountName),
    contactPhone: text(input.refundContactPhone),
  };
  if (depositCaptured) {
    if (
      !bank.name ||
      !bank.accountNumber ||
      !bank.accountName ||
      !bank.contactPhone
    )
      await deny(
        "bank_details_required",
        422,
        "COMPANY_REFUND_BANK_DETAILS_REQUIRED",
        { entityId: bookingId, amount: depositAmount },
      );
    attemptId = text(row.booking_deposit_payment_attempt_id) || null;
    allocationId = text(row.booking_deposit_mixed_allocation_id) || null;
    if (attemptId) sourceType = "rental_booking_payment_attempt";
    else if (allocationId) sourceType = "mixed_payment_allocation";
    else
      // Known Phase-1 limitation (design §A sweep): manually-confirmed
      // deposits have no refund-row source vocabulary yet.
      await deny(
        "payment_source_unresolved",
        409,
        "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
        { entityId: bookingId, amount: depositAmount },
      );
  }

  await logMoneyOpsDecision(
    input.client,
    {
      operation: "company_cancel",
      decision: "allowed",
      entityType: "rental_booking",
      entityId: bookingId,
      amount: depositAmount,
      currencyCode: depositCaptured ? text(row.currency_code) || "THB" : null,
      ...actor,
    },
    { failClosed: true },
  );

  const eligibility = evaluateBookingDepositRefundEligibility({
    pickupDate: String(row.start_date),
  });
  if (typeof input.client.rpc !== "function")
    throw createError({ statusCode: 500, statusMessage: "RPC unavailable" });
  const { data: rpcData, error: rpcError } = await input.client.rpc(
    "f_cancel_rental_booking_admin",
    {
      p_mode: "company_cancel_refund",
      p_booking_id: bookingId,
      p_actor_user_id: input.actorUserId,
      p_actor_role: input.actorRole,
      p_reason: reason,
      p_cancelled_at: new Date().toISOString(),
      p_pickup_local_date: eligibility.pickupLocalDate,
      p_cancellation_local_date: eligibility.cancellationLocalDate,
      p_refund_cutoff_date: eligibility.refundCutoffLocalDate,
      p_refund_policy_version: BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
      p_refund_amount: null, // RPC derives (§b full refund ALWAYS)
      p_original_payment_source_type: sourceType,
      p_original_rental_booking_payment_attempt_id: attemptId,
      p_original_mixed_payment_allocation_id: allocationId,
      p_gateway: attemptId || allocationId ? "omise" : null,
      p_currency_code: text(row.currency_code) || "THB",
      p_refund_bank_name: bank.name || null,
      p_refund_bank_account_number: bank.accountNumber || null,
      p_refund_bank_account_name: bank.accountName || null,
      p_refund_contact_phone: bank.contactPhone || null,
    },
  );
  if (rpcError) {
    const message = String(rpcError.message ?? "");
    await logMoneyOpsDecision(input.client, {
      operation: "company_cancel",
      decision: "denied",
      denialReason: "rpc_failed_after_allow",
      entityType: "rental_booking",
      entityId: bookingId,
      amount: depositAmount,
      ...actor,
    });
    if (
      message.startsWith("BOOKING_") ||
      message.startsWith("COMPANY_") ||
      message.startsWith("ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED") ||
      message.startsWith("REFUND_AMOUNT_MISMATCH")
    ) {
      throw createError({ statusCode: 409, statusMessage: message });
    }
    console.error("company cancel RPC failed:", message);
    throw createError({
      statusCode: 500,
      statusMessage: "Company cancellation failed",
    });
  }

  const { error: auditError } = await input.client
    .from("rental_booking_deposit_action_logs")
    .insert({
      booking_id: bookingId,
      action: "company_cancel_refund",
      staff_user_id: input.actorUserId,
      old_values: { status: row.status },
      new_values: {
        status: "cancelled",
        refundRequested: depositCaptured,
      },
      change_summary: `company-side cancellation (booking ${bookingId})`,
      reason,
    });
  if (auditError)
    throw createError({ statusCode: 500, statusMessage: auditError.message });

  return rpcData as Row;
}
