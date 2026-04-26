import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { resolveActiveStoreBranch } from "~~/server/utils/admin-branches";
import { asNonEmptyString } from "~~/server/utils/admin-catalog";
import {
  ADMIN_INVENTORY_SELECT,
  mapAdminInventoryItem,
} from "~~/server/utils/admin-inventories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const branchId = getRouterParam(event, "branchId");

  if (!branchId) {
    throw createError({
      statusCode: 400,
      statusMessage: "branchId is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const name = asNonEmptyString(body.name, "name");
  const branch = await resolveActiveStoreBranch(adminClient, branchId);

  const payload: Record<string, unknown> = {
    branch_id: branch.branchId,
    name,
    is_default: false,
    sort_order:
      typeof body.sortOrder === "number" ? body.sortOrder : 100,
    notes:
      body.notes && typeof body.notes === "object" ? body.notes : {},
  };

  const { data, error } = await adminClient
    .from("inventories")
    .insert(payload)
    .select(ADMIN_INVENTORY_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode:
        error?.code === "23505" ? 409 : error?.code === "23514" ? 422 : 500,
      statusMessage: error?.message ?? "Inventory create failed",
    });
  }

  return { item: mapAdminInventoryItem(data) };
});
