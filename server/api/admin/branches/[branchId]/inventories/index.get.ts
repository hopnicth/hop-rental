import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_INVENTORY_SELECT,
  mapAdminInventoryItem,
} from "~~/server/utils/admin-inventories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const branchId = getRouterParam(event, "branchId");

  if (!branchId) {
    throw createError({
      statusCode: 400,
      statusMessage: "branchId is required",
    });
  }

  const { data, error } = await adminClient
    .from("inventories")
    .select(ADMIN_INVENTORY_SELECT)
    .eq("branch_id", branchId)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    items: (data ?? []).map((row) => mapAdminInventoryItem(row)),
  };
});
