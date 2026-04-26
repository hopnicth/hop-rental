import { createError, defineEventHandler, readBody } from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_STORE_BRANCH_SELECT,
  buildBranchPayload,
  mapAdminStoreBranchItem,
} from "~~/server/utils/admin-branches";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireSuperAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const id =
    typeof body.id === "string" && body.id.trim().length > 0
      ? body.id.trim()
      : `branch-${crypto.randomUUID().slice(0, 8)}`;

  const payload = buildBranchPayload(body);

  if (!payload.code || !payload.name_th) {
    throw createError({
      statusCode: 422,
      statusMessage: "code and nameTh are required",
    });
  }

  const { data, error } = await adminClient
    .from("store_branches")
    .insert({ id, ...payload })
    .select(ADMIN_STORE_BRANCH_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : 500,
      statusMessage: error?.message ?? "Failed to create branch",
    });
  }

  return { item: mapAdminStoreBranchItem(data) };
});
