import { createError, defineEventHandler } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  HOME_CATEGORY_GROUP_SELECT,
  mapHomeCategoryGroup,
} from "~~/server/utils/home-categories";

export default defineEventHandler(async (event) => {
  const adminClient = serverSupabaseServiceRole(event);
  const { data, error } = await adminClient
    .from("home_category_groups")
    .select(HOME_CATEGORY_GROUP_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label_th", { ascending: true });

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const items = (data ?? [])
    .map((row) => mapHomeCategoryGroup(row as Record<string, unknown>))
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => option.isActive),
    }))
    .filter((group) => group.options.length > 0);

  return { items };
});