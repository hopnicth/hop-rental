import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

/**
 * Replaces the full set of filter-option assignments for a product.
 * Validates that every supplied option belongs to a group whose
 * main_category_key matches the product's main_category_key.
 */
export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({ statusCode: 400, statusMessage: "productId is required" });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const rawIds = Array.isArray(body.filterOptionIds) ? body.filterOptionIds : [];
  const filterOptionIds = Array.from(
    new Set(
      rawIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0),
    ),
  );

  const { data: product, error: productError } = await adminClient
    .from("products")
    .select("id, main_category_key")
    .eq("id", productId)
    .single();

  if (productError || !product) {
    throw createError({ statusCode: 404, statusMessage: "Product not found" });
  }

  if (filterOptionIds.length > 0) {
    const { data: options, error: optionsError } = await adminClient
      .from("filter_options")
      .select("id, group:filter_groups!inner(main_category_key)")
      .in("id", filterOptionIds);

    if (optionsError) {
      throw createError({ statusCode: 500, statusMessage: optionsError.message });
    }

    const fetched = options ?? [];
    if (fetched.length !== filterOptionIds.length) {
      throw createError({
        statusCode: 422,
        statusMessage: "One or more filterOptionIds do not exist",
      });
    }

    for (const opt of fetched) {
      const groupRel = (opt as Record<string, unknown>).group as
        | { main_category_key?: string }
        | null;
      const groupCategory = groupRel?.main_category_key ?? null;

      if (groupCategory !== product.main_category_key) {
        throw createError({
          statusCode: 422,
          statusMessage:
            "Filter option does not belong to the product's main category",
        });
      }
    }
  }

  const { error: deleteError } = await adminClient
    .from("product_filter_options")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: deleteError.message });
  }

  if (filterOptionIds.length > 0) {
    const { error: insertError } = await adminClient
      .from("product_filter_options")
      .insert(
        filterOptionIds.map((filter_option_id) => ({
          product_id: productId,
          filter_option_id,
        })),
      );

    if (insertError) {
      throw createError({ statusCode: 500, statusMessage: insertError.message });
    }
  }

  return { ok: true, count: filterOptionIds.length };
});
