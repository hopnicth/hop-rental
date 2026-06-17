/**
 * GET /api/admin/manual-payment-requests/by-target
 *
 * Staff/admin lookup of the related payment request for a target (sale order or
 * rental booking deposit), so admin order/booking detail pages can show a card
 * linking to the admin payment-request detail.
 *
 * Auth:    requirePlatformAdmin.
 * Query:   target_type = sale_order | rental_booking_deposit ; target_id = uuid
 * Returns: { request: RelatedRequestSummary | null }
 * Errors:  400 | 401 | 403 | 500
 */
import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { findAdminRequestByTarget } from "~~/server/utils/manual-payment-request";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const q = getQuery(event);
  const targetType =
    q.target_type === "rental_booking_deposit"
      ? "rental_booking_deposit"
      : q.target_type === "sale_order"
        ? "sale_order"
        : null;
  const targetId = typeof q.target_id === "string" ? q.target_id : "";
  if (!targetType || !targetId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_TARGET" });
  }

  const request = await findAdminRequestByTarget(
    adminClient,
    targetType,
    targetId,
  );
  return { request };
});
