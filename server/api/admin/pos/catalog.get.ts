import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import {
  ADMIN_POS_ASSET_SELECT,
  ADMIN_POS_SALE_SKU_SELECT,
  isRentablePosAsset,
  mapPosAssetCatalogItem,
  mapPosSaleCatalogItem,
  type AdminPosAssetRow,
  type AdminPosSaleSkuRow,
} from "~~/server/utils/admin-pos";

function safeTerm(value: string): string {
  return `*${value.replace(/[%_*]/g, "")}*`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isMissingInventoryKindColumn(error: unknown): boolean {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42703" ||
    /sku_branch_inventory\.inventory_kind|inventory_kind does not exist/i.test(
      err?.message ?? "",
    )
  );
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdminReadAccess(event);
  const q = getQuery(event);
  const search = typeof q.search === "string" ? q.search.trim() : "";
  const mode = q.mode === "rental" || q.mode === "sale" ? q.mode : "all";
  const branchId = typeof q.branchId === "string" ? q.branchId.trim() : "";

  const items: Array<
    | ReturnType<typeof mapPosAssetCatalogItem>
    | ReturnType<typeof mapPosSaleCatalogItem>
  > = [];

  if (mode === "all" || mode === "rental") {
    let query = adminClient
      .from("assets")
      .select(ADMIN_POS_ASSET_SELECT)
      .eq("status", "active")
      .eq("is_hidden", false)
      .eq("daily_enabled", true)
      .gt("daily_rate", 0)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(80);

    if (search) {
      const term = safeTerm(search);
      const clauses = [
        `code.ilike.${term}`,
        `slug.ilike.${term}`,
        `name_th.ilike.${term}`,
        `name_en.ilike.${term}`,
        `brand.ilike.${term}`,
      ];
      if (isUuid(search)) clauses.unshift(`id.eq.${search}`);
      query = query.or(clauses.join(","));
    }

    const { data, error } = await query;
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });

    items.push(
      ...((data ?? []) as AdminPosAssetRow[])
        .filter(isRentablePosAsset)
        .map(mapPosAssetCatalogItem),
    );
  }

  if (mode === "all" || mode === "sale") {
    let allowedSkuIds: string[] | null = null;
    const availableBySku = new Map<string, number>();

    if (branchId) {
      let branchStockResult = await adminClient
        .from("sku_branch_inventory")
        .select("sku_id, available")
        .eq("branch_id", branchId)
        .in("inventory_kind", ["sale", "shared"])
        .gt("available", 0)
        .limit(300);

      if (
        branchStockResult.error &&
        isMissingInventoryKindColumn(branchStockResult.error)
      ) {
        branchStockResult = await adminClient
          .from("sku_branch_inventory")
          .select("sku_id, available")
          .eq("branch_id", branchId)
          .gt("available", 0)
          .limit(300);
      }

      const { data: branchStock, error: branchStockError } = branchStockResult;

      if (branchStockError) {
        throw createError({
          statusCode: 500,
          statusMessage: branchStockError.message,
        });
      }

      allowedSkuIds = [
        ...new Set(
          (
            (branchStock ?? []) as Array<{
              sku_id?: unknown;
              available?: unknown;
            }>
          )
            .map((row) => String(row.sku_id ?? ""))
            .filter(Boolean),
        ),
      ];
      for (const row of (branchStock ?? []) as Array<{
        sku_id?: unknown;
        available?: unknown;
      }>) {
        const skuId = String(row.sku_id ?? "");
        const available = Number(row.available ?? 0);
        if (skuId && Number.isFinite(available)) {
          availableBySku.set(
            skuId,
            (availableBySku.get(skuId) ?? 0) + available,
          );
        }
      }

      if (allowedSkuIds.length === 0) {
        return { items };
      }
    }

    let matchingProductIds: string[] = [];
    if (search) {
      const term = safeTerm(search);
      const { data: products, error: productsError } = await adminClient
        .from("products")
        .select("id")
        .eq("is_hidden", false)
        .or(
          `id.ilike.${term},slug.ilike.${term},name_th.ilike.${term},name_en.ilike.${term},brand.ilike.${term}`,
        )
        .limit(80);

      if (productsError) {
        throw createError({
          statusCode: 500,
          statusMessage: productsError.message,
        });
      }
      matchingProductIds = ((products ?? []) as Array<{ id?: unknown }>)
        .map((row) => String(row.id ?? ""))
        .filter(Boolean);
    }

    let saleQuery = adminClient
      .from("product_skus")
      .select(ADMIN_POS_SALE_SKU_SELECT)
      .eq("product.is_hidden", false)
      .order("updated_at", { ascending: false })
      .limit(80);

    if (allowedSkuIds) saleQuery = saleQuery.in("id", allowedSkuIds);
    else saleQuery = saleQuery.gt("stock", 0);

    if (search) {
      const term = safeTerm(search);
      const clauses = [
        `id.ilike.${term}`,
        `sku_code.ilike.${term}`,
        `label_th.ilike.${term}`,
        `label_en.ilike.${term}`,
      ];
      if (matchingProductIds.length > 0) {
        clauses.push(`product_id.in.(${matchingProductIds.join(",")})`);
      }
      saleQuery = saleQuery.or(clauses.join(","));
    }

    const { data: saleSkus, error: saleError } = await saleQuery;
    if (saleError)
      throw createError({ statusCode: 500, statusMessage: saleError.message });

    const byProduct = new Map<
      string,
      ReturnType<typeof mapPosSaleCatalogItem>
    >();
    for (const sku of (saleSkus ?? []) as AdminPosSaleSkuRow[]) {
      const branchAvailable = availableBySku.get(String(sku.id));
      const mapped = mapPosSaleCatalogItem(
        branchAvailable === undefined ? sku : { ...sku, branchAvailable },
      );
      const existing = byProduct.get(mapped.id);
      if (existing) existing.skus.push(...mapped.skus);
      else byProduct.set(mapped.id, mapped);
    }
    items.push(...byProduct.values());
  }

  return { items };
});
