import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdminReadAccess(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({ statusCode: 400, statusMessage: "productId is required" });
  }

  const { data, error } = await adminClient
    .from("product_filter_options")
    .select("filter_option_id")
    .eq("product_id", productId);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const filterOptionIds = (data ?? [])
    .map((row) => String((row as Record<string, unknown>).filter_option_id ?? ""))
    .filter((id) => id.length > 0);

  return { filterOptionIds };
});
