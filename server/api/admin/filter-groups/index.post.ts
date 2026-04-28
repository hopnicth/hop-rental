import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_FILTER_GROUP_SELECT,
  buildFilterGroupCreatePayload,
  mapAdminFilterGroup,
} from "~~/server/utils/admin-filter-groups";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const { data, error } = await adminClient
    .from("filter_groups")
    .insert(buildFilterGroupCreatePayload(body))
    .select(ADMIN_FILTER_GROUP_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to create filter group",
    });
  }

  return {
    item: mapAdminFilterGroup(data as Record<string, unknown>),
  };
});
