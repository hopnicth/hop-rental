import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { ADMIN_SKU_INVENTORY_SELECT } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const inventoryId = getRouterParam(event, "inventoryId");
  const stockId = getRouterParam(event, "stockId");

  if (!inventoryId || !stockId) {
    throw createError({
      statusCode: 400,
      statusMessage: "inventoryId and stockId are required",
    });
  }

  const { data: current } = await adminClient
    .from("sku_branch_inventory")
    .select(ADMIN_SKU_INVENTORY_SELECT)
    .eq("inventory_id", inventoryId)
    .eq("id", stockId)
    .single();

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .delete()
    .eq("inventory_id", inventoryId)
    .eq("id", stockId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw createError({
      statusCode: error.code === "23503" ? 409 : 500,
      statusMessage: error.message,
    });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Stock row not found",
    });
  }

  if (current) {
    await adminClient.from("inventory_change_log").insert({
      inventory_id: inventoryId,
      sku_id: String(current.sku_id ?? ""),
      branch_id: String(current.branch_id ?? ""),
      action: "delete",
      changed_by: userId,
      old_values: current,
      new_values: null,
    });
  }

  return { ok: true };
});
