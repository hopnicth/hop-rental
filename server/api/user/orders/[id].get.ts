/**
 * GET /api/user/orders/:id
 *
 * Ownership-checked single SALE ORDER detail for the authenticated customer.
 * Returns the order summary, its line items, and the customer's uploaded
 * payment-slip metadata (safe — never storage paths/URLs). Read-only.
 *
 * Auth:    serverSupabaseUser + ownership (order.user_id === session user).
 * Returns: { order, items, paymentSlips }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT,
  asUuidOrNull,
  toSafeSaleOrderPaymentSlip,
} from "~~/server/utils/sale-order-payment-slip-evidence";

const ORDER_SELECT =
  "id, order_number, user_id, status, payment_status, fulfillment_status, payment_method, subtotal, discount_total, shipping_cost, grand_total, currency_code, created_at";
const ITEM_SELECT =
  "id, name, thumbnail, unit_price, quantity, line_total";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const orderId = asUuidOrNull(getRouterParam(event, "id"));
  if (!orderId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_ORDER_ID" });
  }

  const client = serverSupabaseServiceRole(event);

  const { data: order, error: orderError } = await client
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("[orders] customer order read failed", orderError.message);
    throw createError({ statusCode: 500, statusMessage: "ORDER_READ_FAILED" });
  }
  if (!order) {
    throw createError({ statusCode: 404, statusMessage: "Order not found" });
  }
  if (String(order.user_id ?? "") !== String(userId)) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  const { data: items } = await client
    .from("order_items")
    .select(ITEM_SELECT)
    .eq("order_id", orderId);

  const { data: slips } = await client
    .from("sale_order_payment_slips")
    .select(SALE_ORDER_PAYMENT_SLIP_SAFE_SELECT)
    .eq("order_id", orderId)
    .order("uploaded_at", { ascending: false });

  return {
    order: {
      id: String(order.id),
      orderNumber: String(order.order_number ?? ""),
      status: String(order.status ?? ""),
      paymentStatus: String(order.payment_status ?? ""),
      fulfillmentStatus: String(order.fulfillment_status ?? ""),
      paymentMethod: order.payment_method ?? null,
      subtotal: Number(order.subtotal ?? 0),
      discountTotal: Number(order.discount_total ?? 0),
      shippingCost: Number(order.shipping_cost ?? 0),
      grandTotal: Number(order.grand_total ?? 0),
      currencyCode: String(order.currency_code ?? "THB"),
      createdAt: String(order.created_at ?? ""),
    },
    items: ((items ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      thumbnail: r.thumbnail ?? null,
      unitPrice: Number(r.unit_price ?? 0),
      quantity: Number(r.quantity ?? 0),
      lineTotal: Number(r.line_total ?? 0),
    })),
    paymentSlips: ((slips ?? []) as Record<string, unknown>[]).map(
      toSafeSaleOrderPaymentSlip,
    ),
  };
});
