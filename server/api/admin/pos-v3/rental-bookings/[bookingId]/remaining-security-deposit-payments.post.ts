import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { recordRentalHeldBalanceEvent } from "~~/server/utils/rental-held-balance-events";

const REMAINING_SECURITY_DEPOSIT_ALREADY_PAID =
  "REMAINING_SECURITY_DEPOSIT_ALREADY_PAID";
const REMAINING_SECURITY_DEPOSIT_AMOUNT_MISMATCH =
  "REMAINING_SECURITY_DEPOSIT_AMOUNT_MISMATCH";
const NO_REMAINING_SECURITY_DEPOSIT_DUE = "NO_REMAINING_SECURITY_DEPOSIT_DUE";
// Bug 2 fix: blocks cash when a prior QR attempt was gateway-paid but internal
// finalization failed. Omise already captured money — cash collection must not run.
const GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW =
  "GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW";

// asset join provides storage_branch_id as branch fallback for non-POS (online) bookings
const BOOKING_SELECT =
  "id, status, deposit_amount, deposit_paid_amount, deposit_payment_status, booking_deposit_payment_status, booking_deposit_paid_amount, pos_branch_id, currency_code, asset:assets(storage_branch_id)";
const PAYMENT_LINE_SELECT = "line_type, status, source, metadata";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asMoney(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

function asMetadata(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

/** Extracts storage_branch_id from the booking's joined asset row. */
function getStorageBranchId(booking: AnyRecord): string | null {
  const asset = booking.asset as AnyRecord | null | undefined;
  return typeof asset?.storage_branch_id === "string"
    ? asset.storage_branch_id
    : null;
}

/**
 * Checks POS branch access for the staff user.
 * branchId may be null for online bookings that have no pos_branch_id or
 * storage branch — in that case, access is not restricted by branch (consistent
 * with rental-fulfillment.ts assertBranchAccess behavior when branchId is null).
 */
async function assertPosBranchAccess(input: {
  adminClient: AnyClient;
  platformRole: string;
  userId: string;
  branchId: string | null;
}) {
  if (!input.branchId || input.platformRole === "super_admin") return;
  const { data, error } = await input.adminClient
    .from("admin_user_branch_access")
    .select("branch_id")
    .eq("user_id", input.userId)
    .eq("branch_id", input.branchId)
    .eq("can_pos", true)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 403,
      statusMessage: "No POS access for selected branch",
    });
}

async function loadBookingForDeposit(
  adminClient: AnyClient,
  bookingId: string,
): Promise<AnyRecord> {
  const { data, error } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  return data as AnyRecord;
}

async function loadPaymentLinesForDeposit(
  adminClient: AnyClient,
  bookingId: string,
): Promise<AnyRecord[]> {
  const { data, error } = await adminClient
    .from("rental_booking_payment_lines")
    .select(PAYMENT_LINE_SELECT)
    .eq("booking_id", bookingId);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return Array.isArray(data) ? (data as AnyRecord[]) : [];
}

function isPosV3SameDayBooking(lines: AnyRecord[]): boolean {
  return lines.some((line) => {
    if (asText(line.status) === "voided") return false;
    const metadata = asMetadata(line.metadata);
    return (
      asText(line.source) === "pos_v3_same_day_quote" ||
      asText(metadata.bookingDepositPolicy) === "not_applicable_same_day"
    );
  });
}

async function findExistingPosAttempt(
  adminClient: AnyClient,
  bookingId: string,
  idempotencyKey: string,
): Promise<AnyRecord | null> {
  const { data, error } = await adminClient
    .from("pos_rental_payment_attempts")
    .select("id, amount, status, paid_at")
    .eq("rental_booking_id", bookingId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data as AnyRecord | null) ?? null;
}

export default defineEventHandler(async (event) => {
  const {
    adminClient,
    userId: staffUserId,
    platformRole,
  } = await requirePlatformAdmin(event);

  const bookingId = asText(event.context.params?.bookingId);
  if (!bookingId)
    throw createError({
      statusCode: 422,
      statusMessage: "bookingId is required",
    });

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const idempotencyKey = asText(body.idempotencyKey);
  const amount = asMoney(body.amount);
  const paymentMethod = asText(body.paymentMethod);

  if (!idempotencyKey)
    throw createError({
      statusCode: 422,
      statusMessage: "idempotencyKey is required",
    });
  if (amount <= 0)
    throw createError({
      statusCode: 422,
      statusMessage: "amount must be positive",
    });
  if (paymentMethod !== "cash")
    throw createError({
      statusCode: 422,
      statusMessage: "paymentMethod must be 'cash'",
    });

  const booking = await loadBookingForDeposit(adminClient, bookingId);
  const paymentLines = await loadPaymentLinesForDeposit(adminClient, bookingId);
  const sameDayBooking = isPosV3SameDayBooking(paymentLines);

  // Resolve the operating branch for this pickup.
  // POS V3 bookings have pos_branch_id; online/hub bookings fall back to
  // the asset's storage_branch_id. If neither is present, branch check is
  // skipped (consistent with rental-fulfillment.ts resolveEventBranch behavior).
  const posBranchId = asText(booking.pos_branch_id) || null;
  const resolvedBranchId = posBranchId ?? getStorageBranchId(booking);

  await assertPosBranchAccess({
    adminClient,
    platformRole,
    userId: staffUserId,
    branchId: resolvedBranchId,
  });

  if (asText(booking.status) !== "confirmed")
    throw createError({
      statusCode: 422,
      statusMessage:
        "Only confirmed bookings can collect remaining security deposit",
    });

  // For POS V3 bookings (identified by pos_branch_id), enforce that the booking
  // deposit phase is complete before collecting the remaining pickup deposit.
  // Online/hub bookings are already confirmed via their own deposit validation
  // flow and do not use booking_deposit_payment_status in the same way.
  if (
    !sameDayBooking &&
    posBranchId &&
    asText(booking.booking_deposit_payment_status) !== "paid"
  )
    throw createError({
      statusCode: 422,
      statusMessage:
        "Booking deposit must be paid before collecting remaining security deposit",
    });

  if (asText(booking.deposit_payment_status) === "paid")
    throw createError({
      statusCode: 409,
      statusMessage: REMAINING_SECURITY_DEPOSIT_ALREADY_PAID,
    });

  // Bug 2 fix: block cash collection if a prior QR attempt is gateway-paid but
  // internally failed (paid_confirm_failed with gateway_charge_id set).
  // Omise already captured the money — accepting cash would double-collect.
  const { data: gatewayPaidFailed } = await adminClient
    .from("pos_rental_payment_attempts")
    .select("id, gateway_charge_id")
    .eq("rental_booking_id", bookingId)
    .eq("payment_purpose", "remaining_security_deposit")
    .eq("status", "paid_confirm_failed")
    .not("gateway_charge_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (gatewayPaidFailed) {
    throw createError({
      statusCode: 409,
      statusMessage: GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW,
    });
  }

  // Server-computed remaining security deposit due at pickup
  const requiredDeposit = asMoney(booking.deposit_amount);
  const bookingDepositPaid = asMoney(booking.booking_deposit_paid_amount);
  const expectedRemainingAmount = Math.max(
    0,
    Math.round((requiredDeposit - bookingDepositPaid) * 100) / 100,
  );

  if (expectedRemainingAmount <= 0)
    throw createError({
      statusCode: 422,
      statusMessage: NO_REMAINING_SECURITY_DEPOSIT_DUE,
    });

  if (Math.abs(amount - expectedRemainingAmount) > 0.01)
    throw createError({
      statusCode: 422,
      statusMessage: REMAINING_SECURITY_DEPOSIT_AMOUNT_MISMATCH,
    });

  // Idempotency guard — return existing attempt if key matches
  const existingAttempt = await findExistingPosAttempt(
    adminClient,
    bookingId,
    idempotencyKey,
  );
  if (existingAttempt) {
    if (Math.abs(asMoney(existingAttempt.amount) - amount) > 0.01)
      throw createError({
        statusCode: 409,
        statusMessage: "IDEMPOTENCY_KEY_AMOUNT_CONFLICT",
      });
    return {
      status: asText(existingAttempt.status),
      paymentAttemptId: String(existingAttempt.id),
      remainingSecurityDepositPaidAmount: asMoney(existingAttempt.amount),
      currencyCode: asText(booking.currency_code) || "THB",
      idempotent: true,
    };
  }

  const currencyCode = asText(booking.currency_code) || "THB";
  const now = new Date().toISOString();

  // Create POS payment attempt — durable cash collection record
  const { data: attempt, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .insert({
      rental_booking_id: bookingId,
      payment_purpose: "remaining_security_deposit",
      payment_method: "cash",
      amount,
      currency_code: currencyCode,
      status: "paid",
      branch_id: posBranchId,
      staff_user_id: staffUserId,
      idempotency_key: idempotencyKey,
      paid_at: now,
      metadata: {
        source: "pos_v3_remaining_security_deposit_cash",
        bookingChannel: "admin_pos_v3",
      },
    })
    .select("id, amount, status")
    .single();

  if (attemptError) {
    if (attemptError.code === "23505") {
      // Race condition: another request with the same key won
      const existing = await findExistingPosAttempt(
        adminClient,
        bookingId,
        idempotencyKey,
      );
      if (existing && Math.abs(asMoney(existing.amount) - amount) <= 0.01)
        return {
          status: asText(existing.status),
          paymentAttemptId: String(existing.id),
          remainingSecurityDepositPaidAmount: asMoney(existing.amount),
          currencyCode,
          idempotent: true,
        };
      throw createError({
        statusCode: 409,
        statusMessage: "IDEMPOTENCY_KEY_AMOUNT_CONFLICT",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: attemptError.message,
    });
  }

  const attemptId = String(attempt.id);
  const warnings: string[] = [];
  let confirmFailed = false;

  // Record held balance event (non-revenue deposit collection)
  try {
    await recordRentalHeldBalanceEvent({
      client: adminClient,
      rentalBookingId: bookingId,
      eventType: "remaining_security_deposit_collection",
      amount,
      currencyCode,
      sourceType: "pos_rental_payment_attempt",
      sourceId: attemptId,
      paymentMethod: "cash",
      branchId: posBranchId,
      staffUserId,
      idempotencyKey,
      metadata: {
        source: "pos_v3_remaining_security_deposit_cash",
        bookingChannel: "admin_pos_v3",
      },
    });
  } catch {
    confirmFailed = true;
    warnings.push("Held balance event recording failed");
  }

  // Update booking: mark remaining security deposit as paid
  const { error: updateError } = await adminClient
    .from("rental_bookings")
    .update({
      deposit_paid_amount: amount,
      deposit_payment_status: "paid",
      deposit_payment_method: "cash",
      deposit_paid_at: now,
    })
    .eq("id", bookingId);

  if (updateError) {
    confirmFailed = true;
    warnings.push("Booking update failed");
  }

  if (confirmFailed) {
    return {
      status: "paid_confirm_failed",
      paymentAttemptId: attemptId,
      remainingSecurityDepositPaidAmount: amount,
      currencyCode,
      warnings,
    };
  }

  return {
    status: "paid",
    paymentAttemptId: attemptId,
    remainingSecurityDepositPaidAmount: amount,
    currencyCode,
  };
});
