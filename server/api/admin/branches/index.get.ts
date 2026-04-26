import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_STORE_BRANCH_SELECT,
  mapAdminStoreBranchItem,
} from "~~/server/utils/admin-branches";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);

  const { data, error } = await adminClient
    .from("store_branches")
    .select(ADMIN_STORE_BRANCH_SELECT)
    .order("sort_order", { ascending: true })
    .order("name_th", { ascending: true });

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  const items = (data ?? []).map((row) => mapAdminStoreBranchItem(row));

  return {
    items,
    options: items
      .filter((item) => item.isActive)
      .map((item) => ({
        value: item.id,
        label: `${item.nameTh} · ${item.code}`,
        description: item.nameEn,
      })),
  };
});