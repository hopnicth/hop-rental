import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import {
  getAuthUserId,
  isMissingWishlistTable,
  mapWishlistProductIds,
  requireWishlistProductId,
} from "~~/server/utils/user-wishlist";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const productId = requireWishlistProductId(body.productId);
  const client = serverSupabaseServiceRole(event);

  const { data: product, error: productError } = await client
    .from("products")
    .select("id, is_hidden")
    .eq("id", productId)
    .maybeSingle();
  if (productError)
    throw createError({ statusCode: 500, statusMessage: productError.message });
  if (!product || product.is_hidden === true) {
    throw createError({ statusCode: 404, statusMessage: "Product not found" });
  }

  const { data: existing, error: existingError } = await client
    .from("user_wishlist")
    .select("product_id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existingError) {
    if (isMissingWishlistTable(existingError)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Migration 054 is required",
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: existingError.message,
    });
  }

  const wishlisted = !existing;
  const mutation = existing
    ? await client
        .from("user_wishlist")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId)
    : await client
        .from("user_wishlist")
        .insert({ user_id: userId, product_id: productId });

  if (mutation.error) {
    throw createError({
      statusCode: 500,
      statusMessage: mutation.error.message,
    });
  }

  const { data: rows } = await client
    .from("user_wishlist")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { productId, wishlisted, productIds: mapWishlistProductIds(rows) };
});
