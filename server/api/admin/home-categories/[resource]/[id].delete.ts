import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const resource = getRouterParam(event, "resource");
  const id = getRouterParam(event, "id");

  if (!resource || !id) {
    throw createError({
      statusCode: 400,
      statusMessage: "resource and id are required",
    });
  }

  const table =
    resource === "group"
      ? "home_category_groups"
      : resource === "option"
        ? "home_category_options"
        : null;

  if (!table) {
    throw createError({ statusCode: 422, statusMessage: "Unsupported resource" });
  }

  const { data, error } = await adminClient
    .from(table)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "Item not found" });
  }

  return { ok: true };
});