import { createError, defineEventHandler } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import { ADMIN_PRODUCT_LIST_SELECT } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);

  const { data, error } = await adminClient
    .from("products")
    .select(ADMIN_PRODUCT_LIST_SELECT)
    .order("updated_at", { ascending: false });

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    });
  }

  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      slug: row.slug,
      type: row.type,
      nameTh: row.name_th,
      nameEn: row.name_en,
      categoryKeys: Array.isArray(row.category_keys) ? row.category_keys : [],
      brand: row.brand ?? "",
      thumbnailUrl: row.thumbnail_url ?? "",
      rentalMinDays: Number(row.rental_min_days ?? 1),
      rentalMaxDays: Number(row.rental_max_days ?? 0),
      rentalBufferDays: Number(row.rental_buffer_days ?? 0),
      storeLocationIds: Array.isArray(row.store_location_ids)
        ? row.store_location_ids
        : [],
      isHidden: row.is_hidden === true,
      updatedAt: row.updated_at,
      skuCount: Array.isArray(row.skus) ? row.skus.length : 0,
    })),
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
