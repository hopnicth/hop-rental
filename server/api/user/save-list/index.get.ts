import { createError, defineEventHandler } from "h3";
import { serverSupabaseServiceRole, serverSupabaseUser } from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  groupSaveListItems,
  isMissingSaveListTable,
  mapSaveListItems,
} from "~~/server/utils/user-save-list";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const client = serverSupabaseServiceRole(event) as any;
  const { data, error } = await client
    .from("user_save_list")
    .select("item_type, asset_id, service_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSaveListTable(error)) return groupSaveListItems([]);
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return groupSaveListItems(mapSaveListItems(data));
});