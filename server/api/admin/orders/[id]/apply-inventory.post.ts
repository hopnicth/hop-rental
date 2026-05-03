import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ORDER_DETAIL_SELECT,
  ADMIN_ORDER_ITEMS_SELECT,
  fetchAdminCustomerProfile,
  mapAdminSaleOrderDetail,
  mapAdminSaleOrderItem,
} from "~~/server/utils/admin-orders";
import {
  autoResolveOrderAlerts,
  fetchAlertsForOrder,
} from "~~/server/utils/admin-alerts";
import { recordPaymentAlert } from "~~/server/utils/payments";
import type { AdminSaleOrderDetail } from "~~/app/types/admin-order-detail";

/**
 * Manual inventory retry. Called from the admin order detail page when
 * `f_apply_order_inventory` failed (or was skipped because migration 050 was
 * applied late). Idempotent: the RPC itself short-circuits if
 * inventory_applied_at is already set.
 */
export default defineEventHandler(
  async (event): Promise<AdminSaleOrderDetail> => {
    const { adminClient, userId } = await requirePlatformAdmin(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: "id required" });
    }

    const { data: orderRow, error: orderError } = await adminClient
      .from("orders")
      .select("id, payment_status, inventory_applied_at")
      .eq("id", id)
      .maybeSingle();
    if (orderError) {
      throw createError({
        statusCode: 500,
        statusMessage: orderError.message,
      });
    }
    if (!orderRow) {
      throw createError({ statusCode: 404, statusMessage: "Order not found" });
    }
    if (orderRow.payment_status !== "paid") {
      throw createError({
        statusCode: 409,
        statusMessage: "ORDER_NOT_PAID",
      });
    }

    const { error: rpcError } = await adminClient.rpc(
      "f_apply_order_inventory",
      { p_order_id: id },
    );

    if (rpcError) {
      await recordPaymentAlert(adminClient, {
        orderId: id,
        kind: "inventory_apply_failed",
        audience: "admin",
        severity: "critical",
        message: `Manual inventory retry failed: ${rpcError.message}`,
        metadata: {
          code: rpcError.code,
          details: rpcError.details,
          retriedBy: userId,
        },
      });
      throw createError({
        statusCode: 500,
        statusMessage: rpcError.message,
      });
    }

    await autoResolveOrderAlerts(adminClient, id, userId, {
      kind: "inventory_apply_failed",
    });

    const { data: fullOrder, error: fullErr } = await adminClient
      .from("orders")
      .select(ADMIN_ORDER_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (fullErr || !fullOrder) {
      throw createError({
        statusCode: 500,
        statusMessage: fullErr?.message ?? "Reload failed",
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
      String((fullOrder as Record<string, unknown>).user_id ?? ""),
    );
    const alerts = await fetchAlertsForOrder(adminClient, id);
    return mapAdminSaleOrderDetail(fullOrder, items, customer, alerts);
  },
);
