/**
 * DB-oriented catalog types for the long-term product/SKU model.
 *
 * Keep these separate from `~/types/product`, which is the current
 * UI-friendly mock/runtime shape used by the frontend today.
 */
import type { ProductDetailBlocks } from "~/types/product";

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

export interface CatalogMediaVariantRecord {
  url: string;
  path?: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface CatalogMediaGalleryItemRecord {
  id: string;
  title?: string | null;
  altText?: string | null;
  fit?: "contain" | "cover";
  status?: "processing" | "ready" | "failed";
  position?: number;
  error?: string | null;
  variants?: {
    thumbnail?: CatalogMediaVariantRecord;
    card?: CatalogMediaVariantRecord;
    large?: CatalogMediaVariantRecord;
  };
}

export interface CatalogMediaLinkRecord {
  id: string;
  kind: "youtube" | "external_video";
  title: string;
  url: string;
  thumbnailUrl?: string | null;
}

export interface CatalogDocumentLinkRecord {
  id: string;
  kind: "manual" | "catalog" | "datasheet" | "guide" | "other";
  title: string;
  url: string;
}

export interface CatalogProductMetricsRecord {
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
}

/**
 * Transitional SKU record.
 * Keeps core DB-like columns but adds enough fields for current UI mapping.
 */
export interface CatalogProductSKURecord extends CatalogProductSKU {
  media_gallery?: CatalogMediaGalleryItemRecord[];
  use_product_images?: boolean;
  attributes?: Record<string, string | undefined>;
  original_price?: number;
  discount_percent?: number;
}

/**
 * Transitional catalog product record.
 * Core identity/localized fields stay DB-like; the remaining properties are
 * temporary metadata needed to keep the current UI model working.
 */
export interface CatalogProductRecord extends CatalogProduct {
  category_keys?: string[];
  filter_keys?: string[];
  brand?: string;
  media_gallery?: CatalogMediaGalleryItemRecord[];
  media_links?: CatalogMediaLinkRecord[];
  spec?: Record<string, string | undefined>;
  documents?: CatalogDocumentLinkRecord[];
  detail_blocks?: ProductDetailBlocks;
  supplier_ids?: string[];
  skus: CatalogProductSKURecord[];
  metrics?: CatalogProductMetricsRecord | CatalogProductMetricsRecord[] | null;
  is_hidden?: boolean;
  shipping_size?: string | null;
  created_at?: string;
  updated_at?: string;
}
