import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { buildProductPayload } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = buildProductPayload(body);

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
