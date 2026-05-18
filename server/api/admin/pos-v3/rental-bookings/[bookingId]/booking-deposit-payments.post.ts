import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { calculateBookingDepositDueNow } from "~~/app/utils/rental-payment-lines";
import { assertRentalBookingAvailability } from "~~/server/utils/rental-booking-availability";
import { finalizePosRentalBookingDeposit } from "~~/server/utils/pos-rental-booking-deposit-finalizer";

const ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED =
  "ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED";

const BOOKING_SELECT =
  "id, user_id, walk_in_phone, status, asset_id, sku_id, start_date, end_date, rental_days, hub_id, deposit_amount, currency_code, booking_deposit_payment_status, booking_deposit_paid_amount, pos_branch_id, pos_staff_user_id";

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

async function assertPosBranchAccess(input: {
  adminClient: AnyClient;
  platformRole: string;
  userId: string;
  branchId: string;
}) {
  if (input.platformRole === "super_admin") return;
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

async function loadBookingForPayment(
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

async function findExistingPosAttempt(
  adminClient: AnyClient,
  bookingId: string,
  idempotencyKey: string,
): Promise<AnyRecord | null> {
  const { data, error } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(
      "id, amount, status, paid_at, confirm_failed_at, confirm_failure_reason",
    )
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
  if (paymentMethod !== "cash")
    throw createError({
      statusCode: 422,
      statusMessage: "paymentMethod must be 'cash'",
    });

  const booking = await loadBookingForPayment(adminClient, bookingId);

  const posBranchId = asText(booking.pos_branch_id);
  if (!posBranchId)
    throw createError({
      statusCode: 422,
      statusMessage: "Booking is not a POS V3 booking",
    });

  await assertPosBranchAccess({
    adminClient,
    platformRole,
    userId: staffUserId,
    branchId: posBranchId,
  });

  if (asText(booking.status) !== "draft")
    throw createError({
      statusCode: 422,
      statusMessage: "Only draft bookings can be finalized",
    });

  const depositStatus = asText(
    booking.booking_deposit_payment_status || "unpaid",
  );
  if (depositStatus === "paid")
    throw createError({
      statusCode: 409,
      statusMessage: "Booking deposit is already paid",
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
      bookingDepositPaidAmount: asMoney(existingAttempt.amount),
      currencyCode: asText(booking.currency_code) || "THB",
      idempotent: true,
    };
  }

  // Reject zero-due finalization
  if (amount <= 0)
    throw createError({
      statusCode: 422,
      statusMessage: ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED,
    });

  // Validate amount matches server-computed deposit
  const expectedDepositAmount = calculateBookingDepositDueNow({
    rentalDays: Number(booking.rental_days ?? 0),
    requiredSecurityDepositAmount: Number(booking.deposit_amount ?? 0),
  });
  if (Math.abs(amount - expectedDepositAmount) > 0.01)
    throw createError({
      statusCode: 422,
      statusMessage: "BOOKING_DEPOSIT_AMOUNT_MISMATCH",
    });

  // Re-validate inventory availability (drafts do not block inventory)
  await assertRentalBookingAvailability(adminClient, {
    assetId: booking.asset_id as string | null,
    skuId: booking.sku_id as string | null,
    startDate: booking.start_date,
    endDate: booking.end_date,
    excludeBookingId: bookingId,
  });

  const currencyCode = asText(booking.currency_code) || "THB";
  const now = new Date().toISOString();

  // Create POS payment attempt — durable cash collection record
  const { data: attempt, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .insert({
      rental_booking_id: bookingId,
      payment_purpose: "booking_deposit",
      payment_method: "cash",
      amount,
      currency_code: currencyCode,
      status: "paid",
      branch_id: posBranchId,
      staff_user_id: staffUserId,
      idempotency_key: idempotencyKey,
      paid_at: now,
      metadata: {
        source: "pos_v3_booking_deposit_cash",
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
          bookingDepositPaidAmount: asMoney(existing.amount),
          currencyCode,
          idempotent: true,
        };
      throw createError({
        statusCode: 409,
        statusMessage: "IDEMPOTENCY_KEY_AMOUNT_CONFLICT",
      });
    }
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  }

  const attemptId = String(attempt.id);

  // Delegate shared finalization (held-balance event + booking update + confirmation)
  // to the payment-method-agnostic finalizer. Cash-specific attempt creation above
  // remains endpoint-side; the finalizer owns everything from event recording onward.
  const finalizerResult = await finalizePosRentalBookingDeposit({
    adminClient,
    booking,
    attemptId,
    amount,
    paymentMethod: "cash",
    branchId: posBranchId,
    staffUserId,
    idempotencyKey,
  });

  if (finalizerResult.status === "paid_confirm_failed") {
    return {
      status: "paid_confirm_failed",
      paymentAttemptId: attemptId,
      bookingDepositPaidAmount: finalizerResult.bookingDepositPaidAmount,
      currencyCode: finalizerResult.currencyCode,
      warnings: finalizerResult.warnings,
    };
  }

  return {
    status: "confirmed",
    booking: finalizerResult.booking,
    paymentAttemptId: attemptId,
  };
});
