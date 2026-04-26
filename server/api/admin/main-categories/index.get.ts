import { createError, defineEventHandler } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_MAIN_CATEGORY_SELECT,
  mapAdminMainCategoryItem,
} from "~~/server/utils/admin-main-categories";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);

  const { data, error } = await adminClient
    .from("main_categories")
    .select(ADMIN_MAIN_CATEGORY_SELECT)
    .order("sort_order", { ascending: true })
    .order("label_th", { ascending: true });

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