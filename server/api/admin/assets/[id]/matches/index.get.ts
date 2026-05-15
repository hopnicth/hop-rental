import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";

type AssetMatchRow = Record<string, unknown> & {
  product?: {
    name_th?: string | null;
    slug?: string | null;
    is_hidden?: boolean | null;
  } | null;
};

function mapAssetMatch(row: AssetMatchRow) {
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
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);
  const assetId = getRouterParam(event, "id");

  if (!assetId) {
    throw createError({
      statusCode: 400,
      statusMessage: "asset id is required",
    });
  }

  const [matchesResult, productsResult] = await Promise.all([
    adminClient
      .from("asset_matches")
      .select(
        "id, asset_id, product_id, match_type, sort_order, note, updated_at, product:products(slug, name_th, is_hidden)",
      )
      .eq("asset_id", assetId)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false }),
    adminClient
      .from("products")
      .select("id, slug, name_th, is_hidden")
      .order("updated_at", { ascending: false }),
  ]);

  if (matchesResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: matchesResult.error.message,
    });
  }
  if (productsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: productsResult.error.message,
    });
  }

  return {
    items: (matchesResult.data ?? []).map((row) => mapAssetMatch(row)),
    productOptions: (productsResult.data ?? []).map((row) => ({
      value: row.id,
      label: `${row.name_th} · ${row.slug}`,
      isHidden: row.is_hidden === true,
    })),
    meta: { adminMode, warning: adminWarning },
  };
});
