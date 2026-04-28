import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_MAIN_CATEGORY_SELECT,
  asMainCategoryEntityType,
  mapAdminMainCategoryItem,
} from "~~/server/utils/admin-main-categories";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);
  const query = getQuery(event);
  const entityType =
    query.entityType === "all"
      ? null
      : asMainCategoryEntityType(query.entityType);

  let request = adminClient
    .from("main_categories")
    .select(ADMIN_MAIN_CATEGORY_SELECT)
    .order("sort_order", { ascending: true })
    .order("label_th", { ascending: true });

  if (entityType) {
    request = request.contains("entity_types", [entityType]);
  } else if (query.entityType !== "all") {
    request = request.contains("entity_types", ["product"]);
  }

  const { data, error } = await request;

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  const items = (data ?? []).map((row) =>
    mapAdminMainCategoryItem(row as Record<string, unknown>),
  );

  return {
    items,
    options: items
      .filter((item) => item.isActive)
      .map((item) => ({
        value: item.key,
        label: `${item.labelTh} · ${item.key}`,
      })),
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
