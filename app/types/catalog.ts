/**
 * DB-oriented catalog types for the long-term product/SKU model.
 *
 * Keep these separate from `~/types/product`, which is the current
 * UI-friendly mock/runtime shape used by the frontend today.
 */

/** Sales channel for a catalog product. */
export type CatalogProductType = "sale" | "rental" | "hybrid";

/** Localized columns commonly returned from DB/API payloads. */
export interface CatalogLocalizedFields {
  th: string;
  en: string;
  cn?: string;
  jp?: string;
}

/**
 * Base product record expected from a future DB/API layer.
 * Uses explicit localized columns to match the requested schema.
 */
export interface CatalogProduct {
  id: string;
  slug: string;
  type: CatalogProductType;
  name_th: string;
  name_en: string;
  description_th: string;
  description_en: string;
  name_cn?: string;
  name_jp?: string;
  description_cn?: string;
  description_jp?: string;
}

/**
 * SKU record linked to a product.
 * Keeps localized labels plus core commercial fields.
 */
export interface CatalogProductSKU {
  id: string;
  product_id: string;
  label_th: string;
  label_en: string;
  label_cn?: string;
  label_jp?: string;
  price: number;
  stock: number;
}

/** DB-like document record used by transitional mocks. */
export interface CatalogDocumentRecord {
  url: string;
  name: CatalogLocalizedFields;
}

/** DB-like product document bundle used by transitional mocks. */
export interface CatalogProductDocuments {
  manual?: CatalogDocumentRecord;
  catalog?: CatalogDocumentRecord;
  datasheet?: CatalogDocumentRecord;
}

/**
 * Transitional SKU record.
 * Keeps core DB-like columns but adds enough fields for current UI mapping.
 */
export interface CatalogProductSKURecord extends CatalogProductSKU {
  image_url?: string;
  image_urls?: string[];
  attributes?: Record<string, string | undefined>;
  original_price?: number;
  discount_percent?: number;
  rental_deposit?: number;
  rental_daily?: number;
  rental_weekly?: number;
  rental_monthly?: number;
  rental_stock?: number;
  reserved_stock?: number;
}

/**
 * Transitional catalog product record.
 * Core identity/localized fields stay DB-like; the remaining properties are
 * temporary metadata needed to keep the current UI model working.
 */
export interface CatalogProductRecord extends CatalogProduct {
  category_keys?: string[];
  brand?: string;
  thumbnail_url?: string;
  image_urls?: string[];
  spec?: Record<string, string | undefined>;
  documents?: CatalogProductDocuments;
  supplier_ids?: string[];
  skus: CatalogProductSKURecord[];
  rental_min_days?: number;
  rental_max_days?: number;
  rental_buffer_days?: number;
  store_location_ids?: string[];
  view_count?: number;
  add_to_cart_count?: number;
  order_count?: number;
  rental_count?: number;
  wishlist_count?: number;
  avg_rating?: number;
  review_count?: number;
  return_rate?: number;
  trending_score?: number;
  last_sold_at?: string;
  last_rented_at?: string;
  is_hidden?: boolean;
  created_at?: string;
  updated_at?: string;
}
