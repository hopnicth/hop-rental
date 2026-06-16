/**
 * POST /api/admin/rental-bookings/:id/record-deposit
 *
 * Admin records a MANUALLY-VERIFIED bank-transfer booking deposit and confirms
 * the booking. The deposit is recorded as a held-balance liability (never
 * revenue, never VAT, never Omise/payment_attempts) and the booking is
 * confirmed ONLY through confirmRentalBooking() — this route never sets
 * rental_bookings.status directly.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Input:   JSON body
 *            amount            — number > 0 (deposit received)
 *            paymentChannel    — uploaded_slip | line_slip | whatsapp_slip | manual
 *            depositSlipId?    — uuid; if given, must belong to this booking and
 *                                is marked reviewed
 *            externalReference?— optional bank/transfer reference
 *            adminNote?        — optional note
 * Returns: { booking, heldBalanceEventId, depositSlipReviewed, alreadyConfirmed }
 * Errors:  400 | 401 | 403 | 404 | 409 | 422 | 500
 *
 * Idempotent: a replay resolves to the existing held-balance event (no
 * duplicate money row); an already-confirmed booking returns alreadyConfirmed.
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { asUuidOrNull } from "~~/server/utils/rental-deposit-slip-evidence";
import {
  recordManualBookingDeposit,
  type ManualDepositPaymentChannel,
} from "~~/server/utils/rental-manual-deposit-confirmation";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);

  const bookingId = asUuidOrNull(getRouterParam(event, "id"));
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_BOOKING_ID" });
  }

  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const amount = Number(body.amount ?? 0);
  const paymentChannel = (body.paymentChannel ?? body.payment_channel) as
    | ManualDepositPaymentChannel
    | undefined;
  const depositSlipId =
    (body.depositSlipId ?? body.deposit_slip_id) != null
      ? String(body.depositSlipId ?? body.deposit_slip_id)
      : null;
  const externalReference =
    (body.externalReference ?? body.external_reference) != null
      ? String(body.externalReference ?? body.external_reference)
      : null;
  const adminNote =
    (body.adminNote ?? body.admin_note) != null
      ? String(body.adminNote ?? body.admin_note)
      : null;

  const result = await recordManualBookingDeposit({
    adminClient,
    bookingId,
    adminUserId: String(userId),
    amount,
    paymentChannel: paymentChannel as ManualDepositPaymentChannel,
    depositSlipId,
    externalReference,
    adminNote,
  });

  return result;
});
