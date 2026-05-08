export const ADMIN_POS_ASSET_SELECT =
  "id, code, slug, name_th, name_en, brand, thumbnail_url, currency_code, daily_rate, weekly_rate, monthly_rate, daily_enabled, weekly_enabled, monthly_enabled, deposit_amount, min_rental_days, max_rental_days, matches:asset_matches(product_id, sort_order)";

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
        labelTh: label,
        labelEn: row.code || nameEn || label,
        imageUrl: row.thumbnail_url,
        depositAmount: posMoney(row.deposit_amount),
        dailyRate: row.daily_enabled === false ? 0 : posMoney(row.daily_rate),
        weeklyRate: row.weekly_enabled === false ? 0 : posMoney(row.weekly_rate),
        monthlyRate:
          row.monthly_enabled === false ? 0 : posMoney(row.monthly_rate),
        rentalStock: 1,
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