import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `${field} is required`,
    });
  }

  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const code = asNonEmptyString(body.code, "code");
  const slug = asNonEmptyString(body.slug, "slug");
  const nameTh = asNonEmptyString(body.nameTh, "nameTh");
  const nameEn = asNonEmptyString(body.nameEn, "nameEn");
  const descriptionTh = asNonEmptyString(body.descriptionTh, "descriptionTh");
  const descriptionEn = asNonEmptyString(body.descriptionEn, "descriptionEn");
  const status =
    body.status === "active" || body.status === "archived"
      ? body.status
      : "draft";

  const payload = {
    code,
    slug,
    status,
    name_th: nameTh,
    name_en: nameEn,
    description_th: descriptionTh,
    description_en: descriptionEn,
    category_keys: asStringArray(body.categoryKeys),
    brand:
      typeof body.brand === "string" && body.brand.trim().length > 0
        ? body.brand.trim()
        : null,
    thumbnail_url:
      typeof body.thumbnailUrl === "string" &&
      body.thumbnailUrl.trim().length > 0
        ? body.thumbnailUrl.trim()
        : null,
    image_urls: [],
    spec_summary: {},
    daily_rate: asNumber(body.dailyRate, 0),
    weekly_rate: 0,
    monthly_rate: 0,
    deposit_amount: asNumber(body.depositAmount, 0),
    min_rental_days: Math.max(1, asNumber(body.minRentalDays, 1)),
    max_rental_days: Math.max(0, asNumber(body.maxRentalDays, 0)),
    buffer_days: Math.max(0, asNumber(body.bufferDays, 0)),
    is_hidden: body.isHidden === true,
    sort_order: asNumber(body.sortOrder, 0),
    service_cycle_value: 0,
    service_cycle_unit: null,
  };

  if (
    payload.max_rental_days > 0 &&
    payload.max_rental_days < payload.min_rental_days
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "maxRentalDays must be 0 or greater than minRentalDays",
    });
  }

  const { data, error } = await adminClient
    .from("rental_accesses")
    .insert(payload)
    .select(
      "id, code, slug, status, name_th, name_en, category_keys, daily_rate, deposit_amount, min_rental_days, is_hidden, sort_order, updated_at",
    )
    .single();

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  return {
    item: {
      id: data.id,
      code: data.code,
      slug: data.slug,
      status: data.status,
      nameTh: data.name_th,
      nameEn: data.name_en,
      categoryKeys: Array.isArray(data.category_keys) ? data.category_keys : [],
      dailyRate: Number(data.daily_rate ?? 0),
      depositAmount: Number(data.deposit_amount ?? 0),
      minRentalDays: Number(data.min_rental_days ?? 1),
      isHidden: data.is_hidden === true,
      sortOrder: Number(data.sort_order ?? 0),
      updatedAt: data.updated_at,
      matchCount: 0,
    },
  };
});
