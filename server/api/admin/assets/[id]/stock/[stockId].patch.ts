import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { resolveInventoryWithBranch } from "~~/server/utils/admin-inventories";
import {
  ADMIN_ASSET_STOCK_SELECT,
  ADMIN_ASSET_STOCK_WITH_REF_SELECT,
  buildAssetStockPayload,
  mapAdminAssetStockItem,
} from "~~/server/utils/admin-asset-stock";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const assetId = getRouterParam(event, "id");
  const stockId = getRouterParam(event, "stockId");

  if (!assetId || !stockId) {
    throw createError({
      statusCode: 400,
      statusMessage: "asset id and stock id are required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data: current, error: currentError } = await adminClient
    .from("asset_branch_inventory")
    .select(ADMIN_ASSET_STOCK_SELECT)
    .eq("asset_id", assetId)
    .eq("id", stockId)
    .single();

  if (currentError || !current) {
    throw createError({
      statusCode: 404,
      statusMessage: currentError?.message ?? "Asset stock row not found",
    });
  }

  const targetInventoryId =
    typeof body.inventoryId === "string" && body.inventoryId.trim().length > 0
      ? body.inventoryId.trim()
      : String(current.inventory_id ?? "");
  const ctx = await resolveInventoryWithBranch(adminClient, targetInventoryId);

  const mergedBody = {
    inventoryId: ctx.inventoryId,
    branchId: ctx.branchId,
    branchCode: ctx.branchCode,
    branchName: ctx.branchName,
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
    .from("asset_branch_inventory")
    .update(buildAssetStockPayload(mergedBody))
    .eq("asset_id", assetId)
    .eq("id", stockId)
    .select(ADMIN_ASSET_STOCK_WITH_REF_SELECT)
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
      statusMessage: error?.message ?? "Asset stock update failed",
    });
  }

  return { item: mapAdminAssetStockItem(data as Record<string, unknown>) };
});
