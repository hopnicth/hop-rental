import { createError, defineEventHandler } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_STORE_BRANCH_SELECT,
  mapAdminStoreBranchItem,
} from "~~/server/utils/admin-branches";

type AccessRow = { user_id?: unknown; branch_id?: unknown; can_pos?: unknown };

function isMissingBranchAccessTable(error: unknown): boolean {
  const err = error as { code?: string | null; message?: string | null } | null;
  return err?.code === "42P01" || /admin_user_branch_access/i.test(err?.message ?? "");
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);

  const [usersResult, branchesResult, accessResult] = await Promise.all([
    adminClient
      .from("users")
      .select("id, full_name, phone, platform_role")
      .in("platform_role", ["staff", "super_admin"])
      .order("platform_role", { ascending: false })
      .order("full_name", { ascending: true }),
    adminClient
      .from("store_branches")
      .select(ADMIN_STORE_BRANCH_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_th", { ascending: true }),
    adminClient
      .from("admin_user_branch_access")
      .select("user_id, branch_id, can_pos")
      .eq("can_pos", true),
  ]);

  if (usersResult.error) {
    throw createError({ statusCode: 500, statusMessage: usersResult.error.message });
  }
  if (branchesResult.error) {
    throw createError({ statusCode: 500, statusMessage: branchesResult.error.message });
  }
  if (accessResult.error) {
    if (isMissingBranchAccessTable(accessResult.error)) {
      return { users: [], branches: [], migrationRequired: true };
    }
    throw createError({ statusCode: 500, statusMessage: accessResult.error.message });
  }

  const branchIdsByUser = new Map<string, string[]>();
  for (const row of (accessResult.data ?? []) as AccessRow[]) {
    const userId = String(row.user_id ?? "");
    const branchId = String(row.branch_id ?? "");
    if (!userId || !branchId) continue;
    branchIdsByUser.set(userId, [...(branchIdsByUser.get(userId) ?? []), branchId]);
  }

  const branches = (branchesResult.data ?? []).map((row: unknown) =>
    mapAdminStoreBranchItem(row),
  );
  const users = ((usersResult.data ?? []) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: String(row.id ?? ""),
      fullName: String(row.full_name ?? ""),
      phone: String(row.phone ?? ""),
      platformRole: String(row.platform_role ?? "staff"),
      branchIds: branchIdsByUser.get(String(row.id ?? "")) ?? [],
    }),
  );

  return { users, branches, migrationRequired: false };
});