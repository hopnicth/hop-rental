/**
 * GET /api/admin/rental-bookings/:id/deposit-slips/:slipId/signed-url
 *
 * Mint a SHORT-LIVED signed URL for one stored deposit slip so an admin can
 * view the bank-transfer evidence. This is the ONLY sanctioned way to view a
 * slip — the bucket is private and there is no permanent public URL.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Guard:   the slip must belong to the booking in the path (else 404) — a slip
 *          id from a different booking is never served.
 * Returns: { url: string, ttlSeconds: number } — the URL expires quickly.
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  RENTAL_DEPOSIT_SLIP_DOWNLOAD_SELECT,
  RENTAL_DEPOSIT_SLIP_SIGNED_URL_TTL_SECONDS,
  asUuidOrNull,
  createRentalDepositSlipSignedUrl,
  type RentalDepositSlipClient,
} from "~~/server/utils/rental-deposit-slip-evidence";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const bookingId = asUuidOrNull(getRouterParam(event, "id"));
  const slipId = asUuidOrNull(getRouterParam(event, "slipId"));
  if (!bookingId || !slipId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ID" });
  }

  const { data: slip, error } = await adminClient
    .from("rental_booking_deposit_slips")
    .select(RENTAL_DEPOSIT_SLIP_DOWNLOAD_SELECT)
    .eq("id", slipId)
    .maybeSingle();
  if (error) {
    console.error("[rental] deposit slip read failed", error.message);
    throw createError({
      statusCode: 500,
      statusMessage: "DEPOSIT_SLIP_READ_FAILED",
    });
  }
  // A nonexistent slip OR a slip belonging to a different booking → 404 (never
  // confirm cross-booking existence).
  if (!slip || String(slip.rental_booking_id ?? "") !== bookingId) {
    throw createError({ statusCode: 404, statusMessage: "Slip not found" });
  }

  const storagePath = String(slip.storage_path ?? "");
  if (!storagePath) {
    throw createError({
      statusCode: 500,
      statusMessage: "DEPOSIT_SLIP_PATH_MISSING",
    });
  }

  const url = await createRentalDepositSlipSignedUrl(
    adminClient as unknown as RentalDepositSlipClient,
    storagePath,
  );

  return { url, ttlSeconds: RENTAL_DEPOSIT_SLIP_SIGNED_URL_TTL_SECONDS };
});
