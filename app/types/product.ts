import type { LocalizedString } from "~/types/locale";

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

/**
 * A single document file (manual, catalog, datasheet).
 */
export interface ProductDocFile {
  /** URL of the file (PDF, etc.) */
  url: string;
  /** Display name — localized */
  name: LocalizedString;
}

/**
 * Product documents — all optional.
 */
export interface ProductDoc {
  manual?: ProductDocFile;
  catalog?: ProductDocFile;
  datasheet?: ProductDocFile;
}

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

/**
 * Rental pricing.
 */
export interface RentalPrice {
  /** Deposit amount */
  deposit: number;
  /** Daily rental rate */
  daily: number;
  /** Weekly rental rate */
  weekly: number;
  /** Monthly rental rate */
  monthly: number;
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
  /** Source-of-truth sale pricing for this SKU */
  price: ProductPrice;
  /** Source-of-truth rental pricing for this SKU */
  rentalPrice: RentalPrice;
  /** Source-of-truth offer-level stock/availability counters for this SKU */
  stock: SKUStock;
}

// ─────────────────────────────────────────────
// Sub-interfaces — Rental Configuration
// ─────────────────────────────────────────────

/**
 * Rental business rules — controls capability and logistics.
 *
 * This is not the live reservation ledger for physical asset instances.
 */
export interface RentalConfig {
  /** Whether this product is capable of being rented */
  isRental: boolean;
  /** Minimum rental period (days) */
  minDays: number;
  /** Maximum rental period (days), 0 = unlimited */
  maxDays: number;
  /** Buffer days between two rental orders (maintenance/cleaning) */
  bufferDays: number;
  /** Hub IDs allowed to fulfill the rental — capability, not live availability */
  storeLocationIds: string[];
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
  /** Related documents (manual, catalog, datasheet) */
  doc: ProductDoc;
  /** Supplier IDs — references Supplier.id */
  suppliers: string[];
  /** Whether this product is sale-capable at the product level */
  isForSale: boolean;
  /** SKU variants — source of truth for price/stock within this product */
  skus: ProductSKU[];
  /** Rental capability rules & configuration */
  rentalConfig: RentalConfig;
  /** Marketing & analytics insights */
  insight: ProductInsight;
  /** ISO date string — when product was created */
  createdAt: string;
  /** ISO date string — last update */
  updatedAt: string;
  /** If true, product is hidden from the website */
  isHide: boolean;
}
