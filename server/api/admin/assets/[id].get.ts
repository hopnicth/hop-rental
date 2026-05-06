import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_DETAIL_SELECT,
  ADMIN_ASSET_DETAIL_SELECT_LEGACY,
  isMissingAssetSearchKeywordsColumn,
  mapAssetDetail,
} from "~~/server/utils/admin-asset";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  let { data, error } = await adminClient
    .from("assets")
    .select(ADMIN_ASSET_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (isMissingAssetSearchKeywordsColumn(error)) {
    const fallback = await adminClient
      .from("assets")
      .select(ADMIN_ASSET_DETAIL_SELECT_LEGACY)
      .eq("id", id)
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

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
