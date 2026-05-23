import { createError, defineEventHandler, getHeader, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  mapPosQrAttemptResponse,
  POS_QR_ATTEMPT_SELECT,
} from "~~/server/utils/pos-rental-qr-booking-deposit";
import {
  createOmisePromptPayCharge,
  retrieveOmiseCharge,
} from "~~/server/utils/omise";
import { applyPosRentalQrRemainingDepositGatewayResult } from "~~/server/utils/pos-rental-qr-remaining-deposit";

// asset join provides storage_branch_id as branch fallback for non-POS (online) bookings
const BOOKING_SELECT =
  "id, status, deposit_amount, deposit_paid_amount, deposit_payment_status, booking_deposit_payment_status, booking_deposit_paid_amount, pos_branch_id, currency_code, asset:assets(storage_branch_id)";
const PAYMENT_LINE_SELECT = "line_type, status, source, metadata";
const REMAINING_SECURITY_DEPOSIT_ALREADY_PAID =
  "REMAINING_SECURITY_DEPOSIT_ALREADY_PAID";
const NO_REMAINING_SECURITY_DEPOSIT_DUE = "NO_REMAINING_SECURITY_DEPOSIT_DUE";
// Bug 2 fix: blocks new QR when a prior QR attempt was gateway-paid but internal
// finalization failed. Omise already captured money — new QR must not be issued.
const GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW =
  "GATEWAY_PAID_CONFIRMATION_FAILED_MANUAL_REVIEW";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asMoney(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}
function asMetadata(v: unknown): AnyRecord {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as AnyRecord)
    : {};
}

/** Extracts storage_branch_id from the booking's joined asset row. */
function getStorageBranchId(booking: AnyRecord): string | null {
  const asset = booking.asset as AnyRecord | null | undefined;
  return typeof asset?.storage_branch_id === "string"
    ? asset.storage_branch_id
    : null;
}

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

function isPosV3SameDayBooking(lines: AnyRecord[]): boolean {
  return lines.some((line) => {
    if (asText(line.status) === "voided") return false;
    const md = asMetadata(line.metadata);
    return (
      asText(line.source) === "pos_v3_same_day_quote" ||
      asText(md.bookingDepositPolicy) === "not_applicable_same_day"
    );
  });
}

async function findExistingQrAttempt(
  adminClient: AnyClient,
  bookingId: string,
  idempotencyKey: string,
): Promise<AnyRecord | null> {
  const { data, error } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("rental_booking_id", bookingId)
    .eq("payment_purpose", "remaining_security_deposit")
    .eq("payment_method", "promptpay_qr")
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
  const clientAmount = asMoney(body.amount);
  if (!idempotencyKey)
    throw createError({
      statusCode: 422,
      statusMessage: "idempotencyKey is required",
    });

  const { data: bookingData, error: bookingError } = await adminClient
    .from("rental_bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError)
    throw createError({ statusCode: 500, statusMessage: bookingError.message });
  if (!bookingData)
    throw createError({
      statusCode: 404,
      statusMessage: "Rental booking not found",
    });
  const booking = bookingData as AnyRecord;

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
      statusMessage: "Only confirmed bookings can accept remaining deposit QR",
    });

  const { data: linesData } = await adminClient
    .from("rental_booking_payment_lines")
    .select(PAYMENT_LINE_SELECT)
    .eq("booking_id", bookingId);
  const sameDayBooking = isPosV3SameDayBooking(
    Array.isArray(linesData) ? (linesData as AnyRecord[]) : [],
  );

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

  // Bug 2 fix: block new QR if a prior attempt is gateway-paid but internally failed.
  // Omise already captured the money — creating another QR would double-collect.
  // This covers paid_confirm_failed attempts that have a gateway_charge_id set.
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

  const requiredDeposit = asMoney(booking.deposit_amount);
  const bookingDepositPaid = asMoney(booking.booking_deposit_paid_amount);
  const expectedRemaining = Math.max(
    0,
    Math.round((requiredDeposit - bookingDepositPaid) * 100) / 100,
  );
  if (expectedRemaining <= 0)
    throw createError({
      statusCode: 422,
      statusMessage: NO_REMAINING_SECURITY_DEPOSIT_DUE,
    });
  if (clientAmount > 0 && Math.abs(clientAmount - expectedRemaining) > 0.01)
    throw createError({
      statusCode: 422,
      statusMessage: "REMAINING_SECURITY_DEPOSIT_AMOUNT_MISMATCH",
    });
  const amount = expectedRemaining;
  const currencyCode = asText(booking.currency_code) || "THB";

  // Idempotency: return existing pending attempt if same key
  const existingByKey = await findExistingQrAttempt(
    adminClient,
    bookingId,
    idempotencyKey,
  );
  if (existingByKey) {
    const s = asText(existingByKey.status);
    if (s === "pending") return mapPosQrAttemptResponse(existingByKey);
    if (s === "paid" || s === "finalizing" || s === "paid_confirm_failed")
      throw createError({
        statusCode: 409,
        statusMessage: "PAYMENT_ALREADY_PROCESSED",
      });
    return { ...mapPosQrAttemptResponse(existingByKey), idempotent: true };
  }

  // One-active-QR rule: verify any existing pending/finalizing attempt at gateway
  const ACTIVE_QR_STATUSES = ["pending", "requires_action", "finalizing"];
  const { data: activeQr } = await adminClient
    .from("pos_rental_payment_attempts")
    .select(POS_QR_ATTEMPT_SELECT)
    .eq("rental_booking_id", bookingId)
    .eq("payment_purpose", "remaining_security_deposit")
    .eq("payment_method", "promptpay_qr")
    .in("status", ACTIVE_QR_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeQr) {
    const oldChargeId = asText(activeQr.gateway_charge_id);
    if (!oldChargeId)
      throw createError({
        statusCode: 409,
        statusMessage: "EXISTING_ACTIVE_QR_NOT_EXPIRED",
      });
    let liveCharge: Awaited<ReturnType<typeof retrieveOmiseCharge>>;
    try {
      liveCharge = await retrieveOmiseCharge(event, oldChargeId);
    } catch {
      throw createError({
        statusCode: 409,
        statusMessage: "EXISTING_ACTIVE_QR_NOT_EXPIRED",
      });
    }

    const gwStatus = liveCharge.status;
    const localStatus = asText(activeQr.status);
    if (localStatus === "finalizing") {
      if (gwStatus === "paid") {
        const { data: b } = await adminClient
          .from("rental_bookings")
          .select(
            "id, deposit_amount, deposit_paid_amount, deposit_payment_status, booking_deposit_payment_status, booking_deposit_paid_amount, currency_code, pos_branch_id, pos_staff_user_id",
          )
          .eq("id", bookingId)
          .maybeSingle();
        if (b)
          await applyPosRentalQrRemainingDepositGatewayResult({
            client: adminClient,
            posAttempt: activeQr as AnyRecord,
            booking: b as AnyRecord,
            result: liveCharge,
          });
      }
      throw createError({
        statusCode: 409,
        statusMessage: "PAYMENT_ALREADY_PROCESSED",
      });
    }
    if (gwStatus === "paid") {
      const { data: b } = await adminClient
        .from("rental_bookings")
        .select(
          "id, deposit_amount, deposit_paid_amount, deposit_payment_status, booking_deposit_payment_status, booking_deposit_paid_amount, currency_code, pos_branch_id, pos_staff_user_id",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (b)
        await applyPosRentalQrRemainingDepositGatewayResult({
          client: adminClient,
          posAttempt: activeQr as AnyRecord,
          booking: b as AnyRecord,
          result: liveCharge,
        });
      throw createError({
        statusCode: 409,
        statusMessage: "PAYMENT_ALREADY_PROCESSED",
      });
    }
    if (gwStatus === "pending" || gwStatus === "requires_action")
      throw createError({
        statusCode: 409,
        statusMessage: "EXISTING_ACTIVE_QR_NOT_EXPIRED",
      });
    const termUpdate: AnyRecord = { status: gwStatus };
    if (gwStatus === "expired")
      termUpdate.expired_at = new Date().toISOString();
    await adminClient
      .from("pos_rental_payment_attempts")
      .update(termUpdate)
      .eq("id", asText(activeQr.id));
  }

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data: attempt, error: attemptError } = await adminClient
    .from("pos_rental_payment_attempts")
    .insert({
      rental_booking_id: bookingId,
      payment_purpose: "remaining_security_deposit",
      payment_method: "promptpay_qr",
      amount,
      currency_code: currencyCode,
      status: "pending",
      gateway: "omise",
      branch_id: posBranchId,
      staff_user_id: staffUserId,
      idempotency_key: idempotencyKey,
      expires_at: expiresAt,
      metadata: {
        source: "pos_v3_remaining_security_deposit_promptpay_qr",
        bookingChannel: "admin_pos_v3",
      },
    })
    .select(POS_QR_ATTEMPT_SELECT)
    .single();

  if (attemptError) {
    if (attemptError.code === "23505") {
      const { data: race } = await adminClient
        .from("pos_rental_payment_attempts")
        .select(POS_QR_ATTEMPT_SELECT)
        .eq("rental_booking_id", bookingId)
        .eq("payment_purpose", "remaining_security_deposit")
        .eq("payment_method", "promptpay_qr")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (race) return mapPosQrAttemptResponse(race as AnyRecord);
    }
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  }

  const attemptId = String(attempt.id);
  const proto = getHeader(event, "x-forwarded-proto") ?? "http";
  const host =
    getHeader(event, "x-forwarded-host") ??
    getHeader(event, "host") ??
    "localhost";
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
        payment_context: "pos_v3_remaining_security_deposit_qr",
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
    await adminClient
      .from("pos_rental_payment_attempts")
      .update({ status: "failed" })
      .eq("id", attemptId);
    throw err;
  }
});
