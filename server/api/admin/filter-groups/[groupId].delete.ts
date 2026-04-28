import { createError, defineEventHandler, getRouterParam } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const groupId = getRouterParam(event, "groupId");

  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: "groupId is required" });
  }

  const { data, error } = await adminClient
    .from("filter_groups")
    .delete()
    .eq("id", groupId)
    .select("id")
    .single();

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "Filter group not found" });
  }

  return { ok: true, deletedId: String(data.id ?? groupId) };
});
