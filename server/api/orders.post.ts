import { createHash } from "node:crypto";
import { createError, defineEventHandler, readBody } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { calculateShipping } from "~~/app/utils/shipping";
import {
  asPaymentMethod,
  asPaymentNonEmptyString,
} from "~~/server/utils/payment-core";

type AnyRecord = Record<string, unknown>;

function requireRecord(value: unknown, label: string): AnyRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required`,
    });
  }
  return value as AnyRecord;
}

function addressSnapshot(address: AnyRecord) {
  return {
    title: String(address.title ?? ""),
    contactName: asPaymentNonEmptyString(address.contactName) ?? null,
    contactPhone: asPaymentNonEmptyString(address.contactPhone) ?? null,
    fullAddress: String(address.fullAddress ?? ""),
    subDistrict: asPaymentNonEmptyString(address.subDistrict) ?? null,
    district: asPaymentNonEmptyString(address.district) ?? null,
    province: asPaymentNonEmptyString(address.province) ?? null,
    postalCode: asPaymentNonEmptyString(address.postalCode) ?? null,
    note: asPaymentNonEmptyString(address.note) ?? null,
  };
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = (await readBody(event)) as AnyRecord;
  const idempotencyKey = asPaymentNonEmptyString(body.idempotencyKey);
  if (!idempotencyKey) {
    throw createError({
      statusCode: 400,
      statusMessage: "idempotencyKey is required",
    });
  }

  const adminClient = serverSupabaseServiceRole(event);
  const { data: existingKey } = await adminClient
    .from("order_idempotency_keys")
    .select("order_id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingKey?.order_id) {
    const { data: existingOrder } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", existingKey.order_id)
      .single();
    return { order: existingOrder, idempotent: true };
  }

  const checkoutMode =
    body.checkoutMode === "quotation" ? "quotation" : "payment";
  const paymentMethod =
    checkoutMode === "payment" ? asPaymentMethod(body.paymentMethod) : null;
  if (checkoutMode === "payment" && !paymentMethod) {
    throw createError({
      statusCode: 400,
      statusMessage: "Valid paymentMethod is required",
    });
  }

  const items = Array.isArray(body.items)
    ? body.items.map((item) => requireRecord(item, "item"))
    : [];
  if (items.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "At least one item is required",
    });
  }
  const skuIds = [
    ...new Set(
      items.map((item) => asPaymentNonEmptyString(item.skuId)).filter(Boolean),
    ),
  ];
  const { data: skuRows, error: skuError } = await adminClient
    .from("product_skus")
    .select(
      "id, product_id, label_th, label_en, price, original_price, currency_code, stock, products(name_th, name_en, media_gallery, shipping_size, is_hidden)",
    )
    .in("id", skuIds);
  if (skuError)
    throw createError({ statusCode: 500, statusMessage: skuError.message });
  const skuById = new Map(
    (skuRows ?? []).map((row: AnyRecord) => [String(row.id), row]),
  );

  const orderItems = items.map((item) => {
    const skuId = asPaymentNonEmptyString(item.skuId);
    const sku = skuId ? skuById.get(skuId) : null;
    if (!sku)
      throw createError({
        statusCode: 422,
        statusMessage: `SKU not found: ${skuId}`,
      });
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (quantity <= 0)
      throw createError({ statusCode: 422, statusMessage: "Invalid quantity" });
    if (Number(sku.stock) < quantity) {
      throw createError({
        statusCode: 409,
        statusMessage: `Insufficient stock for ${skuId}`,
      });
    }
    const product = requireRecord(sku.products, "product");
    if (product.is_hidden === true) {
      throw createError({
        statusCode: 422,
        statusMessage: `Product is not available: ${sku.product_id}`,
      });
    }
    const unitPrice = Number(sku.price) || 0;
    const originalUnitPrice = Math.max(
      unitPrice,
      Number(sku.original_price) || unitPrice,
    );
    return {
      order_id: "",
      product_id: String(sku.product_id),
      sku_id: String(sku.id),
      name: String(
        product.name_th ??
          product.name_en ??
          sku.label_th ??
          sku.label_en ??
          sku.id,
      ),
      thumbnail: null,
      unit_price: unitPrice,
      original_unit_price: originalUnitPrice,
      discount_percent:
        originalUnitPrice > 0
          ? Math.round(
              ((originalUnitPrice - unitPrice) / originalUnitPrice) * 100,
            )
          : 0,
      quantity,
      line_total: unitPrice * quantity,
      currency_code: String(sku.currency_code ?? "THB").toUpperCase(),
      shipping_size: product.shipping_size as string | null,
    };
  });

  const currencyCode = orderItems[0]?.currency_code ?? "THB";
  if (orderItems.some((item) => item.currency_code !== currencyCode)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Mixed currencies are not supported",
    });
  }
  const subtotal = orderItems.reduce((sum, item) => sum + item.line_total, 0);
  const discountTotal = orderItems.reduce(
    (sum, item) =>
      sum +
      Math.max(0, item.original_unit_price - item.unit_price) * item.quantity,
    0,
  );
  const shipping =
    body.shippingMode === "pickup"
      ? calculateShipping([])
      : calculateShipping(
          orderItems.map((item) => ({
            shippingSize: item.shipping_size as never,
            quantity: item.quantity,
          })),
        );
  const address = requireRecord(body.address, "address");

  const requestedCartId = asPaymentNonEmptyString(body.cartId);
  let resolvedCartId: string | null = null;
  if (requestedCartId) {
    const { data: requestedCart } = await adminClient
      .from("carts")
      .select("id")
      .eq("id", requestedCartId)
      .eq("user_id", userId)
      .maybeSingle();
    resolvedCartId = (requestedCart?.id as string | undefined) ?? null;
  }
  if (!resolvedCartId) {
    const { data: ownedCart } = await adminClient
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    resolvedCartId = (ownedCart?.id as string | undefined) ?? null;
  }

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .insert({
      user_id: userId,
      company_id: asPaymentNonEmptyString(body.companyId),
      cart_id: resolvedCartId,
      checkout_mode: checkoutMode,
      payment_method: paymentMethod,
      status: "submitted",
      payment_status:
        checkoutMode === "quotation" ? "not_applicable" : "awaiting_payment",
      fulfillment_status:
        checkoutMode === "quotation" ? "not_applicable" : "unfulfilled",
      address_id: asPaymentNonEmptyString(address.id),
      address_snapshot: addressSnapshot(address),
      subtotal,
      discount_total: discountTotal,
      shipping_cost: shipping.cost,
      shipping_breakdown: shipping.breakdown,
      grand_total: subtotal + shipping.cost,
      currency_code: currencyCode,
      notes: asPaymentNonEmptyString(body.notes),
    })
    .select("*")
    .single();
  if (orderError)
    throw createError({ statusCode: 500, statusMessage: orderError.message });

  const { error: itemsError } = await adminClient.from("order_items").insert(
    orderItems.map(({ currency_code, shipping_size, ...item }) => ({
      ...item,
      order_id: order.id,
    })),
  );
  if (itemsError) {
    await adminClient.from("orders").delete().eq("id", order.id);
    throw createError({ statusCode: 500, statusMessage: itemsError.message });
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  const { error: keyError } = await adminClient
    .from("order_idempotency_keys")
    .insert({
      user_id: userId,
      idempotency_key: idempotencyKey,
      order_id: order.id,
      request_hash: requestHash,
    });
  if (keyError?.code === "23505") {
    await adminClient.from("orders").delete().eq("id", order.id);
    const { data: existing } = await adminClient
      .from("order_idempotency_keys")
      .select("order_id")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .single();
    return { orderId: existing?.order_id, idempotent: true };
  }

  return { order, idempotent: false };
});
