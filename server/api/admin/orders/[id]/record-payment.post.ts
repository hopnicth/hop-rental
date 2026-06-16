/**
 * POST /api/admin/orders/:id/record-payment
 *
 * Admin marks a sale order paid after MANUALLY verifying a bank-transfer slip.
 * Reuses the existing safe order paid path: payment_status -> paid, status ->
 * confirmed, idempotent inventory deduction (f_apply_order_inventory), and
 * cart clear. No VAT/revenue logic is invented (none exists). Never touches
 * rental ledgers or Omise.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin).
 * Input:   JSON body { paymentSlipId?: uuid, adminNote?: string }
 * Returns: { order, alreadyPaid, paymentSlipReviewed }
 * Errors:  400 | 401 | 403 | 404 | 422 | 500
 *
 * Idempotent: a replay on an already-paid order returns alreadyPaid without
 * re-applying inventory or re-clearing the cart.
 */
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { asUuidOrNull } from "~~/server/utils/sale-order-payment-slip-evidence";
import { recordManualSalePayment } from "~~/server/utils/sale-order-manual-payment";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);

  const orderId = asUuidOrNull(getRouterParam(event, "id"));
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ORDER_ID" });
  }

  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const paymentSlipId =
    (body.paymentSlipId ?? body.payment_slip_id) != null
      ? String(body.paymentSlipId ?? body.payment_slip_id)
      : null;
  const adminNote =
    (body.adminNote ?? body.admin_note) != null
      ? String(body.adminNote ?? body.admin_note)
      : null;

  const result = await recordManualSalePayment({
    adminClient,
    orderId,
    adminUserId: String(userId),
    paymentSlipId,
    adminNote,
  });

  return result;
});
