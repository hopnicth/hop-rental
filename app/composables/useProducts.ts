import { mockProducts } from "~/mock/products";
import type { Product, ProductPrice, ProductSKU } from "~/types/product";

/**
 * Composable for loading and filtering products.
 * Currently uses mapped mock data — replace with useFetch() when API is ready.
 */
export function useProducts() {
  // ── TODO: replace with useFetch('/api/products') when API is ready ──
  // `mockProducts` now includes transitional DB-shaped fixtures mapped into the
  // existing UI `Product` contract, which keeps the frontend stable during the
  // migration from legacy mocks to Supabase-backed catalog data.
  const allProducts = ref(mockProducts);

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
