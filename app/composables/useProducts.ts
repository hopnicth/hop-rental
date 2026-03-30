import { mockProducts } from "~/mock/products";
import { mapCatalogProductsToProducts } from "~/mappers/catalog";
import type {
  CatalogDocumentRecord,
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

function normalizeDocument(value: unknown): CatalogDocumentRecord | undefined {
  if (!isRecord(value) || !isRecord(value.name)) return undefined;

  const url = toString(value.url);
  const th = toString(value.name.th) ?? toString(value.name.en);
  const en = toString(value.name.en) ?? toString(value.name.th);

  if (!url || !th || !en) return undefined;

  return {
    url,
    name: {
      th,
      en,
      cn: toString(value.name.cn),
      jp: toString(value.name.jp),
    },
  };
}

function normalizeDocuments(
  value: unknown,
): CatalogProductRecord["documents"] | undefined {
  if (!isRecord(value)) return undefined;

  const manual = normalizeDocument(value.manual);
  const catalog = normalizeDocument(value.catalog);
  const datasheet = normalizeDocument(value.datasheet);

  return manual || catalog || datasheet
    ? { manual, catalog, datasheet }
    : undefined;
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
    image_url: toString(row.image_url),
    image_urls: toStringArray(row.image_urls),
    attributes: toStringRecord(row.attributes),
    price: toNumber(row.price),
    original_price:
      row.original_price == null ? undefined : toNumber(row.original_price),
    discount_percent:
      row.discount_percent == null ? undefined : toNumber(row.discount_percent),
    rental_deposit:
      row.rental_deposit == null ? undefined : toNumber(row.rental_deposit),
    rental_daily:
      row.rental_daily == null ? undefined : toNumber(row.rental_daily),
    rental_weekly:
      row.rental_weekly == null ? undefined : toNumber(row.rental_weekly),
    rental_monthly:
      row.rental_monthly == null ? undefined : toNumber(row.rental_monthly),
    stock: toNumber(row.stock),
    rental_stock:
      row.rental_stock == null ? undefined : toNumber(row.rental_stock),
    reserved_stock:
      row.reserved_stock == null ? undefined : toNumber(row.reserved_stock),
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
    thumbnail_url: toString(row.thumbnail_url),
    image_urls: toStringArray(row.image_urls),
    spec: toStringRecord(row.spec),
    documents: normalizeDocuments(row.documents),
    supplier_ids: toStringArray(row.supplier_ids),
    skus,
    rental_min_days: toNumber(row.rental_min_days, 1),
    rental_max_days: toNumber(row.rental_max_days, 0),
    rental_buffer_days: toNumber(row.rental_buffer_days, 0),
    store_location_ids: toStringArray(row.store_location_ids),
    view_count: toNumber(row.view_count),
    add_to_cart_count: toNumber(row.add_to_cart_count),
    order_count: toNumber(row.order_count),
    rental_count: toNumber(row.rental_count),
    wishlist_count: toNumber(row.wishlist_count),
    avg_rating: toNumber(row.avg_rating),
    review_count: toNumber(row.review_count),
    return_rate: toNumber(row.return_rate),
    trending_score: toNumber(row.trending_score),
    last_sold_at: toString(row.last_sold_at),
    last_rented_at: toString(row.last_rented_at),
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
  const allProducts = useState<Product[]>(
    "catalog:all-products",
    () => mockProducts,
  );
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
            thumbnail_url,
            image_urls,
            spec,
            documents,
            supplier_ids,
            rental_min_days,
            rental_max_days,
            rental_buffer_days,
            store_location_ids,
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
            last_rented_at,
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
              image_url,
              image_urls,
              attributes,
              price,
              original_price,
              discount_percent,
              rental_deposit,
              rental_daily,
              rental_weekly,
              rental_monthly,
              stock,
              rental_stock,
              reserved_stock
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

      if (remoteProducts.length > 0) {
        allProducts.value = remoteProducts;
        hasRemoteCatalog.value = true;
      } else {
        console.warn(
          "[useProducts] No usable remote catalog rows found. Keeping mock catalog.",
        );
      }
    } catch (fetchError) {
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
    return product.skus[0];
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

  /**
   * Check if a product is available for rental.
   */
  function isRental(product: Product): boolean {
    return product.rentalConfig.isRental;
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
    isRental,
  };
}
