import { createError } from "h3";
import {
  normalizeCatalogDocuments,
  normalizeCatalogMediaGallery,
  normalizeCatalogMediaLinks,
} from "~~/server/utils/catalog-media";

export const ADMIN_PRODUCT_LIST_SELECT =
  "id, slug, type, name_th, name_en, main_category_key, tag_keys, category_keys, brand, media_gallery, search_keywords, is_hidden, updated_at, metrics:product_metrics(view_count, order_count, rental_count, wishlist_count, trending_score), skus:product_skus(id, price, original_price, currency_code)";

export const ADMIN_SKU_INVENTORY_SELECT =
  "id, product_id, sku_id, inventory_id, branch_id, branch_code, branch_name, on_hand, available, reserved, incoming, safety_stock, notes, created_at, updated_at";

export const ADMIN_SKU_INVENTORY_WITH_REF_SELECT = `${ADMIN_SKU_INVENTORY_SELECT}, inventory:inventories(id, name, is_default, branch_id, notes)`;

export const ADMIN_PRODUCT_METRICS_SELECT =
  "view_count, add_to_cart_count, order_count, rental_count, wishlist_count, avg_rating, review_count, return_rate, trending_score, last_sold_at, last_rented_at";

export const ADMIN_SKU_SELECT = `id, product_id, sku_code, label_th, label_en, media_gallery, use_product_images, attributes, price, original_price, discount_percent, currency_code, promo_start_at, promo_end_at, pricing_tiers, stock, created_at, updated_at, inventory:sku_branch_inventory(${ADMIN_SKU_INVENTORY_SELECT})`;

export const ADMIN_PRODUCT_DETAIL_SELECT = `id, slug, type, name_th, name_en, description_th, description_en, main_category_key, tag_keys, category_keys, brand, media_gallery, media_links, search_keywords, spec, detail_blocks, documents, is_hidden, created_at, updated_at, metrics:product_metrics(${ADMIN_PRODUCT_METRICS_SELECT}), skus:product_skus(${ADMIN_SKU_SELECT})`;

function fail422(message: string): never {
  throw createError({
    statusCode: 422,
    statusMessage: message,
  });
}

export function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail422(`${field} is required`);
  }

  return value.trim();
}

export function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function asOptionalBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asOptionalDateTime(value: unknown, field: string): string | null {
  const raw = asOptionalString(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    fail422(`${field} must be a valid datetime`);
  }

  return parsed.toISOString();
}

export function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mediaVariantUrl(
  item: Record<string, unknown>,
  key: "large" | "card" | "thumbnail",
) {
  const variants = isRecord(item.variants) ? item.variants : null;
  const variant = variants && isRecord(variants[key]) ? variants[key] : null;
  return asOptionalString(variant?.url);
}

function mediaGalleryImageUrls(value: unknown): string[] {
  return normalizeCatalogMediaGallery(value)
    .filter((item) => item.status === "ready")
    .map(
      (item) =>
        mediaVariantUrl(item, "large") ||
        mediaVariantUrl(item, "card") ||
        mediaVariantUrl(item, "thumbnail") ||
        "",
    )
    .filter(Boolean);
}

function mediaGalleryPrimaryUrl(value: unknown): string {
  return (
    normalizeCatalogMediaGallery(value)
      .filter((item) => item.status === "ready")
      .map(
        (item) =>
          mediaVariantUrl(item, "card") ||
          mediaVariantUrl(item, "thumbnail") ||
          mediaVariantUrl(item, "large") ||
          "",
      )
      .find(Boolean) ?? ""
  );
}

function parseJsonInput(value: unknown, field: string): unknown {
  if (typeof value === "string") {
    if (value.trim().length === 0) return null;

    try {
      return JSON.parse(value);
    } catch {
      fail422(`${field} must be valid JSON`);
    }
  }

  return value;
}

export function asJsonObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  const parsed = parseJsonInput(value, field);

  if (parsed == null) return {};
  if (!isRecord(parsed)) fail422(`${field} must be a JSON object`);

  return parsed;
}

export function asJsonArray(value: unknown, field: string): unknown[] {
  const parsed = parseJsonInput(value, field);

  if (parsed == null) return [];
  if (!Array.isArray(parsed)) fail422(`${field} must be a JSON array`);

  return parsed;
}

function buildCategoryKeys(
  mainCategoryKey: string,
  tagKeys: string[],
): string[] {
  return Array.from(new Set([mainCategoryKey, ...tagKeys].filter(Boolean)));
}

export function asProductType(value: unknown): "sale" | "rental" | "hybrid" {
  if (value === "sale" || value === "rental" || value === "hybrid") {
    return value;
  }

  fail422("type must be sale, rental, or hybrid");
}

export function buildProductPayload(
  body: Record<string, unknown>,
  options: { partial?: boolean } = {},
) {
  const partial = options.partial === true;
  const categoryKeys = asStringArray(body.categoryKeys);
  const mainCategoryKey =
    asOptionalString(body.mainCategoryKey) ?? categoryKeys[0];
  const tagKeys =
    body.tagKeys === undefined
      ? mainCategoryKey
        ? categoryKeys.filter((item) => item !== mainCategoryKey)
        : categoryKeys
      : asStringArray(body.tagKeys);

  const payload: Record<string, unknown> = {};

  if (!partial || body.slug !== undefined) {
    payload.slug = asNonEmptyString(body.slug, "slug");
  }
  if (!partial || body.type !== undefined) {
    payload.type = asProductType(body.type);
  }
  if (!partial || body.nameTh !== undefined) {
    payload.name_th = asNonEmptyString(body.nameTh, "nameTh");
  }
  if (!partial || body.nameEn !== undefined) {
    payload.name_en = asNonEmptyString(body.nameEn, "nameEn");
  }
  if (!partial || body.descriptionTh !== undefined) {
    payload.description_th = asNonEmptyString(
      body.descriptionTh,
      "descriptionTh",
    );
  }
  if (!partial || body.descriptionEn !== undefined) {
    payload.description_en = asNonEmptyString(
      body.descriptionEn,
      "descriptionEn",
    );
  }
  if (!partial || body.brand !== undefined) {
    payload.brand = asOptionalString(body.brand);
  }
  if (!partial || body.isHidden !== undefined) {
    payload.is_hidden = asOptionalBoolean(body.isHidden);
  }

  if (
    !partial ||
    body.mainCategoryKey !== undefined ||
    body.categoryKeys !== undefined ||
    body.tagKeys !== undefined
  ) {
    if (!mainCategoryKey) {
      fail422("mainCategoryKey is required");
    }

    payload.main_category_key = mainCategoryKey;
    payload.tag_keys = tagKeys;
    payload.category_keys = buildCategoryKeys(mainCategoryKey, tagKeys);
  }

  if (!partial || body.mediaGallery !== undefined) {
    payload.media_gallery = normalizeCatalogMediaGallery(body.mediaGallery);
  }
  if (!partial || body.mediaLinks !== undefined) {
    payload.media_links = normalizeCatalogMediaLinks(body.mediaLinks);
  }
  if (!partial || body.searchKeywords !== undefined) {
    payload.search_keywords = asStringArray(body.searchKeywords);
  }
  if (!partial || body.spec !== undefined) {
    payload.spec = asJsonObject(body.spec, "spec");
  }
  if (!partial || body.detailBlocks !== undefined) {
    payload.detail_blocks = asJsonArray(body.detailBlocks, "detailBlocks");
  }
  if (!partial || body.documents !== undefined) {
    payload.documents = normalizeCatalogDocuments(body.documents);
  }
  if (!partial) {
    payload.supplier_ids = [];
  }

  return payload;
}

export function buildSkuPayload(
  body: Record<string, unknown>,
  options: { partial?: boolean } = {},
) {
  const partial = options.partial === true;
  const hasPrice = !partial || body.price !== undefined;
  const price = hasPrice ? Math.max(0, asNumber(body.price, 0)) : null;
  const originalPriceRaw = asNumber(body.originalPrice, NaN);
  const payload: Record<string, unknown> = {};

  if (!partial || body.labelTh !== undefined) {
    payload.label_th = asNonEmptyString(body.labelTh, "labelTh");
  }
  if (!partial || body.labelEn !== undefined) {
    payload.label_en = asNonEmptyString(body.labelEn, "labelEn");
  }
  if (hasPrice) {
    payload.price = price;
  }
  if (!partial || body.originalPrice !== undefined) {
    payload.original_price = Number.isFinite(originalPriceRaw)
      ? Math.max(hasPrice ? (price ?? 0) : 0, originalPriceRaw)
      : null;
  }
  if (!partial || body.discountPercent !== undefined) {
    payload.discount_percent = Math.max(
      0,
      Math.min(100, asNumber(body.discountPercent, 0)),
    );
  }

  if (!partial || body.skuCode !== undefined) {
    payload.sku_code = asNonEmptyString(body.skuCode, "skuCode");
  }

  if (!partial || body.currencyCode !== undefined) {
    payload.currency_code = asOptionalString(body.currencyCode) ?? "THB";
  }

  if (!partial || body.promoStartAt !== undefined) {
    payload.promo_start_at = asOptionalDateTime(
      body.promoStartAt,
      "promoStartAt",
    );
  }

  if (!partial || body.promoEndAt !== undefined) {
    payload.promo_end_at = asOptionalDateTime(body.promoEndAt, "promoEndAt");
  }

  if (!partial || body.pricingTiers !== undefined) {
    payload.pricing_tiers = asJsonArray(body.pricingTiers, "pricingTiers");
  }

  if (!partial || body.stock !== undefined) {
    payload.stock = Math.max(0, asNumber(body.stock, 0));
  }

  if (!partial || body.attributes !== undefined) {
    payload.attributes = asJsonObject(body.attributes, "attributes");
  }

  if (!partial || body.mediaGallery !== undefined) {
    const mediaGallery = normalizeCatalogMediaGallery(body.mediaGallery);
    payload.media_gallery = mediaGallery;
    payload.use_product_images =
      typeof body.useProductImages === "boolean"
        ? body.useProductImages
        : mediaGallery.length === 0;
  } else if (body.useProductImages !== undefined) {
    payload.use_product_images = asOptionalBoolean(body.useProductImages, true);
  }

  return payload;
}

export function buildSkuInventoryPayload(body: Record<string, unknown>) {
  const onHand = Math.max(0, asNumber(body.onHand, 0));
  const available = Math.max(0, asNumber(body.available, 0));
  const reserved = Math.max(0, asNumber(body.reserved, 0));

  if (available > onHand) {
    fail422("available cannot be greater than onHand");
  }

  if (reserved > onHand) {
    fail422("reserved cannot be greater than onHand");
  }

  if (available + reserved > onHand) {
    fail422("available plus reserved cannot be greater than onHand");
  }

  return {
    inventory_id: asNonEmptyString(body.inventoryId, "inventoryId"),
    branch_id: asNonEmptyString(body.branchId, "branchId"),
    branch_code: asOptionalString(body.branchCode),
    branch_name: asNonEmptyString(body.branchName, "branchName"),
    on_hand: onHand,
    available,
    reserved,
    incoming: Math.max(0, asNumber(body.incoming, 0)),
    safety_stock: Math.max(0, asNumber(body.safetyStock, 0)),
    notes: asOptionalString(body.notes),
  };
}

function extractMetricsRow(row: Record<string, unknown>) {
  if (Array.isArray(row.metrics)) {
    const first = row.metrics[0];
    return isRecord(first) ? first : {};
  }

  return isRecord(row.metrics) ? row.metrics : {};
}

export function mapAdminSkuInventoryItem(row: Record<string, unknown>) {
  const inventoryRef = isRecord(row.inventory)
    ? row.inventory
    : Array.isArray(row.inventory) && isRecord(row.inventory[0])
      ? (row.inventory[0] as Record<string, unknown>)
      : null;

  return {
    id: String(row.id ?? ""),
    productId: String(row.product_id ?? ""),
    skuId: String(row.sku_id ?? ""),
    inventoryKind: "sale",
    inventoryId: String(row.inventory_id ?? inventoryRef?.id ?? ""),
    inventoryName:
      typeof inventoryRef?.name === "string" ? inventoryRef.name : "",
    isDefaultInventory: inventoryRef?.is_default === true,
    branchId: String(row.branch_id ?? ""),
    branchCode: typeof row.branch_code === "string" ? row.branch_code : "",
    branchName: String(row.branch_name ?? ""),
    onHand: Number(row.on_hand ?? 0),
    available: Number(row.available ?? 0),
    reserved: Number(row.reserved ?? 0),
    incoming: Number(row.incoming ?? 0),
    safetyStock: Number(row.safety_stock ?? 0),
    notes: typeof row.notes === "string" ? row.notes : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export function mapAdminSkuItem(row: Record<string, unknown>) {
  const mediaGallery = Array.isArray(row.media_gallery)
    ? row.media_gallery
    : [];

  return {
    id: String(row.id ?? ""),
    productId: String(row.product_id ?? ""),
    skuCode: String(row.sku_code ?? ""),
    labelTh: String(row.label_th ?? ""),
    labelEn: String(row.label_en ?? ""),
    imageUrl: mediaGalleryPrimaryUrl(mediaGallery),
    imageUrls: mediaGalleryImageUrls(mediaGallery),
    mediaGallery,
    useProductImages: row.use_product_images !== false,
    attributes: isRecord(row.attributes) ? row.attributes : {},
    price: Number(row.price ?? 0),
    originalPrice:
      row.original_price == null ? null : Number(row.original_price ?? 0),
    discountPercent: Number(row.discount_percent ?? 0),
    currencyCode: String(row.currency_code ?? "THB"),
    promoStartAt:
      typeof row.promo_start_at === "string" ? row.promo_start_at : null,
    promoEndAt: typeof row.promo_end_at === "string" ? row.promo_end_at : null,
    pricingTiers: Array.isArray(row.pricing_tiers) ? row.pricing_tiers : [],
    stock: Number(row.stock ?? 0),
    inventory: (Array.isArray(row.inventory) ? row.inventory : [])
      .map((item) => mapAdminSkuInventoryItem(item as Record<string, unknown>))
      .sort((a, b) => {
        if (a.branchCode !== b.branchCode) {
          return a.branchCode.localeCompare(b.branchCode);
        }

        if (a.branchName !== b.branchName) {
          return a.branchName.localeCompare(b.branchName);
        }

        return a.id.localeCompare(b.id);
      }),
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export function mapAdminProductListItem(row: Record<string, unknown>) {
  const mediaGallery = Array.isArray(row.media_gallery)
    ? row.media_gallery
    : [];
  const metrics = extractMetricsRow(row);
  const skus = Array.isArray(row.skus) ? row.skus : [];
  const prices = skus
    .map((sku) =>
      isRecord(sku) ? Number((sku as Record<string, unknown>).price) : NaN,
    )
    .filter((price) => Number.isFinite(price));
  const originalPrices = skus
    .map((sku) =>
      isRecord(sku)
        ? Number((sku as Record<string, unknown>).original_price)
        : NaN,
    )
    .filter((price) => Number.isFinite(price));
  const currencyCode =
    skus
      .map((sku) =>
        isRecord(sku) ? (sku as Record<string, unknown>).currency_code : null,
      )
      .find((code) => typeof code === "string" && code.length > 0) ?? "THB";

  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    type: asProductType(row.type),
    nameTh: String(row.name_th ?? ""),
    nameEn: String(row.name_en ?? ""),
    mainCategoryKey: String(row.main_category_key ?? "others"),
    tagKeys: asStringArray(row.tag_keys),
    categoryKeys: asStringArray(row.category_keys),
    brand: typeof row.brand === "string" ? row.brand : "",
    thumbnailUrl: mediaGalleryPrimaryUrl(mediaGallery),
    imageUrls: mediaGalleryImageUrls(mediaGallery),
    mediaGallery,
    searchKeywords: asStringArray(row.search_keywords),
    isHidden: row.is_hidden === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
    skuCount: skus.length,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    maxOriginalPrice:
      originalPrices.length > 0 ? Math.max(...originalPrices) : null,
    currencyCode: String(currencyCode),
    viewCount: Number(metrics.view_count ?? 0),
    orderCount: Number(metrics.order_count ?? 0),
    rentalCount: Number(metrics.rental_count ?? 0),
    wishlistCount: Number(metrics.wishlist_count ?? 0),
    trendingScore: Number(metrics.trending_score ?? 0),
  };
}

export function mapAdminProductDetail(row: Record<string, unknown>) {
  const metrics = extractMetricsRow(row);

  return {
    ...mapAdminProductListItem(row),
    descriptionTh: String(row.description_th ?? ""),
    descriptionEn: String(row.description_en ?? ""),
    mediaLinks: Array.isArray(row.media_links) ? row.media_links : [],
    spec: isRecord(row.spec) ? row.spec : {},
    detailBlocks: Array.isArray(row.detail_blocks) ? row.detail_blocks : [],
    documents: Array.isArray(row.documents) ? row.documents : [],
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    addToCartCount: Number(metrics.add_to_cart_count ?? 0),
    avgRating: Number(metrics.avg_rating ?? 0),
    reviewCount: Number(metrics.review_count ?? 0),
    returnRate: Number(metrics.return_rate ?? 0),
    lastSoldAt:
      typeof metrics.last_sold_at === "string"
        ? metrics.last_sold_at
        : undefined,
    lastRentedAt:
      typeof metrics.last_rented_at === "string"
        ? metrics.last_rented_at
        : undefined,
    skus: (Array.isArray(row.skus) ? row.skus : []).map((sku) =>
      mapAdminSkuItem(sku as Record<string, unknown>),
    ),
  };
}
