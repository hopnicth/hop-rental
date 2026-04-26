import { createError, defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

/**
 * GET /api/admin/products/skus-search?q=...
 * Search product SKUs by skuCode, labelTh, labelEn, product nameTh/nameEn.
 * Returns lightweight rows for the inventory "add product" picker.
 */
export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const query = getQuery(event);
  const q = typeof query.q === "string" ? query.q.trim() : "";

  if (q.length === 0) {
    return { items: [] };
  }

  // Search SKUs + their parent product name for display
  const pattern = `%${q}%`;

  const { data, error } = await adminClient
    .from("product_skus")
    .select(
      "id, product_id, sku_code, label_th, label_en, price, stock, product:products!inner(name_th, name_en, slug)",
    )
    .or(
      `sku_code.ilike.${pattern},label_th.ilike.${pattern},label_en.ilike.${pattern}`,
    )
    .order("sku_code", { ascending: true })
    .limit(20);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  // If no SKU-level matches, also try product name search
  let results = data ?? [];

  if (results.length === 0) {
    const { data: byProduct, error: byProductError } = await adminClient
      .from("product_skus")
      .select(
        "id, product_id, sku_code, label_th, label_en, price, stock, product:products!inner(name_th, name_en, slug)",
      )
      .or(
        `products.name_th.ilike.${pattern},products.name_en.ilike.${pattern}`,
        { foreignTable: "products" },
      )
      .order("sku_code", { ascending: true })
      .limit(20);

    if (!byProductError && byProduct) {
      results = byProduct;
    }
  }

  return {
    items: results.map((row: Record<string, unknown>) => {
      const product =
        row.product && typeof row.product === "object"
          ? (row.product as Record<string, unknown>)
          : {};

      return {
        skuId: String(row.id ?? ""),
        productId: String(row.product_id ?? ""),
        skuCode: String(row.sku_code ?? ""),
        labelTh: String(row.label_th ?? ""),
        labelEn: String(row.label_en ?? ""),
        price: Number(row.price ?? 0),
        stock: Number(row.stock ?? 0),
        productNameTh: String(product.name_th ?? ""),
        productNameEn: String(product.name_en ?? ""),
        productSlug: String(product.slug ?? ""),
      };
    }),
  };
});
