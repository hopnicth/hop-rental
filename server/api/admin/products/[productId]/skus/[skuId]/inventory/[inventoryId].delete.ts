import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { ADMIN_SKU_INVENTORY_SELECT } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");
  const skuId = getRouterParam(event, "skuId");
  const inventoryId = getRouterParam(event, "inventoryId");

  if (!productId || !skuId || !inventoryId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId, skuId, and inventoryId are required",
    });
  }

  // Fetch before delete for audit log
  const { data: current } = await adminClient
    .from("sku_branch_inventory")
    .select(ADMIN_SKU_INVENTORY_SELECT)
    .eq("product_id", productId)
    .eq("sku_id", skuId)
    .eq("id", inventoryId)
    .single();

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .delete()
    .eq("product_id", productId)
    .eq("sku_id", skuId)
    .eq("id", inventoryId)
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
      statusMessage: "Inventory row not found",
    });
  }

  // Audit log (inventory_id FK will be broken after delete, but we log it anyway)
  if (current) {
    await adminClient.from("inventory_change_log").insert({
      inventory_id: inventoryId,
      sku_id: skuId,
      branch_id: String(current.branch_id ?? ""),
      action: "delete",
      changed_by: userId,
      old_values: current,
      new_values: null,
    });
  }

  return { ok: true };
});
