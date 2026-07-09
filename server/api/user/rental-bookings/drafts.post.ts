/**
 * POST /api/user/rental-bookings/drafts
 *
 * Create ONE rental booking draft for the authenticated customer. Replaces
 * the previous client-side direct PostgREST insert into `rental_bookings`
 * (which sent `asset_id: null` → CHECK `rental_bookings_root_chk` 400 with a
 * false success toast). Validation + pricing + insert happen server-side via
 * `createCustomerRentalBookingDraft`; `user_id` is taken from the session,
 * never from the body.
 *
 * Auth:    serverSupabaseUser (authenticated customer).
 * Body:    { assetId, startDate, returnDate, bookerName?, bookerPhone?,
 *            productId?, skuId?, matchedProductId?, matchedProductName?, branchId? }
 * Returns: { booking } — the created draft row.
 * Errors:  401 | 404 | 409 | 422 | 500
 *
 * EVIDENCE ONLY. The row stays `draft`; no confirmation, no held balance,
 * no inventory, no Omise/KYC.
 */
import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseSession,
  serverSupabaseUser,
} from "#supabase/server";
import { createCustomerRentalBookingDraft } from "~~/server/utils/customer-rental-booking-draft";

export default defineEventHandler(async (event) => {
  // Refresh an expired access token before getUser to avoid a false 401.
  try {
    await serverSupabaseSession(event);
  } catch {
    /* swallow — getUser below is authoritative */
  }

  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const client = serverSupabaseServiceRole(event);

  const booking = await createCustomerRentalBookingDraft(client as never, {
    userId: String(userId),
    input: {
      assetId: typeof body.assetId === "string" ? body.assetId : null,
      startDate: typeof body.startDate === "string" ? body.startDate : null,
      returnDate: typeof body.returnDate === "string" ? body.returnDate : null,
      bookerName: typeof body.bookerName === "string" ? body.bookerName : null,
      bookerPhone:
        typeof body.bookerPhone === "string" ? body.bookerPhone : null,
      productId: typeof body.productId === "string" ? body.productId : null,
      skuId: typeof body.skuId === "string" ? body.skuId : null,
      matchedProductId:
        typeof body.matchedProductId === "string"
          ? body.matchedProductId
          : null,
      matchedProductName:
        typeof body.matchedProductName === "string"
          ? body.matchedProductName
          : null,
      branchId: typeof body.branchId === "string" ? body.branchId : null,
    },
  });

  return { booking };
});
