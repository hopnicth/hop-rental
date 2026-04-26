import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  mapAssetDetail,
} from "~~/server/utils/admin-asset";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  const { data, error } = await adminClient
    .from("assets")
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Asset not found",
    });
  }

  return {
    item: mapAssetDetail(data as Record<string, unknown>),
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
