import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { resolveActiveStoreBranch } from "~~/server/utils/admin-branches";
import {
  ADMIN_SKU_INVENTORY_SELECT,
  buildSkuInventoryPayload,
  mapAdminSkuInventoryItem,
} from "~~/server/utils/admin-catalog";

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

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data: current, error: currentError } = await adminClient
    .from("sku_branch_inventory")
    .select(ADMIN_SKU_INVENTORY_SELECT)
    .eq("product_id", productId)
    .eq("sku_id", skuId)
    .eq("id", inventoryId)
    .single();

  if (currentError || !current) {
    throw createError({
      statusCode: 404,
      statusMessage: currentError?.message ?? "Inventory row not found",
    });
  }

  const targetBranchId =
    typeof body.branchId === "string" && body.branchId.trim().length > 0
      ? body.branchId.trim()
      : String(current.branch_id ?? "");
  const branch = await resolveActiveStoreBranch(adminClient, targetBranchId);

  const mergedBody = {
    inventoryId:
      typeof body.inventoryId === "string" && body.inventoryId.trim().length > 0
        ? body.inventoryId.trim()
        : String(current.inventory_id ?? ""),
    branchId: branch.branchId,
    branchCode: branch.branchCode,
    branchName: branch.branchName,
    onHand: body.onHand === undefined ? current.on_hand : body.onHand,
    available:
      body.available === undefined ? current.available : body.available,
    reserved: body.reserved === undefined ? current.reserved : body.reserved,
    incoming: body.incoming === undefined ? current.incoming : body.incoming,
    safetyStock:
      body.safetyStock === undefined ? current.safety_stock : body.safetyStock,
    notes: body.notes === undefined ? current.notes : body.notes,
  };

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .update(buildSkuInventoryPayload(mergedBody))
    .eq("product_id", productId)
    .eq("sku_id", skuId)
    .eq("id", inventoryId)
    .select(ADMIN_SKU_INVENTORY_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode:
        error?.code === "23505"
          ? 409
          : error?.code === "23503"
            ? 404
            : error?.code === "23514"
              ? 422
              : 500,
      statusMessage: error?.message ?? "Inventory update failed",
    });
  }

  const mapped = mapAdminSkuInventoryItem(data as Record<string, unknown>);

  // Audit log
  const oldValues = {
    branch_id: current.branch_id,
    on_hand: current.on_hand,
    available: current.available,
    reserved: current.reserved,
    incoming: current.incoming,
    safety_stock: current.safety_stock,
  };

  await adminClient.from("inventory_change_log").insert({
    inventory_id: inventoryId,
    sku_id: skuId,
    branch_id: branch.branchId,
    action: "update",
    changed_by: userId,
    old_values: oldValues,
    new_values: buildSkuInventoryPayload(mergedBody),
    note: typeof body.note === "string" ? body.note : null,
  });

  return { item: mapped };
});
