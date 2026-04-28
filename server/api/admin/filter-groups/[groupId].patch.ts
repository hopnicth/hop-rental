import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_FILTER_GROUP_SELECT,
  buildFilterGroupUpdatePayload,
  mapAdminFilterGroup,
} from "~~/server/utils/admin-filter-groups";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const groupId = getRouterParam(event, "groupId");

  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: "groupId is required" });
  }

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("filter_groups")
    .update(buildFilterGroupUpdatePayload(body))
    .eq("id", groupId)
    .select(ADMIN_FILTER_GROUP_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to update filter group",
    });
  }

  return {
    item: mapAdminFilterGroup(data as Record<string, unknown>),
  };
});
