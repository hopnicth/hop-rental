import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdminReadAccess } from "~~/server/utils/admin";
import { ADMIN_PRODUCT_DETAIL_SELECT } from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient, adminMode, adminWarning } =
    await requirePlatformAdminReadAccess(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId is required",
    });
  }

  const { data, error } = await adminClient
    .from("products")
    .select(ADMIN_PRODUCT_DETAIL_SELECT)
    .eq("id", productId)
    .single();

  if (error || !data) {
    throw createError({
      statusCode: 404,
      statusMessage: error?.message ?? "Product not found",
    });
  }

  return {
    product: {
      id: data.id,
      slug: data.slug,
      type: data.type,
      nameTh: data.name_th,
      nameEn: data.name_en,
      descriptionTh: data.description_th,
      descriptionEn: data.description_en,
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
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      skus: (Array.isArray(data.skus) ? data.skus : []).map((sku) => ({
        id: sku.id,
        productId: sku.product_id,
        labelTh: sku.label_th,
        labelEn: sku.label_en,
        imageUrl: sku.image_url ?? "",
        price: Number(sku.price ?? 0),
        originalPrice:
          sku.original_price == null ? null : Number(sku.original_price ?? 0),
        discountPercent: Number(sku.discount_percent ?? 0),
        rentalDeposit: Number(sku.rental_deposit ?? 0),
        rentalDaily: Number(sku.rental_daily ?? 0),
        rentalWeekly: Number(sku.rental_weekly ?? 0),
        rentalMonthly: Number(sku.rental_monthly ?? 0),
        stock: Number(sku.stock ?? 0),
        rentalStock: Number(sku.rental_stock ?? 0),
        reservedStock: Number(sku.reserved_stock ?? 0),
        createdAt: sku.created_at,
        updatedAt: sku.updated_at,
      })),
    },
    meta: {
      adminMode,
      warning: adminWarning,
    },
  };
});
