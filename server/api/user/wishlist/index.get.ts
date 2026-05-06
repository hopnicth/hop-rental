import { createError, defineEventHandler } from "h3";
import { serverSupabaseServiceRole, serverSupabaseUser } from "#supabase/server";
import {
  getAuthUserId,
  isMissingWishlistTable,
  mapWishlistProductIds,
} from "~~/server/utils/user-wishlist";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const client = serverSupabaseServiceRole(event) as any;
  const { data, error } = await client
    .from("user_wishlist")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingWishlistTable(error)) return { productIds: [] };
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { productIds: mapWishlistProductIds(data) };
});