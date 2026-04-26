import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_STOCK_WITH_REF_SELECT,
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

  const { data, error } = await adminClient
    .from("asset_branch_inventory")
    .select(ADMIN_ASSET_STOCK_WITH_REF_SELECT)
    .eq("asset_id", assetId)
    .order("branch_name", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    items: (data ?? []).map((row) =>
      mapAdminAssetStockItem(row as Record<string, unknown>),
    ),
  };
});
