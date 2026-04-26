import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PRODUCT_DETAIL_SELECT,
  mapAdminProductDetail,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId is required",
    });
  }

  const { data, error } = await adminClient
    .from("products")
    .select(ADMIN_PRODUCT_DETAIL_SELECT)
    .eq("id", productId)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: 404,
      statusMessage: error?.message ?? "Product not found",
    });
  }

  return {
    product: mapAdminProductDetail(data as Record<string, unknown>),
  };
});
