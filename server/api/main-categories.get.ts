import { createError, defineEventHandler, getQuery } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import { asMainCategoryEntityType } from "~~/server/utils/admin-main-categories";
import {
  mapPublicMainCategory,
  PUBLIC_MAIN_CATEGORY_SELECT,
} from "~~/server/utils/main-categories";

export default defineEventHandler(async (event) => {
  const adminClient = serverSupabaseServiceRole(event);
  const query = getQuery(event);
  const entityType = asMainCategoryEntityType(query.entityType) ?? "product";

  const { data, error } = await adminClient
    .from("main_categories")
    .select(PUBLIC_MAIN_CATEGORY_SELECT)
    .eq("is_active", true)
    .contains("entity_types", [entityType])
    .order("sort_order", { ascending: true })
    .order("label_th", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    items: (data ?? []).map((row) =>
      mapPublicMainCategory(row as Record<string, unknown>),
    ),
  };
});
