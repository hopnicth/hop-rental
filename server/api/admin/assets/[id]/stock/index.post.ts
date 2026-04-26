import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { resolveInventoryWithBranch } from "~~/server/utils/admin-inventories";
import {
  ADMIN_ASSET_STOCK_WITH_REF_SELECT,
  buildAssetStockPayload,
  mapAdminAssetStockItem,
} from "~~/server/utils/admin-asset-stock";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const assetId = getRouterParam(event, "id");

  if (!assetId) {
    throw createError({
      statusCode: 400,
      statusMessage: "asset id is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const inventoryId =
    typeof body.inventoryId === "string" ? body.inventoryId.trim() : "";

  if (!inventoryId) {
    throw createError({
      statusCode: 422,
      statusMessage: "inventoryId is required",
    });
  }

  const ctx = await resolveInventoryWithBranch(adminClient, inventoryId);

  const payload = buildAssetStockPayload({
    ...body,
    inventoryId: ctx.inventoryId,
    branchId: ctx.branchId,
    branchCode: ctx.branchCode,
    branchName: ctx.branchName,
  });

  const { data, error } = await adminClient
    .from("asset_branch_inventory")
    .insert({ asset_id: assetId, ...payload })
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
      statusMessage: error?.message ?? "Asset stock create failed",
    });
  }

  return { item: mapAdminAssetStockItem(data as Record<string, unknown>) };
});
