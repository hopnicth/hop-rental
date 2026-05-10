import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import { buildProductPayload } from "~~/server/utils/admin-catalog";

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
  const payload = buildProductPayload(body, { partial: true });

  if (typeof payload.main_category_key === "string") {
    const { error: mainCategoryError } = await adminClient
      .from("main_categories")
      .select("key")
      .eq("key", payload.main_category_key)
      .eq("is_active", true)
      .single();

    if (mainCategoryError) {
      throw createError({
        statusCode: 422,
        statusMessage: "mainCategoryKey must reference an active main category",
      });
    }
  }

  const { data, error } = await adminClient
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select("id")
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Update failed",
    });
  }

  return { ok: true };
});
