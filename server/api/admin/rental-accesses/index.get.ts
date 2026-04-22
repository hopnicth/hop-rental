import { createError, defineEventHandler } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);

  const { data, error } = await adminClient
    .from("rental_accesses")
    .select(
      "id, code, slug, status, name_th, name_en, category_keys, daily_rate, deposit_amount, min_rental_days, is_hidden, sort_order, updated_at, matches:rental_access_matches(product_id)",
    )
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  const items = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    slug: row.slug,
    status: row.status,
    nameTh: row.name_th,
    nameEn: row.name_en,
    categoryKeys: Array.isArray(row.category_keys) ? row.category_keys : [],
    dailyRate: Number(row.daily_rate ?? 0),
    depositAmount: Number(row.deposit_amount ?? 0),
    minRentalDays: Number(row.min_rental_days ?? 1),
    isHidden: row.is_hidden === true,
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: row.updated_at,
    matchCount: Array.isArray(row.matches) ? row.matches.length : 0,
  }));

  return {
    items,
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
