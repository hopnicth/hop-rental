import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ORDER_DETAIL_SELECT,
  ADMIN_ORDER_ITEMS_SELECT,
  fetchAdminCustomerProfile,
  mapAdminSaleOrderDetail,
  mapAdminSaleOrderItem,
} from "~~/server/utils/admin-orders";
import { fetchAlertsForOrder } from "~~/server/utils/admin-alerts";
import type { AdminSaleOrderDetail } from "~~/app/types/admin-order-detail";

export default defineEventHandler(
  async (event): Promise<AdminSaleOrderDetail> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const id = getRouterParam(event, "id");

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Order id is required",
      });
    }

    const { data: orderRow, error: orderError } = await adminClient
      .from("orders")
      .select(ADMIN_ORDER_DETAIL_SELECT)
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

    const { data: itemRows, error: itemsError } = await adminClient
      .from("order_items")
      .select(ADMIN_ORDER_ITEMS_SELECT)
      .eq("order_id", id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      throw createError({
        statusCode: 500,
        statusMessage: itemsError.message,
      });
    }

    const items = (itemRows ?? []).map((row: unknown) =>
      mapAdminSaleOrderItem(row),
    );
    const customer = await fetchAdminCustomerProfile(
      adminClient,
      String((orderRow as Record<string, unknown>).user_id ?? ""),
    );

    const alerts = await fetchAlertsForOrder(adminClient, id);
    return mapAdminSaleOrderDetail(orderRow, items, customer, alerts);
  },
);
