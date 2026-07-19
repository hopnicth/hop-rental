/**
 * GET /api/admin/rental-bookings/stuck-deposits
 *
 * B-M1 recovery surface: lists bookings stuck in
 * booking_deposit_payment_status='paid_confirm_failed' with money context
 * (captured amount, live ledger held, failure age). Read surface →
 * requirePlatformAdmin; the two exits carry their own gates
 * (retry-confirm: platform admin; refund: super_admin company-cancel).
 *
 * Returns: { items: StuckDepositBooking[] }
 * Errors: 401 | 403 | 500
 */
import { defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { listStuckDepositBookings } from "~~/server/utils/admin-stuck-deposits";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  return { items: await listStuckDepositBookings(adminClient) };
});
