import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  asNonEmptyString,
  buildSkuPayload,
} from "~~/server/utils/admin-catalog";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const productId = getRouterParam(event, "productId");

  if (!productId) {
    throw createError({
      statusCode: 400,
      statusMessage: "productId is required",
    });
  }

  const body = (await readBody(event)) as Record<string, unknown>;
  const id = asNonEmptyString(body.id, "id");

  const { data, error } = await adminClient
    .from("product_skus")
    .insert({
      id,
      product_id: productId,
      ...buildSkuPayload(body),
    })
    .select(
      "id, product_id, label_th, label_en, image_url, price, original_price, discount_percent, rental_deposit, rental_daily, rental_weekly, rental_monthly, stock, rental_stock, reserved_stock, created_at, updated_at",
    )
    .single();

  if (error) {
    const statusCode =
      error.code === "23505" ? 409 : error.code === "23503" ? 404 : 500;
    throw createError({
      statusCode,
      statusMessage: error.message,
    });
  }

  return {
    item: {
      id: data.id,
      productId: data.product_id,
      labelTh: data.label_th,
      labelEn: data.label_en,
      imageUrl: data.image_url ?? "",
      price: Number(data.price ?? 0),
      originalPrice:
        data.original_price == null ? null : Number(data.original_price ?? 0),
      discountPercent: Number(data.discount_percent ?? 0),
      rentalDeposit: Number(data.rental_deposit ?? 0),
      rentalDaily: Number(data.rental_daily ?? 0),
      rentalWeekly: Number(data.rental_weekly ?? 0),
      rentalMonthly: Number(data.rental_monthly ?? 0),
      stock: Number(data.stock ?? 0),
      rentalStock: Number(data.rental_stock ?? 0),
      reservedStock: Number(data.reserved_stock ?? 0),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
});
