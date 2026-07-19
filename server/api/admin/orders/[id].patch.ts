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
    const { adminClient, userId, platformRole } =
      await requirePlatformAdmin(event);
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
    const isSuperAdmin = platformRole === "super_admin";

    if (body.status !== undefined) {
      if (body.status === "cancelled") {
        // T3 walk 4: the raw cancel flip is RETIRED. Cancellation is a money
        // operation (refund record + stock restore + request closure) and
        // must go through POST /api/admin/orders/:id/cancel — the mig-128
        // RPC path with §F decision logging. Two live cancel paths may not
        // coexist.
        throw createError({
          statusCode: 409,
          statusMessage:
            "SALE_ORDER_CANCEL_MOVED: use POST /api/admin/orders/:id/cancel",
        });
      }
      validateTransition(
        ORDER_STATUS_TRANSITIONS,
        current.status as OrderStatus,
        body.status,
        "order status",
      );
      update.status = body.status;
    }
    if (body.paymentStatus !== undefined) {
      if (body.paymentStatus === "refunded" || body.paymentStatus === "cancelled") {
        // Money-truth payment states are RPC-owned (mig 128): refunds settle
        // via POST /api/admin/orders/refunds/:id/settle; cancellation via
        // POST /api/admin/orders/:id/cancel. Raw path closed (CHiP ruling).
        throw createError({
          statusCode: 409,
          statusMessage:
            "SALE_ORDER_PAYMENT_STATUS_MOVED: money-truth transitions go through the cancel/settle RPC endpoints",
        });
      }
      if (!isSuperAdmin) {
        throw createError({
          statusCode: 403,
          statusMessage: "Super admin access required to change payment status",
        });
      }
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
    if (trackingTouched && isSuperAdmin) {
      await autoResolveOrderAlerts(adminClient, id, userId);
    }
    const alerts = await fetchAlertsForOrder(adminClient, id);

    return mapAdminSaleOrderDetail(updated, items, customer, alerts);
  },
);
