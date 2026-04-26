import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const assetId = getRouterParam(event, "id");
  const matchId = getRouterParam(event, "matchId");

  if (!assetId || !matchId) {
    throw createError({
      statusCode: 400,
      statusMessage: "asset id and match id are required",
    });
  }

  const { error } = await adminClient
    .from("asset_matches")
    .delete()
    .eq("asset_id", assetId)
    .eq("id", matchId);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { ok: true };
});