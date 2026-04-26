import { createError } from "h3";

export const ADMIN_ASSET_STOCK_SELECT =
  "id, asset_id, inventory_id, branch_id, branch_code, branch_name, on_hand, available, reserved, incoming, safety_stock, notes, created_at, updated_at";

export const ADMIN_ASSET_STOCK_WITH_REF_SELECT = `${ADMIN_ASSET_STOCK_SELECT}, inventory:inventories(id, name, is_default, is_default_rental, branch_id, notes)`;

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} is required`,
    });
  }
  return value.trim();
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

export function buildAssetStockPayload(body: Record<string, unknown>) {
  const onHand = Math.max(0, asNumber(body.onHand, 0));
  const available = Math.max(0, asNumber(body.available, 0));
  const reserved = Math.max(0, asNumber(body.reserved, 0));

  if (available > onHand) fail422("available cannot be greater than onHand");
  if (reserved > onHand) fail422("reserved cannot be greater than onHand");
  if (available + reserved > onHand)
    fail422("available plus reserved cannot be greater than onHand");

  return {
    inventory_id: asNonEmptyString(body.inventoryId, "inventoryId"),
    branch_id: asNonEmptyString(body.branchId, "branchId"),
    branch_code: asOptionalString(body.branchCode),
    branch_name: asNonEmptyString(body.branchName, "branchName"),
    on_hand: onHand,
    available,
    reserved,
    incoming: Math.max(0, asNumber(body.incoming, 0)),
    safety_stock: Math.max(0, asNumber(body.safetyStock, 0)),
    notes: asOptionalString(body.notes),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mapAdminAssetStockItem(row: Record<string, unknown>) {
  const inventoryRef = isRecord(row.inventory)
    ? row.inventory
    : Array.isArray(row.inventory) && isRecord(row.inventory[0])
      ? (row.inventory[0] as Record<string, unknown>)
      : null;

  return {
    id: String(row.id ?? ""),
    assetId: String(row.asset_id ?? ""),
    inventoryId: String(row.inventory_id ?? inventoryRef?.id ?? ""),
    inventoryName:
      typeof inventoryRef?.name === "string" ? inventoryRef.name : "",
    isDefaultInventory: inventoryRef?.is_default === true,
    isDefaultRentalInventory: inventoryRef?.is_default_rental === true,
    branchId: String(row.branch_id ?? ""),
    branchCode: typeof row.branch_code === "string" ? row.branch_code : "",
    branchName: String(row.branch_name ?? ""),
    onHand: Number(row.on_hand ?? 0),
    available: Number(row.available ?? 0),
    reserved: Number(row.reserved ?? 0),
    incoming: Number(row.incoming ?? 0),
    safetyStock: Number(row.safety_stock ?? 0),
    notes: typeof row.notes === "string" ? row.notes : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}
