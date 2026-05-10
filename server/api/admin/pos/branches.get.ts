import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_STORE_BRANCH_SELECT,
  mapAdminStoreBranchItem,
} from "~~/server/utils/admin-branches";

export default defineEventHandler(async (event) => {
  const { adminClient, platformRole, userId } = await requirePlatformAdmin(event);

  let allowedBranchIds: string[] | null = null;
  if (platformRole !== "super_admin") {
    const { data: access, error: accessError } = await adminClient
      .from("admin_user_branch_access")
      .select("branch_id")
      .eq("user_id", userId)
      .eq("can_pos", true);

    if (accessError) {
      throw createError({
        statusCode: 500,
        statusMessage: accessError.message,
      });
    }

    allowedBranchIds = (access ?? [])
      .map((row: { branch_id?: unknown }) => String(row.branch_id ?? ""))
      .filter(Boolean);
  }

  let branchQuery = adminClient
    .from("store_branches")
    .select(ADMIN_STORE_BRANCH_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_th", { ascending: true });

  if (allowedBranchIds) {
    if (allowedBranchIds.length === 0) return { items: [], options: [] };
    branchQuery = branchQuery.in("id", allowedBranchIds);
  }

  const { data, error } = await branchQuery;
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const items = (data ?? []).map((row: unknown) => mapAdminStoreBranchItem(row));
  return {
    items,
    options: items.map((item) => ({
      value: item.id,
      label: `${item.nameTh} · ${item.code}`,
      description: item.nameEn,
    })),
  };
});