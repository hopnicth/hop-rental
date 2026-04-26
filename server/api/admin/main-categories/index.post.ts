import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_MAIN_CATEGORY_SELECT,
  buildMainCategoryPayload,
  mapAdminMainCategoryItem,
} from "~~/server/utils/admin-main-categories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("main_categories")
    .insert(buildMainCategoryPayload(body))
    .select(ADMIN_MAIN_CATEGORY_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to create main category",
    });
  }

  return {
    item: mapAdminMainCategoryItem(data as Record<string, unknown>),
  };
});