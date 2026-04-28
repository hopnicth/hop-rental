import { createError, defineEventHandler } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  HOME_CATEGORY_GROUP_SELECT,
  mapHomeCategoryGroup,
} from "~~/server/utils/home-categories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);

  const [groupsResult, mainCategoriesResult] = await Promise.all([
    adminClient
      .from("home_category_groups")
      .select(HOME_CATEGORY_GROUP_SELECT)
      .order("sort_order", { ascending: true })
      .order("label_th", { ascending: true }),
    adminClient
      .from("main_categories")
      .select("key, label_th, label_en, icon, is_active, sort_order")
      .contains("entity_types", ["product"])
      .order("sort_order", { ascending: true })
      .order("label_th", { ascending: true }),
  ]);

  const error = groupsResult.error ?? mainCategoriesResult.error;
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return {
    items: (groupsResult.data ?? []).map((row) =>
      mapHomeCategoryGroup(row as Record<string, unknown>),
    ),
    mainCategoryOptions: (mainCategoriesResult.data ?? []).map((row) => ({
      value: row.key,
      label: `${row.label_th || row.label_en} · ${row.key}`,
      icon: row.icon ?? "",
      isActive: row.is_active !== false,
    })),
  };
});
