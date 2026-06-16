/**
 * GET /api/admin/orders/:id/payment-slips
 *
 * Admin list of customer-uploaded sale payment-slip evidence for one order.
 * Safe metadata only (filename, status, uploaded_at, mime, size) — never a
 * storage path/bucket or URL. Viewing a file requires the signed-url route.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Returns: { slips: SafeSaleOrderPaymentSlip[] } — newest first.
 * Errors:  400 | 401 | 403 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  toSafeSaleOrderPaymentSlip,
} from "~~/server/utils/sale-order-payment-slip-evidence";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const orderId = asUuidOrNull(getRouterParam(event, "id"));
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ORDER_ID" });
  }

  const { data, error } = await adminClient
    .from("sale_order_payment_slips")
    .select(SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT)
    .eq("order_id", orderId)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[orders] payment slips list read failed", error.message);
    throw createError({
      statusCode: 500,
      statusMessage: "PAYMENT_SLIPS_READ_FAILED",
    });
  }

  return {
    slips: ((data ?? []) as Record<string, unknown>[]).map(
      toSafeSaleOrderPaymentSlip,
    ),
  };
});
