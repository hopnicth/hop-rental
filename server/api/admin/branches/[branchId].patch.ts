import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_STORE_BRANCH_SELECT,
  buildBranchPayload,
  mapAdminStoreBranchItem,
} from "~~/server/utils/admin-branches";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const branchId = getRouterParam(event, "branchId");

  if (!branchId) {
    throw createError({ statusCode: 400, statusMessage: "branchId is required" });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = buildBranchPayload(body);

  if (Object.keys(payload).length === 0) {
    throw createError({ statusCode: 422, statusMessage: "No fields to update" });
  }

  const { data, error } = await adminClient
    .from("store_branches")
    .update(payload)
    .eq("id", branchId)
    .select(ADMIN_STORE_BRANCH_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to update branch",
    });
  }

  return { item: mapAdminStoreBranchItem(data) };
});
