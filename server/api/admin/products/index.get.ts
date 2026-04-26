import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PRODUCT_LIST_SELECT,
  mapAdminProductListItem,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const { data, error } = await adminClient
    .from("products")
    .select(ADMIN_PRODUCT_LIST_SELECT)
    .order("updated_at", { ascending: false });

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  return {
    items: (data ?? []).map((row) =>
      mapAdminProductListItem(row as Record<string, unknown>),
    ),
  };
});
