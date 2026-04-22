import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PRODUCT_LIST_SELECT,
  asNonEmptyString,
  buildProductPayload,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const body = (await readBody(event)) as Record<string, unknown>;

  const id = asNonEmptyString(body.id, "id");
  const payload = {
    id,
    ...buildProductPayload(body),
  };

  const { data, error } = await adminClient
    .from("products")
    .insert(payload)
    .select(ADMIN_PRODUCT_LIST_SELECT)
    .single();

  if (error) {
    throw createError({
      statusCode: error.code === "23505" ? 409 : 500,
      statusMessage: error.message,
    });
  }

  return {
    item: {
      id: data.id,
      slug: data.slug,
      type: data.type,
      nameTh: data.name_th,
      nameEn: data.name_en,
      categoryKeys: Array.isArray(data.category_keys) ? data.category_keys : [],
      brand: data.brand ?? "",
      thumbnailUrl: data.thumbnail_url ?? "",
      rentalMinDays: Number(data.rental_min_days ?? 1),
      rentalMaxDays: Number(data.rental_max_days ?? 0),
      rentalBufferDays: Number(data.rental_buffer_days ?? 0),
      storeLocationIds: Array.isArray(data.store_location_ids)
        ? data.store_location_ids
        : [],
      isHidden: data.is_hidden === true,
      updatedAt: data.updated_at,
      skuCount: Array.isArray(data.skus) ? data.skus.length : 0,
    },
  };
});
