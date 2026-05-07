import { createError } from "h3";

export type SaveListItemType = "asset" | "service";
export type SaveListItem = { itemType: SaveListItemType; itemId: string };
export type SaveListRow = {
  item_type?: unknown;
  asset_id?: unknown;
  service_id?: unknown;
};

export function requireSaveListItemType(value: unknown): SaveListItemType {
  if (value === "asset" || value === "service") return value;
  throw createError({ statusCode: 422, statusMessage: "itemType is invalid" });
}

export function requireSaveListItemId(value: unknown): string {
  if (typeof value !== "string") {
    throw createError({ statusCode: 422, statusMessage: "itemId is required" });
  }
  const itemId = value.trim();
  if (!itemId || itemId.length > 128) {
    throw createError({ statusCode: 422, statusMessage: "itemId is invalid" });
  }
  return itemId;
}

export function mapSaveListItems(rows: SaveListRow[] | null | undefined) {
  return (rows ?? [])
    .map((row): SaveListItem | null => {
      if (row.item_type === "asset" && typeof row.asset_id === "string") {
        return { itemType: "asset", itemId: row.asset_id };
      }
      if (row.item_type === "service" && typeof row.service_id === "string") {
        return { itemType: "service", itemId: row.service_id };
      }
      return null;
    })
    .filter((item): item is SaveListItem => item !== null);
}

export function groupSaveListItems(items: SaveListItem[]) {
  return {
    items,
    assetIds: items.filter((item) => item.itemType === "asset").map((item) => item.itemId),
    serviceIds: items.filter((item) => item.itemType === "service").map((item) => item.itemId),
  };
}

export function isMissingSaveListTable(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return err?.code === "42P01" || err?.message?.includes("user_save_list") === true;
}