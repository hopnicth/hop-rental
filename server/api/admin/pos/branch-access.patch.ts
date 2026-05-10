import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId: adminUserId } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const branchIds = asStringArray(body.branchIds);

  if (!userId) {
    throw createError({ statusCode: 422, statusMessage: "userId is required" });
  }

  const { data: user, error: userError } = await adminClient
    .from("users")
    .select("id, platform_role")
    .eq("id", userId)
    .in("platform_role", ["staff", "super_admin"])
    .maybeSingle();
  if (userError) throw createError({ statusCode: 500, statusMessage: userError.message });
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "Admin user not found" });
  }

  if (branchIds.length > 0) {
    const { data: branches, error: branchesError } = await adminClient
      .from("store_branches")
      .select("id")
      .eq("is_active", true)
      .in("id", branchIds);
    if (branchesError) {
      throw createError({ statusCode: 500, statusMessage: branchesError.message });
    }
    if ((branches ?? []).length !== branchIds.length) {
      throw createError({ statusCode: 422, statusMessage: "All branchIds must be active branches" });
    }
  }

  const { error: deleteError } = await adminClient
    .from("admin_user_branch_access")
    .delete()
    .eq("user_id", userId);
  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: deleteError.message });
  }

  if (branchIds.length > 0) {
    const { error: insertError } = await adminClient
      .from("admin_user_branch_access")
      .insert(
        branchIds.map((branchId) => ({
          user_id: userId,
          branch_id: branchId,
          can_pos: true,
          created_by_user_id: adminUserId,
        })),
      );
    if (insertError) {
      throw createError({ statusCode: 500, statusMessage: insertError.message });
    }
  }

  return { ok: true, userId, branchIds };
});