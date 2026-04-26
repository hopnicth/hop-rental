import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_SKU_INVENTORY_WITH_REF_SELECT,
  asNonEmptyString,
  asNumber,
  mapAdminSkuInventoryItem,
} from "~~/server/utils/admin-catalog";
import { resolveInventoryWithBranch } from "~~/server/utils/admin-inventories";

/**
 * POST /api/admin/inventories/:inventoryId/stock
 * Adds a SKU into this inventory pool with an initial stock count.
 * Body: { productId, skuId, onHand, available?, reserved?, incoming?, safetyStock?, notes? }
 */
export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const inventoryId = getRouterParam(event, "inventoryId");

  if (!inventoryId) {
    throw createError({
      statusCode: 400,
      statusMessage: "inventoryId is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const productId = asNonEmptyString(body.productId, "productId");
  const skuId = asNonEmptyString(body.skuId, "skuId");
  const branch = await resolveInventoryWithBranch(adminClient, inventoryId);

  const onHand = Math.max(0, asNumber(body.onHand, 0));
  const available =
    body.available !== undefined
      ? Math.max(0, asNumber(body.available, 0))
      : onHand;
  const reserved = Math.max(0, asNumber(body.reserved, 0));
  const incoming = Math.max(0, asNumber(body.incoming, 0));
  const safetyStock = Math.max(0, asNumber(body.safetyStock, 0));

  const payload = {
    product_id: productId,
    sku_id: skuId,
    inventory_id: branch.inventoryId,
    branch_id: branch.branchId,
    branch_code: branch.branchCode,
    branch_name: branch.branchName,
    on_hand: onHand,
    available,
    reserved,
    incoming,
    safety_stock: safetyStock,
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
  };

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .insert(payload)
    .select(ADMIN_SKU_INVENTORY_WITH_REF_SELECT)
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
      statusMessage: error?.message ?? "Stock create failed",
    });
  }

  const mapped = mapAdminSkuInventoryItem(data as Record<string, unknown>);

  await adminClient.from("inventory_change_log").insert({
    inventory_id: branch.inventoryId,
    sku_id: skuId,
    branch_id: branch.branchId,
    action: "create",
    changed_by: userId,
    old_values: null,
    new_values: payload,
    note: typeof body.note === "string" ? body.note : null,
  });

  return { item: mapped };
});
