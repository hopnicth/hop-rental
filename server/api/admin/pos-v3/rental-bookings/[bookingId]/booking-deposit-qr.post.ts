import { createError, defineEventHandler, getHeader, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { calculateBookingDepositDueNow } from "~~/app/utils/rental-payment-lines";
import { assertRentalBookingAvailability } from "~~/server/utils/rental-booking-availability";
import {
  createOmisePromptPayCharge,
  expireOmiseCharge,
} from "~~/server/utils/omise";
import {
  mapPosQrAttemptResponse,
  POS_QR_ATTEMPT_SELECT,
} from "~~/server/utils/pos-rental-qr-booking-deposit";

const BOOKING_SELECT =
  "id, user_id, walk_in_phone, status, asset_id, asset_name, booker_name, sku_id, start_date, end_date, rental_days, hub_id, deposit_amount, currency_code, booking_deposit_payment_status, booking_deposit_paid_amount, pos_branch_id, pos_staff_user_id";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asMoney(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
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
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) throw createError({ statusCode: 403, statusMessage: "No POS access for selected branch" });
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId: staffUserId, platformRole } = await requirePlatformAdmin(event);
  const bookingId = asText(event.context.params?.bookingId);
  if (!bookingId) throw createError({ statusCode: 422, statusMessage: "bookingId is required" });

  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const idempotencyKey = asText(body.idempotencyKey);
  const amount = asMoney(body.amount);
  if (!idempotencyKey) throw createError({ statusCode: 422, statusMessage: "idempotencyKey is required" });

  const { data: bookingData, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw createError({ statusCode: 500, statusMessage: bookingError.message });
  if (!bookingData) throw createError({ statusCode: 404, statusMessage: "Rental booking not found" });
  const booking = bookingData as AnyRecord;

  const posBranchId = asText(booking.pos_branch_id);
  if (!posBranchId) throw createError({ statusCode: 422, statusMessage: "Booking is not a POS V3 booking" });
  await assertPosBranchAccess({ adminClient, platformRole, userId: staffUserId, branchId: posBranchId });

  if (asText(booking.status) !== "draft")
    throw createError({ statusCode: 422, statusMessage: "Only draft bookings can accept QR payment" });
  const depositStatus = asText(booking.booking_deposit_payment_status || "unpaid");
  if (depositStatus === "paid") throw createError({ statusCode: 409, statusMessage: "Booking deposit is already paid" });
  if (amount <= 0) throw createError({ statusCode: 422, statusMessage: "ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED" });

  const expectedDepositAmount = calculateBookingDepositDueNow({
    rentalDays: Number(booking.rental_days ?? 0),
    requiredSecurityDepositAmount: Number(booking.deposit_amount ?? 0),
  });
  if (Math.abs(amount - expectedDepositAmount) > 0.01)
    throw createError({ statusCode: 422, statusMessage: "BOOKING_DEPOSIT_AMOUNT_MISMATCH" });

  const currencyCode = asText(booking.currency_code) || "THB";

  // Idempotency: check for existing QR attempt with this key
  const { data: existingByKey } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("rental_booking_id", bookingId)
    .eq("payment_method", "promptpay_qr")
    .eq("payment_purpose", "booking_deposit")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingByKey) {
    const s = asText(existingByKey.status);
    if (s === "pending") return mapPosQrAttemptResponse(existingByKey as AnyRecord);
    if (s === "paid" || s === "finalizing" || s === "paid_confirm_failed")
      throw createError({ statusCode: 409, statusMessage: "PAYMENT_ALREADY_PROCESSED" });
    // expired / failed / cancelled: return existing terminal — client must use new key to retry
    return { ...mapPosQrAttemptResponse(existingByKey as AnyRecord), idempotent: true };
  }

  // Inventory availability guard (drafts do not hold inventory)
  await assertRentalBookingAvailability(adminClient, {
    assetId: booking.asset_id as string | null,
    skuId: booking.sku_id as string | null,
    startDate: booking.start_date,
    endDate: booking.end_date,
    excludeBookingId: bookingId,
  });

  // One-active-pending-QR rule: expire any other pending QR for this booking+purpose
  const { data: pendingQr } = await adminClient
    .from("pos_rental_payment_attempts")
    .select("id, gateway_charge_id")
    .eq("rental_booking_id", bookingId)
    .eq("payment_purpose", "booking_deposit")
    .eq("payment_method", "promptpay_qr")
    .eq("status", "pending")
    .maybeSingle();

  if (pendingQr) {
    const oldChargeId = asText(pendingQr.gateway_charge_id);
    if (oldChargeId) {
      try { await expireOmiseCharge(event, oldChargeId); } catch { /* best-effort: expire locally regardless */ }
    }
    await adminClient
      .from("pos_rental_payment_attempts")
      .update({ status: "expired", expired_at: new Date().toISOString() })
      .eq("id", pendingQr.id);
  }

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data: attempt, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .insert({
      rental_booking_id: bookingId,
      payment_purpose: "booking_deposit",
      payment_method: "promptpay_qr",
      amount,
      currency_code: currencyCode,
      status: "pending",
      gateway: "omise",
      branch_id: posBranchId,
      staff_user_id: staffUserId,
      idempotency_key: idempotencyKey,
      expires_at: expiresAt,
      metadata: { source: "pos_v3_booking_deposit_promptpay_qr", bookingChannel: "admin_pos_v3" },
    })
    .select(POS_QR_ATTEMPT_SELECT)
    .single();

  if (attemptError) {
    if (attemptError.code === "23505") {
      const { data: race } = await adminClient
        .from("pos_rental_payment_attempts")
        .select(POS_QR_ATTEMPT_SELECT)
        .eq("rental_booking_id", bookingId)
        .eq("payment_method", "promptpay_qr")
        .eq("payment_purpose", "booking_deposit")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (race) return mapPosQrAttemptResponse(race as AnyRecord);
    }
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  }

  const attemptId = String(attempt.id);
  const proto = getHeader(event, "x-forwarded-proto") ?? "http";
  const host = getHeader(event, "x-forwarded-host") ?? getHeader(event, "host") ?? "localhost";
  const returnUri = `${proto}://${host}/admin/pos-v3/rental-bookings/${encodeURIComponent(bookingId)}`;

  try {
    const gatewayResult = await createOmisePromptPayCharge(event, {
      orderId: bookingId,
      paymentAttemptId: attemptId,
      amount,
      currency: currencyCode,
      returnUri,
      expiresAt,
      metadata: {
        booking_id: bookingId,
        pos_rental_payment_attempt_id: attemptId,
        payment_context: "pos_v3_booking_deposit_qr",
      },
    });

    await adminClient
      .from("pos_rental_payment_attempts")
      .update({
        gateway_charge_id: gatewayResult.gatewayChargeId,
        gateway_source_id: gatewayResult.gatewaySourceId,
        qr_image_url: gatewayResult.qrImageUrl,
        expires_at: expiresAt,
      })
      .eq("id", attemptId);

    return {
      paymentAttemptId: attemptId,
      qrImageUrl: gatewayResult.qrImageUrl,
      amount,
      currency: currencyCode,
      expiresAt,
      status: "pending",
    };
  } catch (err) {
    await adminClient.from("pos_rental_payment_attempts").update({ status: "failed" }).eq("id", attemptId);
    throw err;
  }
});
