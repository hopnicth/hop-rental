import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_INVENTORY_SELECT,
  buildInventoryPayload,
  mapAdminInventoryItem,
} from "~~/server/utils/admin-inventories";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const branchId = getRouterParam(event, "branchId");
  const inventoryId = getRouterParam(event, "inventoryId");

  if (!branchId || !inventoryId) {
    throw createError({
      statusCode: 400,
      statusMessage: "branchId and inventoryId are required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const payload = buildInventoryPayload(body);

  if (Object.keys(payload).length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: "No editable fields provided",
    });
  }

  const { data, error } = await adminClient
    .from("inventories")
    .update(payload)
    .eq("id", inventoryId)
    .eq("branch_id", branchId)
    .select(ADMIN_INVENTORY_SELECT)
    .single();

  if (error || !data) {
    const blockedDefault =
      typeof error?.message === "string" &&
      error.message.includes("Default inventory");
    throw createError({
      statusCode:
        error?.code === "23505"
          ? 409
          : blockedDefault || error?.code === "23514"
            ? 422
            : 500,
      statusMessage: error?.message ?? "Inventory update failed",
    });
  }

  return { item: mapAdminInventoryItem(data) };
});
