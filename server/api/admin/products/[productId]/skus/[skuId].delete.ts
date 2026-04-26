import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");
  const skuId = getRouterParam(event, "skuId");

  if (!productId || !skuId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId and skuId are required",
    });
  }

  const { data, error } = await adminClient
    .from("product_skus")
    .delete()
    .eq("product_id", productId)
    .eq("id", skuId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw createError({
      statusCode: error.code === "23503" ? 409 : 500,
      statusMessage: error.message,
    });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "SKU not found",
    });
  }

  return { ok: true };
});