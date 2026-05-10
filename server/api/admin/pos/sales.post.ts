import { createError, defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import type { OrderPaymentMethod } from "~~/app/types/order";

type AnyRecord = Record<string, unknown>;

interface PosSalePayload {
  userId?: string | null;
  walkInPhone?: string | null;
  customerName?: string | null;
  branchId?: string | null;
  paymentMethod?: OrderPaymentMethod | null;
  paidAmount?: number;
  notes?: string | null;
  items?: Array<{ skuId?: string; quantity?: number }>;
}

const PAYMENT_METHODS = new Set([
  "cash",
  "qr_transfer",
  "bank_transfer",
  "card",
  "other",
  "credit_card",
  "promptpay",
  "company_credit",
]);

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function asRow(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function firstMediaUrl(value: unknown): string | null {
  const gallery = Array.isArray(value) ? value : [];
  for (const item of gallery) {
    const row = asRow(item);
    if (typeof row.url === "string" && row.url) return row.url;
    if (typeof row.src === "string" && row.src) return row.src;
  }
  return null;
}

function isMissingInventoryKindColumn(error: unknown): boolean {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42703" ||
    /sku_branch_inventory\.inventory_kind|inventory_kind does not exist/i.test(
      err?.message ?? "",
    )
  );
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId: adminUserId } =
    await requirePlatformAdmin(event);
  const body = ((await readBody(event)) ?? {}) as PosSalePayload;

  const userId = asText(body.userId);
  const walkInPhone = asText(body.walkInPhone);
  const customerName = asText(body.customerName);
  const branchId = asText(body.branchId);
  const method = asText(body.paymentMethod);
  const paymentMethod = PAYMENT_METHODS.has(method)
    ? (method as OrderPaymentMethod)
    : null;
  const items = Array.isArray(body.items) ? body.items : [];

  if (!branchId) {
    throw createError({ statusCode: 422, statusMessage: "Branch is required" });
  }
  if (!paymentMethod) {
    throw createError({
      statusCode: 422,
      statusMessage: "Valid POS payment method is required",
    });
  }
  if (items.length === 0) {
    throw createError({ statusCode: 422, statusMessage: "Cart is empty" });
  }

  const { data: branch, error: branchError } = await adminClient
    .from("store_branches")
    .select("id, code, name_th, name_en, is_active")
    .eq("id", branchId)
    .eq("is_active", true)
    .single();
  if (branchError || !branch) {
    throw createError({
      statusCode: 422,
      statusMessage: "branchId must reference an active branch",
    });
  }

  if (walkInPhone) {
    const { error } = await adminClient.from("walk_in_customers").upsert(
      {
        phone: walkInPhone,
        full_name: customerName || null,
        linked_user_id: userId || null,
        updated_by_user_id: adminUserId,
        created_by_user_id: adminUserId,
      },
      { onConflict: "phone" },
    );
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const normalizedItems = items.map((item) => ({
    skuId: asText(item.skuId),
    quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
  }));
  if (normalizedItems.some((item) => !item.skuId || item.quantity <= 0)) {
    throw createError({ statusCode: 422, statusMessage: "Invalid cart item" });
  }

  const skuIds = [...new Set(normalizedItems.map((item) => item.skuId))];
  const { data: skuRows, error: skuError } = await adminClient
    .from("product_skus")
    .select(
      "id, product_id, label_th, label_en, sku_code, price, original_price, currency_code, stock, media_gallery, products(name_th, name_en, brand, media_gallery, is_hidden)",
    )
    .in("id", skuIds);
  if (skuError)
    throw createError({ statusCode: 500, statusMessage: skuError.message });

  const skuById = new Map(
    (skuRows ?? []).map((row: AnyRecord) => [String(row.id), row]),
  );
  let branchStockResult = await adminClient
    .from("sku_branch_inventory")
    .select("sku_id, available")
    .eq("branch_id", branchId)
    .in("inventory_kind", ["sale", "shared"])
    .in("sku_id", skuIds);
  if (
    branchStockResult.error &&
    isMissingInventoryKindColumn(branchStockResult.error)
  ) {
    branchStockResult = await adminClient
      .from("sku_branch_inventory")
      .select("sku_id, available")
      .eq("branch_id", branchId)
      .in("sku_id", skuIds);
  }
  const { data: branchStock, error: stockError } = branchStockResult;
  if (stockError)
    throw createError({ statusCode: 500, statusMessage: stockError.message });

  const availableBySku = new Map<string, number>();
  for (const row of (branchStock ?? []) as AnyRecord[]) {
    const skuId = String(row.sku_id ?? "");
    availableBySku.set(
      skuId,
      (availableBySku.get(skuId) ?? 0) + Number(row.available ?? 0),
    );
  }

  const orderItems = normalizedItems.map((item) => {
    const sku = skuById.get(item.skuId);
    if (!sku) {
      throw createError({
        statusCode: 422,
        statusMessage: `SKU not found: ${item.skuId}`,
      });
    }
    const available = availableBySku.get(item.skuId) ?? 0;
    if (available < item.quantity) {
      throw createError({
        statusCode: 409,
        statusMessage: `Insufficient branch stock for ${item.skuId}`,
      });
    }

    const product = asRow(
      Array.isArray(sku.products) ? sku.products[0] : sku.products,
    );
    if (product.is_hidden === true) {
      throw createError({
        statusCode: 422,
        statusMessage: `Product is hidden: ${sku.product_id}`,
      });
    }

    const unitPrice = money(sku.price);
    const originalUnitPrice = Math.max(unitPrice, money(sku.original_price));
    const name = String(
      product.name_th ?? product.name_en ?? sku.label_th ?? sku.id,
    );
    return {
      order_id: "",
      product_id: String(sku.product_id),
      sku_id: String(sku.id),
      name,
      thumbnail:
        firstMediaUrl(sku.media_gallery) ??
        firstMediaUrl(product.media_gallery),
      unit_price: unitPrice,
      original_unit_price: originalUnitPrice,
      discount_percent:
        originalUnitPrice > 0
          ? Math.round(
              ((originalUnitPrice - unitPrice) / originalUnitPrice) * 100,
            )
          : 0,
      quantity: item.quantity,
      line_total: unitPrice * item.quantity,
      currency_code: String(sku.currency_code ?? "THB").toUpperCase(),
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
  const paidAmount = money(body.paidAmount);
  const isPaid = paidAmount >= subtotal && subtotal > 0;
  const branchName = String(branch.name_th ?? branch.name_en ?? "");

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .insert({
      user_id: userId || null,
      walk_in_phone: userId ? null : walkInPhone || null,
      checkout_mode: "payment",
      payment_method: paymentMethod,
      status: isPaid ? "completed" : "confirmed",
      payment_status: isPaid ? "paid" : "pending_review",
      fulfillment_status: "delivered",
      address_id: null,
      address_snapshot: {
        title: `POS ${branchName}`,
        contactName: customerName || null,
        contactPhone: walkInPhone || null,
        fullAddress: branchName,
        note: "In-store POS sale",
      },
      subtotal,
      discount_total: orderItems.reduce(
        (sum, item) =>
          sum +
          Math.max(0, item.original_unit_price - item.unit_price) *
            item.quantity,
        0,
      ),
      shipping_cost: 0,
      shipping_breakdown: {},
      grand_total: subtotal,
      currency_code: currencyCode,
      notes: asText(body.notes) || null,
      pos_branch_id: String(branch.id),
      pos_branch_code: String(branch.code ?? ""),
      pos_branch_name: branchName,
      pos_paid_amount: paidAmount,
      pos_payment_method: paymentMethod,
      pos_staff_user_id: adminUserId,
    })
    .select("id, order_number, grand_total, currency_code, payment_status")
    .single();
  if (orderError || !order) {
    throw createError({
      statusCode: 500,
      statusMessage: orderError?.message ?? "Order create failed",
    });
  }

  const { error: itemsError } = await adminClient.from("order_items").insert(
    orderItems.map(({ currency_code, ...item }) => ({
      ...item,
      order_id: order.id,
    })),
  );
  if (itemsError) {
    await adminClient.from("orders").delete().eq("id", order.id);
    throw createError({ statusCode: 500, statusMessage: itemsError.message });
  }

  if (isPaid) {
    const { error: rpcError } = await adminClient.rpc(
      "f_apply_order_inventory",
      {
        p_order_id: order.id,
      },
    );
    if (rpcError) {
      await adminClient.from("orders").delete().eq("id", order.id);
      throw createError({ statusCode: 500, statusMessage: rpcError.message });
    }
  }

  return { order, appliedInventory: isPaid };
});
