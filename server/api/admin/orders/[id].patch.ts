import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ORDER_DETAIL_SELECT,
  ADMIN_ORDER_ITEMS_SELECT,
  ORDER_FULFILLMENT_STATUS_TRANSITIONS,
  ORDER_PAYMENT_STATUS_TRANSITIONS,
  ORDER_STATUS_TRANSITIONS,
  fetchAdminCustomerProfile,
  mapAdminSaleOrderDetail,
  mapAdminSaleOrderItem,
} from "~~/server/utils/admin-orders";
import {
  autoResolveOrderAlerts,
  fetchAlertsForOrder,
} from "~~/server/utils/admin-alerts";
import type {
  AdminSaleOrderDetail,
  AdminSaleOrderPatchPayload,
} from "~~/app/types/admin-order-detail";
import type {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "~~/app/types/order";

function validateTransition<T extends string>(
  table: Record<T, T[]>,
  from: T,
  to: T,
  label: string,
): void {
  const allowed = table[from] ?? [];
  if (from === to) return;
  if (!allowed.includes(to)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Invalid ${label} transition: ${from} → ${to}`,
    });
  }
}

export default defineEventHandler(
  async (event): Promise<AdminSaleOrderDetail> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Order id is required",
      });
    }

    const body = (await readBody<AdminSaleOrderPatchPayload>(event)) ?? {};

    const { data: current, error: currentError } = await adminClient
      .from("orders")
      .select("status, payment_status, fulfillment_status")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      throw createError({
        statusCode: 500,
        statusMessage: currentError.message,
      });
    }
    if (!current) {
      throw createError({ statusCode: 404, statusMessage: "Order not found" });
    }

    const update: Record<string, unknown> = {};

    if (body.status !== undefined) {
      validateTransition(
        ORDER_STATUS_TRANSITIONS,
        current.status as OrderStatus,
        body.status,
        "order status",
      );
      update.status = body.status;
    }
    if (body.paymentStatus !== undefined) {
      validateTransition(
        ORDER_PAYMENT_STATUS_TRANSITIONS,
        current.payment_status as OrderPaymentStatus,
        body.paymentStatus,
        "payment status",
      );
      update.payment_status = body.paymentStatus;
    }
    if (body.fulfillmentStatus !== undefined) {
      validateTransition(
        ORDER_FULFILLMENT_STATUS_TRANSITIONS,
        current.fulfillment_status as OrderFulfillmentStatus,
        body.fulfillmentStatus,
        "fulfillment status",
      );
      update.fulfillment_status = body.fulfillmentStatus;
    }
    if (body.notes !== undefined) {
      update.notes = body.notes;
    }
    if (body.trackingCarrier !== undefined) {
      update.tracking_carrier =
        typeof body.trackingCarrier === "string"
          ? body.trackingCarrier.trim() || null
          : null;
    }
    if (body.trackingNumber !== undefined) {
      update.tracking_number =
        typeof body.trackingNumber === "string"
          ? body.trackingNumber.trim() || null
          : null;
    }
    if (body.trackingNote !== undefined) {
      update.tracking_note =
        typeof body.trackingNote === "string"
          ? body.trackingNote.trim() || null
          : null;
    }

    if (Object.keys(update).length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No updatable fields supplied",
      });
    }

    const { data: updated, error: updateError } = await adminClient
      .from("orders")
      .update(update)
      .eq("id", id)
      .select(ADMIN_ORDER_DETAIL_SELECT)
      .single();

    if (updateError) {
      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      });
    }

    const { data: itemRows } = await adminClient
      .from("order_items")
      .select(ADMIN_ORDER_ITEMS_SELECT)
      .eq("order_id", id)
      .order("created_at", { ascending: true });

    const items = (itemRows ?? []).map((row: unknown) =>
      mapAdminSaleOrderItem(row),
    );
    const customer = await fetchAdminCustomerProfile(
      adminClient,
      String((updated as Record<string, unknown>).user_id ?? ""),
    );

    // Auto-resolve admin alerts when tracking is recorded: a saved tracking
    // number signals fulfilment is in motion, which implicitly handles any
    // outstanding inventory/payment alerts on the order.
    const trackingTouched =
      body.trackingCarrier !== undefined ||
      body.trackingNumber !== undefined ||
      body.trackingNote !== undefined;
    if (trackingTouched) {
      await autoResolveOrderAlerts(adminClient, id, userId);
    }
    const alerts = await fetchAlertsForOrder(adminClient, id);

    return mapAdminSaleOrderDetail(updated, items, customer, alerts);
  },
);
