import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_SKU_SELECT,
  buildSkuPayload,
  mapAdminSkuItem,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const id =
    typeof body.id === "string" && body.id.trim().length > 0
      ? body.id.trim()
      : `sku-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const payload = {
    id,
    product_id: productId,
    ...buildSkuPayload(body),
  };

  const { data, error } = await adminClient
    .from("product_skus")
    .insert(payload as never)
    .select(ADMIN_SKU_SELECT)
    .single();

  if (error || !data) {
    const statusCode =
      error?.code === "23505" ? 409 : error?.code === "23503" ? 404 : 500;
    throw createError({
      statusCode,
      statusMessage: error?.message ?? "SKU create failed",
    });
  }

  return {
    item: mapAdminSkuItem(data as Record<string, unknown>),
  };
});
