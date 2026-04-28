import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_FILTER_OPTION_SELECT,
  buildFilterOptionCreatePayload,
  mapAdminFilterOption,
} from "~~/server/utils/admin-filter-groups";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const groupId = getRouterParam(event, "groupId");

  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: "groupId is required" });
  }

  const { data: group, error: groupError } = await adminClient
    .from("filter_groups")
    .select("id, filter_type")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    throw createError({
      statusCode: 404,
      statusMessage: "Filter group not found",
    });
  }

  if (group.filter_type === "number_range") {
    throw createError({
      statusCode: 422,
      statusMessage:
        "Cannot add options to a number_range group — value is read from product spec",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("filter_options")
    .insert(buildFilterOptionCreatePayload(groupId, body))
    .select(ADMIN_FILTER_OPTION_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to create filter option",
    });
  }

  return {
    item: mapAdminFilterOption(data as Record<string, unknown>),
  };
});
