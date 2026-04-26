import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({ statusCode: 422, statusMessage: `${field} is required` });
  }
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapAssetMatch(row: Record<string, any>) {
  return {
    id: String(row.id ?? ""),
    assetId: String(row.asset_id ?? ""),
    productId: String(row.product_id ?? ""),
    matchType: String(row.match_type ?? "compatible"),
    sortOrder: Number(row.sort_order ?? 0),
    note: typeof row.note === "string" ? row.note : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
    productLabel: `${row.product?.name_th ?? row.product_id} · ${row.product?.slug ?? ""}`,
    productHidden: row.product?.is_hidden === true,
  };
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const assetId = getRouterParam(event, "id");
  const body = (await readBody(event)) as Record<string, unknown>;

  if (!assetId) {
    throw createError({ statusCode: 400, statusMessage: "asset id is required" });
  }

  const productId = asNonEmptyString(body.productId, "productId");
  const matchType =
    typeof body.matchType === "string" && body.matchType.trim().length > 0
      ? body.matchType.trim()
      : "compatible";

  const { data, error } = await adminClient
    .from("asset_matches")
    .insert({
      asset_id: assetId,
      product_id: productId,
      match_type: matchType,
      sort_order: Math.max(0, asNumber(body.sortOrder, 0)),
      note:
        typeof body.note === "string" && body.note.trim().length > 0
          ? body.note.trim()
          : null,
    })
    .select("id, asset_id, product_id, match_type, sort_order, note, updated_at, product:products(slug, name_th, is_hidden)")
    .single();

  if (error || !data) {
    throw createError({
      statusCode: error?.code === "23505" ? 409 : error?.code === "23503" ? 404 : 500,
      statusMessage: error?.message ?? "Asset match create failed",
    });
  }

  return { item: mapAssetMatch(data) };
});