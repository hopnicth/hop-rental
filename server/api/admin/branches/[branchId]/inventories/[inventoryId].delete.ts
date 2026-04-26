import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

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

  const { data, error } = await adminClient
    .from("inventories")
    .delete()
    .eq("id", inventoryId)
    .eq("branch_id", branchId)
    .select("id")
    .maybeSingle();

  if (error) {
    const blockedDefault =
      typeof error.message === "string" &&
      error.message.includes("Default inventory");
    throw createError({
      statusCode:
        blockedDefault
          ? 422
          : error.code === "23503"
            ? 409
            : 500,
      statusMessage: blockedDefault
        ? "Default inventory cannot be deleted"
        : error.code === "23503"
          ? "Inventory still has stock rows; remove them first"
          : error.message,
    });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Inventory not found",
    });
  }

  return { ok: true };
});
