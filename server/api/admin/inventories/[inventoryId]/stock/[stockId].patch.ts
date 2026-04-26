import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_SKU_INVENTORY_WITH_REF_SELECT,
  asNumber,
  mapAdminSkuInventoryItem,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const inventoryId = getRouterParam(event, "inventoryId");
  const stockId = getRouterParam(event, "stockId");

  if (!inventoryId || !stockId) {
    throw createError({
      statusCode: 400,
      statusMessage: "inventoryId and stockId are required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;

  const { data: current, error: currentError } = await adminClient
    .from("sku_branch_inventory")
    .select(ADMIN_SKU_INVENTORY_WITH_REF_SELECT)
    .eq("inventory_id", inventoryId)
    .eq("id", stockId)
    .single();

  if (currentError || !current) {
    throw createError({
      statusCode: 404,
      statusMessage: "Stock row not found in this inventory",
    });
  }

  const onHand =
    body.onHand !== undefined
      ? Math.max(0, asNumber(body.onHand, 0))
      : Number(current.on_hand ?? 0);
  const available =
    body.available !== undefined
      ? Math.max(0, asNumber(body.available, 0))
      : onHand;
  const reserved =
    body.reserved !== undefined
      ? Math.max(0, asNumber(body.reserved, 0))
      : Number(current.reserved ?? 0);
  const incoming =
    body.incoming !== undefined
      ? Math.max(0, asNumber(body.incoming, 0))
      : Number(current.incoming ?? 0);

  const payload: Record<string, unknown> = {
    on_hand: onHand,
    available,
    reserved,
    incoming,
  };

  if (body.safetyStock !== undefined)
    payload.safety_stock = Math.max(0, asNumber(body.safetyStock, 0));
  if (typeof body.notes === "string")
    payload.notes = body.notes.trim() || null;

  const { data, error } = await adminClient
    .from("sku_branch_inventory")
    .update(payload)
    .eq("inventory_id", inventoryId)
    .eq("id", stockId)
    .select(ADMIN_SKU_INVENTORY_WITH_REF_SELECT)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23514" ? 422 : 500,
      statusMessage: error?.message ?? "Stock update failed",
    });
  }

  const mapped = mapAdminSkuInventoryItem(data as Record<string, unknown>);

  await adminClient.from("inventory_change_log").insert({
    inventory_id: inventoryId,
    sku_id: String(current.sku_id ?? ""),
    branch_id: String(current.branch_id ?? ""),
    action: "update",
    changed_by: userId,
    old_values: {
      on_hand: current.on_hand,
      available: current.available,
      reserved: current.reserved,
      incoming: current.incoming,
    },
    new_values: payload,
    note: typeof body.note === "string" ? body.note : null,
  });

  return { item: mapped };
});
