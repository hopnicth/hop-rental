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

  if (!productId || !skuId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId and skuId are required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const branchId =
    typeof body.branchId === "string" ? body.branchId.trim() : "";
  const branch = await resolveActiveStoreBranch(adminClient, branchId);

  const inventoryPayload = buildSkuInventoryPayload({
    ...body,
    inventoryId:
      typeof body.inventoryId === "string" ? body.inventoryId.trim() : "",
    branchId: branch.branchId,
    branchCode: branch.branchCode,
    branchName: branch.branchName,
  });

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .insert({
      product_id: productId,
      sku_id: skuId,
      ...inventoryPayload,
    })
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
      statusMessage: error?.message ?? "Inventory create failed",
    });
  }

  const mapped = mapAdminSkuInventoryItem(data as Record<string, unknown>);

  // Audit log
  await adminClient.from("inventory_change_log").insert({
    inventory_id: mapped.id,
    sku_id: skuId,
    branch_id: branch.branchId,
    action: "create",
    changed_by: userId,
    old_values: null,
    new_values: inventoryPayload,
    note: typeof body.note === "string" ? body.note : null,
  });

  return { item: mapped };
});
