import { createError } from "h3";

export const ADMIN_INVENTORY_SELECT =
  "id, branch_id, name, is_default, is_default_rental, notes, sort_order, created_at, updated_at";

function asInventoryRow(row: unknown) {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

export function mapAdminInventoryItem(row: unknown) {
  const item = asInventoryRow(row);
  return {
    id: String(item.id ?? ""),
    branchId: String(item.branch_id ?? ""),
    name: String(item.name ?? ""),
    isDefault: item.is_default === true,
    isDefaultRental: item.is_default_rental === true,
    notes:
      item.notes && typeof item.notes === "object"
        ? (item.notes as Record<string, unknown>)
        : {},
    sortOrder: Number(item.sort_order ?? 0),
    createdAt:
      typeof item.created_at === "string" ? item.created_at : undefined,
    updatedAt:
      typeof item.updated_at === "string" ? item.updated_at : undefined,
  };
}

export function buildInventoryPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  if (typeof body.name === "string") payload.name = body.name.trim();
  if (typeof body.sortOrder === "number") payload.sort_order = body.sortOrder;
  if (body.notes && typeof body.notes === "object") payload.notes = body.notes;
  return payload;
}

/**
 * Resolve an inventory by id and return its branch context.
 * Used by stock endpoints to populate the denormalised branch_* columns
 * on sku_branch_inventory rows.
 */
export async function resolveInventoryWithBranch(
  adminClient: {
    from(table: "inventories" | "store_branches"): {
      select(columns: string): {
        eq(
          column: string,
          value: unknown,
        ): {
          single(): Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  },
  inventoryId: string,
) {
  const { data: inv, error: invErr } = await adminClient
    .from("inventories")
    .select(ADMIN_INVENTORY_SELECT)
    .eq("id", inventoryId)
    .single();

  if (invErr || !inv) {
    throw createError({
      statusCode: 404,
      statusMessage: "inventoryId must reference an existing inventory",
    });
  }

  const { data: branch, error: branchErr } = await adminClient
    .from("store_branches")
    .select("id, code, name_th, name_en, is_active")
    .eq("id", inv.branch_id)
    .single();

  if (branchErr || !branch || branch.is_active === false) {
    throw createError({
      statusCode: 422,
      statusMessage: "Inventory's branch is missing or inactive",
    });
  }

  const mapped = mapAdminInventoryItem(inv);

  return {
    inventory: mapped,
    inventoryId: mapped.id,
    branchId: String(branch.id ?? ""),
    branchCode: String(branch.code ?? ""),
    branchName: String(branch.name_th ?? branch.name_en ?? ""),
  };
}
