import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_MAIN_CATEGORY_SELECT,
  buildMainCategoryPayload,
  mapAdminMainCategoryItem,
} from "~~/server/utils/admin-main-categories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const categoryKey = getRouterParam(event, "categoryKey");

  if (!categoryKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "categoryKey is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("main_categories")
    .update(buildMainCategoryPayload(body))
    .eq("key", categoryKey)
    .select(ADMIN_MAIN_CATEGORY_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to update main category",
    });
  }

  return {
    item: mapAdminMainCategoryItem(data as Record<string, unknown>),
  };
});