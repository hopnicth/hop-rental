import type { LocalizedString } from "~/types/locale";
import type { ShippingSize } from "~/config/shipping";

// ─────────────────────────────────────────────
// Sub-interfaces — Spec & Docs
// ─────────────────────────────────────────────

/**
 * Product specification — fixed fields + dynamic key-value pairs.
 *
 * Fixed fields provide autocomplete & type safety for common specs.
 * Admin can add extra specs via the index signature.
 */
export interface ProductSpec {
  // ── Fixed fields ──
  size?: string;
  weight?: string;
  color?: string;
  material?: string;
  power?: string;
  ampere?: string;
  voltage?: string;
  // ── Dynamic fields (admin can add any key) ──
  [key: string]: string | undefined;
}

export interface ProductDocumentLink {
  id: string;
  kind: "manual" | "catalog" | "datasheet" | "guide" | "other";
  title: string;
  url: string;
}

export interface ProductMediaLink {
  id: string;
  kind: "youtube" | "external_video";
  title: string;
  url: string;
  thumbnailUrl?: string | null;
}

// ─────────────────────────────────────────────
// Sub-interfaces — Detail blocks (jsonb-driven)
// ─────────────────────────────────────────────

/**
 * Link button rendered inside a detail block.
 * Stored in DB as a flat record with `label_*` and `url` keys.
 */
export interface ProductDetailBlockButton {
  id?: string;
  label: LocalizedString;
  url: string;
  icon?: string;
}

/**
 * One detail block — top-level key from `products.detail_blocks` jsonb.
 * Renders as a stacked section on the product detail page.
 */
export interface ProductDetailBlock {
  title?: LocalizedString;
  body?: LocalizedString;
  items?: string[];
  buttons?: ProductDetailBlockButton[];
}

/** Map of admin-defined section key → block. Insertion order is preserved. */
export type ProductDetailBlocks = Record<string, ProductDetailBlock>;

// ─────────────────────────────────────────────
// Sub-interfaces — Pricing
// ─────────────────────────────────────────────

/**
 * A single wholesale pricing tier.
 */
export interface WholesaleTier {
  /** Minimum quantity for this tier */
  quantity: number;
  /** Original price per unit */
  original: number;
  /** Discount percentage (0–100) */
  discount: number;
  /** Final price per unit after discount */
  final: number;
}

/**
 * Product sale price.
 */
export interface ProductPrice {
  /** Original price (before discount) */
  original: number;
  /** Discount percentage (0–100), 0 = no discount */
  discount: number;
  /** Final price after discount */
  final: number;
  /** Wholesale tiers — optional, for bulk pricing */
  wholesale?: WholesaleTier[];
}

// ─────────────────────────────────────────────
// Sub-interfaces — SKU (Variant)
// ─────────────────────────────────────────────

/**
 * Variant attributes — dynamic key-value pairs.
 * e.g. { color: "Red", size: "M" }
 */
export interface VariantAttribute {
  [key: string]: string | undefined;
}

/**
 * Stock per SKU — tracks sale stock, rental availability, and reserved units.
 */
export interface SKUStock {
  /** Number of units in stock for sale */
  inStock: number;
  /** Number of units available for rent */
  available: number;
  /** Number of units currently rented out / reserved */
  reserved: number;
}

/**
 * A single SKU (Stock Keeping Unit) — represents one purchasable variant.
 *
 * Products with no variants have exactly 1 SKU (the "default" SKU).
 * Products with variants (e.g. color/size) have multiple SKUs.
 */
export interface ProductSKU {
  /** Unique SKU identifier, e.g. "sku-001-red-m" */
  id: string;
  /** Display label for this variant — optional, localized */
  label?: LocalizedString;
  /** Attributes that differ from product-level spec */
  attributes: VariantAttribute;
  /** Override image for this variant (falls back to product.thumbnail) */
  image?: string;
  /** Variant-specific gallery images (falls back to product.images) */
  images?: string[];
  /** Explicitly force product-level images even if SKU gallery exists */
  useProductImages?: boolean;
  /** Source-of-truth sale pricing for this SKU */
  price: ProductPrice;
  /** Source-of-truth offer-level stock/availability counters for this SKU */
  stock: SKUStock;
}

// ─────────────────────────────────────────────
// Sub-interfaces — Marketing Insights
// ─────────────────────────────────────────────

/**
 * Marketing & analytics data for a product.
 * Used by marketing team to evaluate product performance.
 */
export interface ProductInsight {
  /** Total page views */
  viewCount: number;
  /** Times added to cart */
  addToCartCount: number;
  /** Completed sale orders */
  orderCount: number;
  /** Completed rental orders */
  rentalCount: number;
  /** Times added to wishlist */
  wishlistCount: number;
  /** Average rating (0–5) */
  avgRating: number;
  /** Number of reviews */
  reviewCount: number;
  /** Return rate percentage (0–100) */
  returnRate: number;
  /** Trending score — computed by algorithm */
  trendingScore: number;
  /** ISO date — last sale */
  lastSoldAt?: string;
  /** ISO date — last rental */
  lastRentedAt?: string;
}

// ─────────────────────────────────────────────
// Main Product interface
// ─────────────────────────────────────────────

/**
 * Product — สินค้า / อุปกรณ์
 *
 * In the future, data will come from the database (Admin dashboard).
 * For now, we use mock data with this production-ready structure.
 */
export interface Product {
  /** Unique identifier */
  id: string;
  /** URL-friendly slug */
  slug: string;
  /** Category keys — includes both main category keys and sub-category IDs */
  categories: string[];
  /** Dynamic-filter keys synced by trigger as `${groupKey}__${optionKey}` */
  filterKeys: string[];
  /** Product name — localized */
  name: LocalizedString;
  /** Brand name (universal, not localized) */
  brand: string;
  /** Thumbnail image URL — used in cards & listings */
  thumbnail: string;
  /** Gallery images — full-size product photos */
  images: string[];
  /** Product description — localized */
  description: LocalizedString;
  /** Technical specifications (shared across all SKUs) */
  spec: ProductSpec;
  /** Product-level external document links */
  documents?: ProductDocumentLink[];
  /** Product-level external media/video links */
  mediaLinks?: ProductMediaLink[];
  /** Admin-authored detail sections from `products.detail_blocks` jsonb */
  detailBlocks?: ProductDetailBlocks;
  /** Supplier IDs — references Supplier.id */
  suppliers: string[];
  /** Whether this product is sale-capable at the product level */
  isForSale: boolean;
  /** SKU variants — source of truth for price/stock within this product */
  skus: ProductSKU[];
  /** Shipping size bucket — drives the cart shipping fee bin-pack. */
  shippingSize?: ShippingSize;
  /** Marketing & analytics insights */
  insight: ProductInsight;
  /** ISO date string — when product was created */
  createdAt: string;
  /** ISO date string — last update */
  updatedAt: string;
  /** If true, product is hidden from the website */
  isHide: boolean;
}
