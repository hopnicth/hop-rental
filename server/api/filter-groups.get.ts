import { createError, defineEventHandler, getQuery } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  ADMIN_FILTER_GROUP_SELECT,
  mapAdminFilterGroup,
} from "~~/server/utils/admin-filter-groups";

/**
 * Public filter-groups list for /product-all SearchFilters.
 *
 * Returns active filter_groups for a given main_category, each with its
 * active filter_options nested. When `mainCategory` is omitted, all active
 * groups are returned (used to render the global "+ Add Filter" picker only
 * when a specific category is selected — the page hides the button on 'all').
 */
export default defineEventHandler(async (event) => {
  const adminClient = serverSupabaseServiceRole(event);
  const query = getQuery(event);
  const mainCategory =
    typeof query.mainCategory === "string" && query.mainCategory.trim().length > 0
      ? query.mainCategory.trim()
      : null;

  let request = adminClient
    .from("filter_groups")
    .select(ADMIN_FILTER_GROUP_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label_th", { ascending: true });

  if (mainCategory) {
    request = request.eq("main_category_key", mainCategory);
  }

  const { data, error } = await request;

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const items = (data ?? [])
    .map((row) => mapAdminFilterGroup(row as Record<string, unknown>))
    .map((group) => ({
      ...group,
      options: group.options.filter((opt) => opt.isActive),
    }));

  return { items };
});
