import { createError, defineEventHandler } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_ASSET_LIST_SELECT,
  ADMIN_ASSET_LIST_SELECT_LEGACY,
  isMissingAssetSearchKeywordsColumn,
  mapAssetListItem,
} from "~~/server/utils/admin-asset";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);

  let { data, error } = await adminClient
    .from("assets")
    .select(ADMIN_ASSET_LIST_SELECT)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (isMissingAssetSearchKeywordsColumn(error)) {
    const fallback = await adminClient
      .from("assets")
      .select(ADMIN_ASSET_LIST_SELECT_LEGACY)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  return {
    items: (data ?? []).map((row) =>
      mapAssetListItem(row as Record<string, unknown>),
    ),
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
