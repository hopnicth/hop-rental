import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_SKU_INVENTORY_WITH_REF_SELECT,
  mapAdminSkuInventoryItem,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const inventoryId = getRouterParam(event, "inventoryId");

  if (!inventoryId) {
    throw createError({
      statusCode: 400,
      statusMessage: "inventoryId is required",
    });
  }

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .select(ADMIN_SKU_INVENTORY_WITH_REF_SELECT)
    .eq("inventory_id", inventoryId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    items: (data ?? []).map((row) =>
      mapAdminSkuInventoryItem(row as Record<string, unknown>),
    ),
  };
});
