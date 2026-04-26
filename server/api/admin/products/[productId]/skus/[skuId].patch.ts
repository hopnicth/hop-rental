import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_SKU_SELECT,
  buildSkuPayload,
  mapAdminSkuItem,
} from "~~/server/utils/admin-catalog";

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

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("product_skus")
    .update(buildSkuPayload(body, { partial: true }))
    .eq("product_id", productId)
    .eq("id", skuId)
    .select(ADMIN_SKU_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message ?? "SKU update failed",
    });
  }

  return {
    item: mapAdminSkuItem(data as Record<string, unknown>),
  };
});
