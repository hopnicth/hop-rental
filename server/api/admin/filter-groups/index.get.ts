import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_FILTER_GROUP_SELECT,
  mapAdminFilterGroup,
} from "~~/server/utils/admin-filter-groups";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);

  const query = getQuery(event);
  const mainCategory =
    typeof query.mainCategory === "string" && query.mainCategory.trim().length > 0
      ? query.mainCategory.trim()
      : null;

  let request = adminClient
    .from("filter_groups")
    .select(ADMIN_FILTER_GROUP_SELECT)
    .order("sort_order", { ascending: true })
    .order("label_th", { ascending: true });

  if (mainCategory) {
    request = request.eq("main_category_key", mainCategory);
  }

  const { data, error } = await request;

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const items = (data ?? []).map((row) =>
    mapAdminFilterGroup(row as Record<string, unknown>),
  );

  return {
    items,
    meta: { adminMode, warning: adminWarning },
  };
});
