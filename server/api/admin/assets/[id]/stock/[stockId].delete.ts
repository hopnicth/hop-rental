import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

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

  const { error } = await adminClient
    .from("asset_branch_inventory")
    .delete()
    .eq("asset_id", assetId)
    .eq("id", stockId);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { ok: true };
});
