import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const groupId = getRouterParam(event, "groupId");
  const optionId = getRouterParam(event, "optionId");

  if (!groupId || !optionId) {
    throw createError({
      statusCode: 400,
      statusMessage: "groupId and optionId are required",
    });
  }

  const { data, error } = await adminClient
    .from("filter_options")
    .delete()
    .eq("id", optionId)
    .eq("group_id", groupId)
    .select("id")
    .single();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "Filter option not found" });
  }

  return { ok: true, deletedId: String(data.id ?? optionId) };
});
