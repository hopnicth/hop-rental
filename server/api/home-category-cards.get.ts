import { createError, defineEventHandler } from "h3";
import { serverSupabaseClient } from "#supabase/server";
import {
  HOME_CATEGORY_GROUP_SELECT,
  mapHomeCategoryGroup,
} from "~~/server/utils/home-categories";

export default defineEventHandler(async (event) => {
  // Public home data should go through the anon/RLS client, not service-role.
  // This avoids Home rendering the fallback categories on deployments where the
  // server-only service key is missing, while still respecting the public
  // `is_active = true` RLS policies from migration 044.
  const client = await serverSupabaseClient(event);
  const { data, error } = await client
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
