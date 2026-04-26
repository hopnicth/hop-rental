import { mapCatalogProductsToProducts } from "~/mappers/catalog";
import type {
  CatalogDocumentLinkRecord,
  CatalogMediaGalleryItemRecord,
  CatalogMediaLinkRecord,
  CatalogProductMetricsRecord,
  CatalogProductRecord,
  CatalogProductSKURecord,
} from "~/types/catalog";
import type { Product, ProductPrice, ProductSKU } from "~/types/product";

const CATALOG_ONCE_KEY = "catalog:products";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toStringRecord(
  value: unknown,
): Record<string, string | undefined> | undefined {
  if (!isRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : undefined,
    ]),
  );
}

function normalizeProductType(value: unknown): CatalogProductRecord["type"] {
  return value === "rental" || value === "hybrid" || value === "sale"
    ? value
    : "sale";
}

function normalizeMediaGallery(
  value: unknown,
): CatalogMediaGalleryItemRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map(
      (item, index): CatalogMediaGalleryItemRecord => ({
        id: toString(item.id) ?? `media-${index + 1}`,
        title: toString(item.title) ?? null,
        altText: toString(item.altText) ?? null,
        fit: item.fit === "cover" ? "cover" : "contain",
        status:
          item.status === "processing" || item.status === "failed"
            ? item.status
            : "ready",
        position: toNumber(item.position, index),
        error: toString(item.error) ?? null,
        variants: isRecord(item.variants)
          ? {
              thumbnail: isRecord(item.variants.thumbnail)
                ? {
                    url: toString(item.variants.thumbnail.url) ?? "",
                    path: toString(item.variants.thumbnail.path),
                    width: toNumber(item.variants.thumbnail.width, 300),
                    height: toNumber(item.variants.thumbnail.height, 300),
                    format: toString(item.variants.thumbnail.format),
                  }
                : undefined,
              card: isRecord(item.variants.card)
                ? {
                    url: toString(item.variants.card.url) ?? "",
                    path: toString(item.variants.card.path),
                    width: toNumber(item.variants.card.width, 800),
                    height: toNumber(item.variants.card.height, 800),
                    format: toString(item.variants.card.format),
                  }
                : undefined,
              large: isRecord(item.variants.large)
                ? {
                    url: toString(item.variants.large.url) ?? "",
                    path: toString(item.variants.large.path),
                    width: toNumber(item.variants.large.width, 1600),
                    height: toNumber(item.variants.large.height, 1600),
                    format: toString(item.variants.large.format),
                  }
                : undefined,
            }
          : undefined,
      }),
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function normalizeMediaLinks(value: unknown): CatalogMediaLinkRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map(
      (item, index): CatalogMediaLinkRecord => ({
        id: toString(item.id) ?? `media-link-${index + 1}`,
        kind: item.kind === "external_video" ? "external_video" : "youtube",
        title: toString(item.title) ?? `Video ${index + 1}`,
        url: toString(item.url) ?? "",
        thumbnailUrl: toString(item.thumbnailUrl) ?? null,
      }),
    )
    .filter((item) => item.url.length > 0);
}

function normalizeDocuments(
  value: unknown,
): CatalogDocumentLinkRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const items = value
    .filter(isRecord)
    .map((item, index) => ({
      id: toString(item.id) ?? `document-${index + 1}`,
      kind: (["manual", "catalog", "datasheet", "guide"].includes(
        toString(item.kind) ?? "",
      )
        ? (toString(item.kind) as CatalogDocumentLinkRecord["kind"])
        : "other") as CatalogDocumentLinkRecord["kind"],
      title: toString(item.title) ?? `Document ${index + 1}`,
      url: toString(item.url) ?? "",
    }))
    .filter((item) => item.url.length > 0);

  return items.length > 0 ? items : undefined;
}

function normalizeMetrics(
  value: unknown,
): CatalogProductMetricsRecord | CatalogProductMetricsRecord[] | null {
  if (Array.isArray(value)) {
    return value.filter(isRecord).map((item) => ({
      view_count: toNumber(item.view_count),
      add_to_cart_count: toNumber(item.add_to_cart_count),
      order_count: toNumber(item.order_count),
      rental_count: toNumber(item.rental_count),
      wishlist_count: toNumber(item.wishlist_count),
      avg_rating: toNumber(item.avg_rating),
      review_count: toNumber(item.review_count),
      return_rate: toNumber(item.return_rate),
      trending_score: toNumber(item.trending_score),
      last_sold_at: toString(item.last_sold_at),
      last_rented_at: toString(item.last_rented_at),
    }));
  }

  if (!isRecord(value)) return null;

  return {
    view_count: toNumber(value.view_count),
    add_to_cart_count: toNumber(value.add_to_cart_count),
    order_count: toNumber(value.order_count),
    rental_count: toNumber(value.rental_count),
    wishlist_count: toNumber(value.wishlist_count),
    avg_rating: toNumber(value.avg_rating),
    review_count: toNumber(value.review_count),
    return_rate: toNumber(value.return_rate),
    trending_score: toNumber(value.trending_score),
    last_sold_at: toString(value.last_sold_at),
    last_rented_at: toString(value.last_rented_at),
  };
}

function normalizeCatalogSkuRow(row: unknown): CatalogProductSKURecord | null {
  if (!isRecord(row)) return null;

  const id = toString(row.id);
  const productId = toString(row.product_id);
  if (!id || !productId) return null;

  const labelTh = toString(row.label_th) ?? toString(row.label_en) ?? id;
  const labelEn = toString(row.label_en) ?? toString(row.label_th) ?? id;

  return {
    id,
    product_id: productId,
    label_th: labelTh,
    label_en: labelEn,
    label_cn: toString(row.label_cn),
    label_jp: toString(row.label_jp),
    media_gallery: normalizeMediaGallery(row.media_gallery),
    use_product_images: row.use_product_images !== false,
    attributes: toStringRecord(row.attributes),
    price: toNumber(row.price),
    original_price:
      row.original_price == null ? undefined : toNumber(row.original_price),
    discount_percent:
      row.discount_percent == null ? undefined : toNumber(row.discount_percent),
    stock: toNumber(row.stock),
  };
}

function normalizeCatalogProductRow(row: unknown): CatalogProductRecord | null {
  if (!isRecord(row)) return null;

  const id = toString(row.id);
  const slug = toString(row.slug);
  if (!id || !slug) return null;

  const skus = (Array.isArray(row.skus) ? row.skus : [])
    .map(normalizeCatalogSkuRow)
    .filter((sku): sku is CatalogProductSKURecord => sku !== null)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (skus.length === 0) return null;

  const nameTh = toString(row.name_th) ?? toString(row.name_en) ?? slug;
  const nameEn = toString(row.name_en) ?? toString(row.name_th) ?? slug;
  const descriptionTh =
    toString(row.description_th) ?? toString(row.description_en) ?? nameTh;
  const descriptionEn =
    toString(row.description_en) ?? toString(row.description_th) ?? nameEn;

  return {
    id,
    slug,
    type: normalizeProductType(row.type),
    name_th: nameTh,
    name_en: nameEn,
    name_cn: toString(row.name_cn),
    name_jp: toString(row.name_jp),
    description_th: descriptionTh,
    description_en: descriptionEn,
    description_cn: toString(row.description_cn),
    description_jp: toString(row.description_jp),
    category_keys: toStringArray(row.category_keys),
    brand: toString(row.brand),
    media_gallery: normalizeMediaGallery(row.media_gallery),
    media_links: normalizeMediaLinks(row.media_links),
    spec: toStringRecord(row.spec),
    documents: normalizeDocuments(row.documents),
    supplier_ids: toStringArray(row.supplier_ids),
    skus,
    metrics: normalizeMetrics(row.metrics),
    is_hidden: row.is_hidden === true,
    created_at: toString(row.created_at),
    updated_at: toString(row.updated_at),
  };
}

/**
 * Composable for loading and filtering products.
 * Keeps the existing synchronous-looking API while hydrating shared state from
 * Supabase when catalog data is available.
 */
export function useProducts() {
  const supabase = useSupabaseClient();
  const allProducts = useState<Product[]>("catalog:all-products", () => []);
  const hasRemoteCatalog = useState<boolean>(
    "catalog:remote-loaded",
    () => false,
  );
  const loading = useState<boolean>("catalog:loading", () => false);
  const error = useState<string | null>("catalog:error", () => null);

  async function fetchProductsFromCatalog(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const { data, error: catalogError } = await supabase
        .from("products")
        .select(
          `
            id,
            slug,
            type,
            name_th,
            name_en,
            name_cn,
            name_jp,
            description_th,
            description_en,
            description_cn,
            description_jp,
            category_keys,
            brand,
            media_gallery,
            media_links,
            spec,
            documents,
            supplier_ids,
            metrics:product_metrics(
              view_count,
              add_to_cart_count,
              order_count,
              rental_count,
              wishlist_count,
              avg_rating,
              review_count,
              return_rate,
              trending_score,
              last_sold_at,
              last_rented_at
            ),
            is_hidden,
            created_at,
            updated_at,
            skus:product_skus(
              id,
              product_id,
              label_th,
              label_en,
              label_cn,
              label_jp,
              media_gallery,
              use_product_images,
              attributes,
              price,
              original_price,
              discount_percent,
              stock
            )
          `,
        )
        .order("created_at", { ascending: false });

      if (catalogError) {
        throw catalogError;
      }

      const remoteCatalogRecords = (data ?? [])
        .map(normalizeCatalogProductRow)
        .filter((record): record is CatalogProductRecord => record !== null);

      const remoteProducts = mapCatalogProductsToProducts(remoteCatalogRecords);

      allProducts.value = remoteProducts;
      hasRemoteCatalog.value = true;

      if (remoteProducts.length === 0) {
        console.info(
          "[useProducts] No product rows found in Supabase catalog.",
        );
      }
    } catch (fetchError) {
      allProducts.value = [];
      error.value =
        fetchError instanceof Error
          ? fetchError.message
          : "Unknown catalog error";
      console.warn(
        "[useProducts] Failed to fetch catalog from Supabase:",
        fetchError,
      );
    } finally {
      loading.value = false;
    }
  }

  async function ensureProductsLoaded(): Promise<void> {
    await callOnce(CATALOG_ONCE_KEY, fetchProductsFromCatalog);
  }

  onServerPrefetch(ensureProductsLoaded);

  if (import.meta.client) {
    void ensureProductsLoaded();
  }

  /**
   * Visible products — excludes hidden items (isHide = true).
   */
  const products = computed(() => allProducts.value.filter((p) => !p.isHide));

  /**
   * Get a single product by ID.
   * Returns undefined if not found or hidden.
   */
  function getProductById(id: string) {
    return computed(() => products.value.find((p) => p.id === id));
  }

  /**
   * Get products filtered by category key (main or sub).
   */
  function getProductsByCategory(categoryKey: string) {
    return computed(() =>
      products.value.filter((p) => p.categories.includes(categoryKey)),
    );
  }

  /**
   * Get a single product by slug.
   * Returns undefined if not found or hidden.
   */
  function getProductBySlug(slug: string) {
    return computed(() => products.value.find((p) => p.slug === slug));
  }

  /**
   * Get products filtered by brand name.
   */
  function getProductsByBrand(brand: string) {
    return computed(() => products.value.filter((p) => p.brand === brand));
  }

  // ─────────────────────────────────────────────
  // SKU Helpers
  // ─────────────────────────────────────────────

  /**
   * Get the default (first) SKU of a product.
   */
  function getDefaultSKU(product: Product): ProductSKU {
    return product.skus[0]!;
  }

  /**
   * Find a specific SKU inside a product.
   */
  function getSkuById(product: Product, skuId: string): ProductSKU | undefined {
    return product.skus.find((sku) => sku.id === skuId);
  }

  /**
   * Get the display price for product listings.
   * Returns the lowest `final` price across all SKUs.
   */
  function getDisplayPrice(product: Product): ProductPrice {
    return product.skus.reduce((lowest, sku) =>
      sku.price.final < lowest.price.final ? sku : lowest,
    ).price;
  }

  /**
   * Get aggregated stock across all SKUs.
   */
  function getTotalStock(product: Product) {
    return product.skus.reduce(
      (acc, sku) => ({
        inStock: acc.inStock + sku.stock.inStock,
        available: acc.available + sku.stock.available,
        reserved: acc.reserved + sku.stock.reserved,
      }),
      { inStock: 0, available: 0, reserved: 0 },
    );
  }

  /**
   * Get current sale stock for one SKU.
   * Returns null when the catalog item or SKU cannot be resolved.
   */
  function getSaleStockBySku(productId: string, skuId: string): number | null {
    const product = products.value.find((item) => item.id === productId);
    if (!product) return null;
    if (!product.isForSale) return 0;

    const sku = getSkuById(product, skuId);
    if (!sku) return null;

    return Math.max(0, sku.stock.inStock);
  }

  return {
    products,
    getProductById,
    getProductBySlug,
    getProductsByCategory,
    getProductsByBrand,
    getDefaultSKU,
    getSkuById,
    getDisplayPrice,
    getTotalStock,
    getSaleStockBySku,
  };
}
