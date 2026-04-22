import { createError } from "h3";

export const ADMIN_PRODUCT_LIST_SELECT =
  "id, slug, type, name_th, name_en, category_keys, brand, thumbnail_url, rental_min_days, rental_max_days, rental_buffer_days, store_location_ids, is_hidden, updated_at, skus:product_skus(id)";

export const ADMIN_PRODUCT_DETAIL_SELECT =
  "id, slug, type, name_th, name_en, description_th, description_en, category_keys, brand, thumbnail_url, rental_min_days, rental_max_days, rental_buffer_days, store_location_ids, is_hidden, created_at, updated_at, skus:product_skus(id, product_id, label_th, label_en, image_url, price, original_price, discount_percent, rental_deposit, rental_daily, rental_weekly, rental_monthly, stock, rental_stock, reserved_stock, created_at, updated_at)";

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

export function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

export function asProductType(value: unknown): "sale" | "rental" | "hybrid" {
  if (value === "sale" || value === "rental" || value === "hybrid") {
    return value;
  }

  fail422("type must be sale, rental, or hybrid");
}

export function buildProductPayload(body: Record<string, unknown>) {
  const categoryKeys = asStringArray(body.categoryKeys);
  if (categoryKeys.length === 0) {
    fail422("categoryKeys must include at least one value");
  }

  const payload = {
    slug: asNonEmptyString(body.slug, "slug"),
    type: asProductType(body.type),
    name_th: asNonEmptyString(body.nameTh, "nameTh"),
    name_en: asNonEmptyString(body.nameEn, "nameEn"),
    description_th: asNonEmptyString(body.descriptionTh, "descriptionTh"),
    description_en: asNonEmptyString(body.descriptionEn, "descriptionEn"),
    category_keys: categoryKeys,
    brand: asOptionalString(body.brand),
    thumbnail_url: asOptionalString(body.thumbnailUrl),
    image_urls: [],
    spec: {},
    documents: {},
    supplier_ids: [],
    rental_min_days: Math.max(1, asNumber(body.rentalMinDays, 1)),
    rental_max_days: Math.max(0, asNumber(body.rentalMaxDays, 0)),
    rental_buffer_days: Math.max(0, asNumber(body.rentalBufferDays, 0)),
    store_location_ids: asStringArray(body.storeLocationIds),
    is_hidden: body.isHidden === true,
  };

  if (
    payload.rental_max_days > 0 &&
    payload.rental_max_days < payload.rental_min_days
  ) {
    fail422("rentalMaxDays must be 0 or greater than rentalMinDays");
  }

  return payload;
}

export function buildSkuPayload(body: Record<string, unknown>) {
  const price = Math.max(0, asNumber(body.price, 0));
  const rentalStock = Math.max(0, asNumber(body.rentalStock, 0));
  const reservedStock = Math.max(0, asNumber(body.reservedStock, 0));
  const originalPriceRaw = asNumber(body.originalPrice, NaN);
  const originalPrice = Number.isFinite(originalPriceRaw)
    ? Math.max(price, originalPriceRaw)
    : null;

  if (reservedStock > rentalStock) {
    fail422("reservedStock cannot be greater than rentalStock");
  }

  return {
    label_th: asNonEmptyString(body.labelTh, "labelTh"),
    label_en: asNonEmptyString(body.labelEn, "labelEn"),
    image_url: asOptionalString(body.imageUrl),
    image_urls: [],
    attributes: {},
    price,
    original_price: originalPrice,
    discount_percent: Math.max(0, Math.min(100, asNumber(body.discountPercent, 0))),
    rental_deposit: Math.max(0, asNumber(body.rentalDeposit, 0)),
    rental_daily: Math.max(0, asNumber(body.rentalDaily, 0)),
    rental_weekly: Math.max(0, asNumber(body.rentalWeekly, 0)),
    rental_monthly: Math.max(0, asNumber(body.rentalMonthly, 0)),
    stock: Math.max(0, asNumber(body.stock, 0)),
    rental_stock: rentalStock,
    reserved_stock: reservedStock,
  };
}
