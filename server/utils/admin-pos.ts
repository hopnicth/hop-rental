export const ADMIN_POS_ASSET_SELECT =
  "id, code, slug, name_th, name_en, brand, thumbnail_url, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days, matches:asset_matches(product_id, sort_order)";

export const ADMIN_POS_SALE_SKU_SELECT =
  "id, product_id, sku_code, label_th, label_en, media_gallery, price, original_price, currency_code, stock, product:products(id, slug, type, name_th, name_en, brand, media_gallery, is_hidden)";

export interface AdminPosAssetMatchRow {
  product_id: string | null;
  sort_order?: number | null;
}

export interface AdminPosAssetRow {
  id: string;
  code: string | null;
  slug: string | null;
  name_th: string | null;
  name_en: string | null;
  brand: string | null;
  thumbnail_url: string | null;
  currency_code: string | null;
  daily_rate: number | string | null;
  weekly_rate: number | string | null;
  monthly_rate: number | string | null;
  daily_enabled: boolean | null;
  weekly_enabled: boolean | null;
  monthly_enabled: boolean | null;
  deposit_amount: number | string | null;
  min_rental_days: number | string | null;
  max_rental_days: number | string | null;
  matches?: AdminPosAssetMatchRow[] | null;
}

export interface AdminPosSaleProductRow {
  id: string;
  slug: string | null;
  type?: string | null;
  name_th: string | null;
  name_en: string | null;
  brand: string | null;
  media_gallery?: unknown[] | null;
  is_hidden: boolean | null;
}

export interface AdminPosSaleSkuRow {
  id: string;
  product_id: string;
  sku_code: string | null;
  label_th: string | null;
  label_en: string | null;
  media_gallery?: unknown[] | null;
  price: number | string | null;
  original_price: number | string | null;
  currency_code: string | null;
  stock: number | string | null;
  product?: AdminPosSaleProductRow | AdminPosSaleProductRow[] | null;
}

export function posMoney(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function posNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isRentablePosAsset(row: AdminPosAssetRow): boolean {
  return row.daily_enabled !== false && posMoney(row.daily_rate) > 0;
}

export function primaryMatchedProductId(row: AdminPosAssetRow): string | null {
  const matches = Array.isArray(row.matches) ? row.matches : [];
  return (
    [...matches]
      .sort((a, b) => posNumber(a.sort_order) - posNumber(b.sort_order))
      .map((match) => match.product_id)
      .find((id): id is string => typeof id === "string" && id.length > 0) ??
    null
  );
}

export function mapPosAssetCatalogItem(row: AdminPosAssetRow) {
  const nameTh = row.name_th ?? "";
  const nameEn = row.name_en ?? nameTh;
  const label = row.code || nameTh || nameEn || row.id;

  return {
    id: row.id,
    slug: row.slug ?? row.id,
    type: "rental" as const,
    nameTh,
    nameEn,
    brand: row.brand,
    thumbnailUrl: row.thumbnail_url,
    rentalMinDays: Math.max(1, posNumber(row.min_rental_days, 1)),
    rentalMaxDays: Math.max(0, posNumber(row.max_rental_days, 0)),
    skus: [
      {
        id: row.id,
        productId: row.id,
        code: row.code ?? row.id,
        labelTh: label,
        labelEn: row.code || nameEn || label,
        imageUrl: row.thumbnail_url,
        price: 0,
        depositAmount: posMoney(row.deposit_amount),
        dailyRate: row.daily_enabled === false ? 0 : posMoney(row.daily_rate),
        weeklyRate:
          row.weekly_enabled === false ? 0 : posMoney(row.weekly_rate),
        monthlyRate:
          row.monthly_enabled === false ? 0 : posMoney(row.monthly_rate),
        rentalStock: 1,
        reservedStock: 0,
      },
    ],
  };
}

function firstMediaUrl(value: unknown): string | null {
  const gallery = Array.isArray(value) ? value : [];
  for (const item of gallery) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.url === "string" && row.url.length > 0) return row.url;
    if (typeof row.src === "string" && row.src.length > 0) return row.src;
  }
  return null;
}

export function mapPosSaleCatalogItem(row: AdminPosSaleSkuRow) {
  const product = Array.isArray(row.product) ? row.product[0] : row.product;
  const productId = product?.id ?? row.product_id;
  const nameTh = product?.name_th ?? row.label_th ?? row.id;
  const nameEn = product?.name_en ?? row.label_en ?? nameTh;
  const imageUrl =
    firstMediaUrl(row.media_gallery) ?? firstMediaUrl(product?.media_gallery);
  const skuCode = row.sku_code || row.id;

  return {
    id: productId,
    slug: product?.slug ?? productId,
    type: "sale" as const,
    nameTh,
    nameEn,
    brand: product?.brand ?? null,
    thumbnailUrl: imageUrl,
    rentalMinDays: 0,
    rentalMaxDays: 0,
    skus: [
      {
        id: row.id,
        productId,
        code: skuCode,
        labelTh: row.label_th || skuCode,
        labelEn: row.label_en || row.label_th || skuCode,
        imageUrl,
        price: posMoney(row.price),
        depositAmount: 0,
        dailyRate: 0,
        weeklyRate: 0,
        monthlyRate: 0,
        rentalStock: Math.max(0, posNumber(row.stock, 0)),
        reservedStock: 0,
      },
    ],
  };
}

export function buildPosAssetSnapshot(row: AdminPosAssetRow) {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    nameTh: row.name_th ?? "",
    nameEn: row.name_en ?? row.name_th ?? "",
    brand: row.brand,
    thumbnailUrl: row.thumbnail_url,
    matchedProductId: primaryMatchedProductId(row),
    pricing: {
      currencyCode: row.currency_code ?? "THB",
      daily: row.daily_enabled === false ? 0 : posMoney(row.daily_rate),
      weekly: row.weekly_enabled === false ? 0 : posMoney(row.weekly_rate),
      monthly: row.monthly_enabled === false ? 0 : posMoney(row.monthly_rate),
      deposit: posMoney(row.deposit_amount),
    },
    rentalRules: {
      minDays: Math.max(1, posNumber(row.min_rental_days, 1)),
      maxDays: Math.max(0, posNumber(row.max_rental_days, 0)),
    },
  };
}
