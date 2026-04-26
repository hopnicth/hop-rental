import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const categoryKey = getRouterParam(event, "categoryKey");

  if (!categoryKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "categoryKey is required",
    });
  }

  if (categoryKey === "others") {
    throw createError({
      statusCode: 409,
      statusMessage: "The fallback 'others' category cannot be deleted",
    });
  }

  const { count, error: usageError } = await adminClient
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("main_category_key", categoryKey);

  if (usageError) {
    throw createError({
      statusCode: 500,
      statusMessage: usageError.message,
    });
  }

  if ((count ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot delete category '${categoryKey}' because it is used by ${count} product(s). Reassign those products first.`,
    });
  }

  const { data, error } = await adminClient
    .from("main_categories")
    .delete()
    .eq("key", categoryKey)
    .select("key")
    .single();

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Main category not found",
    });
  }

  return {
    ok: true,
    deletedKey: String(data.key ?? categoryKey),
  };
});