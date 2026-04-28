import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_FILTER_OPTION_SELECT,
  buildFilterOptionUpdatePayload,
  mapAdminFilterOption,
} from "~~/server/utils/admin-filter-groups";

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

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("filter_options")
    .update(buildFilterOptionUpdatePayload(body))
    .eq("id", optionId)
    .eq("group_id", groupId)
    .select(ADMIN_FILTER_OPTION_SELECT)
    .single();

  if (error || !data) {
    const code = error?.code;
    const statusCode = code === "23505" ? 409 : code === "PGRST116" ? 404 : 500;
    throw createError({
      statusCode,
      statusMessage: error?.message ?? "Failed to update filter option",
    });
  }

  return {
    item: mapAdminFilterOption(data as Record<string, unknown>),
  };
});
