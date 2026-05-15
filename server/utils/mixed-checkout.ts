import { createError, type H3Event } from "h3";
import { calculateShipping } from "~~/app/utils/shipping";
import {
  asPaymentMethod,
  asPaymentNonEmptyString,
  normalizeCurrency,
} from "~~/server/utils/payment-core";
import {
  createOmiseCardCharge,
  createOmisePromptPayCharge,
  type NormalizedGatewayCharge,
} from "~~/server/utils/omise";
import { applyMixedCheckoutGatewayResult } from "~~/server/utils/mixed-checkout-finalization";
import { computeBookingDepositLinesFromBooking } from "~~/server/utils/rental-booking-deposit-payment";
import { validateRentalBookingForConfirmation } from "~~/server/utils/rental-booking-confirmation";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

const TERMINAL_MIXED_CHECKOUT_SESSION_STATUSES = new Set([
  "finalized",
  "partial_finalized",
  "paid",
  "cancelled",
  "expired",
]);
const EXPIRABLE_MIXED_PAYMENT_ATTEMPT_STATUSES = new Set([
  "created",
  "pending",
  "requires_action",
]);

export type MixedCheckoutItemError = {
  itemType: "sale_item" | "rental_booking" | "shipping" | "checkout";
  itemId: string;
  cartLineId?: string | null;
  errorCode: string;
  message: string;
  suggestedAction: string;
  meta?: Record<string, unknown>;
};

export type MixedCheckoutAllocationPreview = {
  allocationType: "sale_product" | "shipping" | "booking_deposit";
  targetType: "order" | "order_line" | "shipping" | "rental_booking";
  targetId: string | null;
  amount: number;
  currencyCode: string;
  taxCategory: string;
  whtRate: number;
  whtAmount: number;
  metadata: AnyRecord;
};

type SaleLine = {
  skuId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  lineTotal: number;
  currencyCode: string;
  name: string;
  shippingSize: string | null;
  cartLineId?: string | null;
};

type RentalLine = {
  booking: AnyRecord;
  bookingDepositAmount: number;
  cartLineId?: string | null;
};

export type MixedCheckoutValidationOk = {
  ok: true;
  checkoutKind: "sale_only" | "rental_deposit_only" | "mixed";
  currencyCode: string;
  amountTotal: number;
  saleSubtotalAmount: number;
  shippingAmount: number;
  bookingDepositTotalAmount: number;
  saleLines: SaleLine[];
  rentalLines: RentalLine[];
  allocations: MixedCheckoutAllocationPreview[];
  shippingBreakdown: AnyRecord;
  validationSnapshot: AnyRecord;
};
export type MixedCheckoutValidationResult =
  | MixedCheckoutValidationOk
  | {
      ok: false;
      code: "MIXED_CHECKOUT_VALIDATION_FAILED";
      message: string;
      errors: MixedCheckoutItemError[];
    };

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}
function err(error: MixedCheckoutItemError): MixedCheckoutItemError {
  return error;
}
function itemId(value: unknown): string {
  return asPaymentNonEmptyString(value) ?? "";
}
function sameMoney(a: unknown, b: unknown): boolean {
  return Math.abs(money(a) - money(b)) <= 0.01;
}

export function isMixedCheckoutEnabled(config: unknown): boolean {
  return (config as AnyRecord | null)?.mixedCheckoutEnabled === true;
}

export function mixedCheckoutDisabledError(): never {
  throw createError({
    statusCode: 403,
    statusMessage: "MIXED_CHECKOUT_DISABLED",
  });
}

export function getMixedCheckoutUserId(
  user: { id?: string | null; sub?: string | null } | null | undefined,
): string | null {
  return (
    asPaymentNonEmptyString(user?.id) ?? asPaymentNonEmptyString(user?.sub)
  );
}

async function validateSaleItems(
  client: AnyClient,
  input: AnyRecord,
  errors: MixedCheckoutItemError[],
): Promise<SaleLine[]> {
  const rawItems = Array.isArray(input.saleItems)
    ? input.saleItems
    : Array.isArray(input.items)
      ? input.items
      : [];
  const saleItems = rawItems.filter(
    (v): v is AnyRecord =>
      typeof v === "object" && v !== null && !Array.isArray(v),
  );
  if (saleItems.length === 0) return [];
  const skuIds = [
    ...new Set(saleItems.map((i) => itemId(i.skuId)).filter(Boolean)),
  ];
  const { data, error } = await client
    .from("product_skus")
    .select(
      "id, product_id, label_th, label_en, price, original_price, currency_code, stock, products(name_th, name_en, media_gallery, shipping_size, is_hidden)",
    )
    .in("id", skuIds);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const bySku = new Map(
    (data ?? []).map((row: AnyRecord) => [String(row.id), row]),
  );
  const lines: SaleLine[] = [];
  for (const raw of saleItems) {
    const skuId = itemId(raw.skuId);
    const cartLineId = asPaymentNonEmptyString(raw.cartLineId);
    const sku = bySku.get(skuId);
    const quantity = Math.floor(Number(raw.quantity) || 0);
    if (!sku) {
      errors.push(
        err({
          itemType: "sale_item",
          itemId: skuId,
          cartLineId,
          errorCode: "SKU_NOT_FOUND",
          message: "SKU was not found.",
          suggestedAction: "remove_item",
        }),
      );
      continue;
    }
    const product =
      sku.products && typeof sku.products === "object"
        ? (sku.products as AnyRecord)
        : null;
    if (!product) {
      errors.push(
        err({
          itemType: "sale_item",
          itemId: skuId,
          cartLineId,
          errorCode: "PRODUCT_NOT_FOUND",
          message: "Product was not found.",
          suggestedAction: "remove_item",
        }),
      );
      continue;
    }
    if (product.is_hidden === true)
      errors.push(
        err({
          itemType: "sale_item",
          itemId: skuId,
          cartLineId,
          errorCode: "PRODUCT_INACTIVE",
          message: "Product is no longer available.",
          suggestedAction: "remove_item",
        }),
      );
    if (quantity <= 0)
      errors.push(
        err({
          itemType: "sale_item",
          itemId: skuId,
          cartLineId,
          errorCode: "INVALID_QUANTITY",
          message: "Quantity must be greater than zero.",
          suggestedAction: "remove_item",
        }),
      );
    if (Number(sku.stock) < quantity)
      errors.push(
        err({
          itemType: "sale_item",
          itemId: skuId,
          cartLineId,
          errorCode: "INSUFFICIENT_STOCK",
          message: "Stock is not enough for this item.",
          suggestedAction: "reduce_quantity",
          meta: {
            requestedQuantity: quantity,
            availableQuantity: Number(sku.stock) || 0,
          },
        }),
      );
    const expected = raw.expectedUnitPrice ?? raw.unitPrice;
    if (expected !== undefined && !sameMoney(expected, sku.price))
      errors.push(
        err({
          itemType: "sale_item",
          itemId: skuId,
          cartLineId,
          errorCode: "PRICE_CHANGED",
          message: "Item price has changed.",
          suggestedAction: "refresh_price",
          meta: {
            expectedUnitPrice: money(expected),
            currentUnitPrice: money(sku.price),
          },
        }),
      );
    if (
      errors.some(
        (e) =>
          e.itemType === "sale_item" &&
          e.itemId === skuId &&
          e.cartLineId === cartLineId,
      )
    )
      continue;
    const unitPrice = money(sku.price);
    const originalUnitPrice = Math.max(
      unitPrice,
      money(sku.original_price || unitPrice),
    );
    lines.push({
      skuId,
      productId: String(sku.product_id),
      quantity,
      unitPrice,
      originalUnitPrice,
      lineTotal: unitPrice * quantity,
      currencyCode: normalizeCurrency(sku.currency_code),
      name: String(
        product.name_th ??
          product.name_en ??
          sku.label_th ??
          sku.label_en ??
          skuId,
      ),
      shippingSize: asPaymentNonEmptyString(product.shipping_size),
      cartLineId,
    });
  }
  return lines;
}

async function validateShipping(
  client: AnyClient,
  userId: string,
  input: AnyRecord,
  saleLines: SaleLine[],
  errors: MixedCheckoutItemError[],
) {
  if (saleLines.length === 0) return { cost: 0, breakdown: {} };
  const mode = input.shippingMode === "pickup" ? "pickup" : "delivery";
  if (mode === "pickup") {
    const branchId = asPaymentNonEmptyString(input.pickupBranchId);
    if (!branchId)
      errors.push(
        err({
          itemType: "shipping",
          itemId: "pickup",
          errorCode: "PICKUP_BRANCH_INVALID",
          message: "Pickup branch is required.",
          suggestedAction: "select_pickup_branch",
        }),
      );
    else {
      const { data, error } = await client
        .from("store_branches")
        .select("id, is_active")
        .eq("id", branchId)
        .maybeSingle();
      if (error)
        throw createError({ statusCode: 500, statusMessage: error.message });
      if (!data || data.is_active !== true)
        errors.push(
          err({
            itemType: "shipping",
            itemId: branchId,
            errorCode: "PICKUP_BRANCH_INVALID",
            message: "Pickup branch is not available.",
            suggestedAction: "select_pickup_branch",
          }),
        );
    }
    return calculateShipping([]);
  }
  const address =
    input.address && typeof input.address === "object"
      ? (input.address as AnyRecord)
      : {};
  const addressId = asPaymentNonEmptyString(address.id);
  if (!addressId)
    errors.push(
      err({
        itemType: "shipping",
        itemId: "delivery",
        errorCode: "ADDRESS_INVALID",
        message: "Delivery address is required.",
        suggestedAction: "select_address",
      }),
    );
  else {
    const { data, error } = await client
      .from("addresses")
      .select("id, user_id, company_id")
      .eq("id", addressId)
      .maybeSingle();
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
    if (!data || String(data.user_id ?? "") !== userId || data.company_id)
      errors.push(
        err({
          itemType: "shipping",
          itemId: addressId,
          errorCode: "ADDRESS_INVALID",
          message: "Address is not available for this checkout.",
          suggestedAction: "select_address",
        }),
      );
  }
  return calculateShipping(
    saleLines.map((line) => ({
      shippingSize: line.shippingSize as never,
      quantity: line.quantity,
    })),
  );
}

async function validateRentalBookings(
  client: AnyClient,
  userId: string,
  input: AnyRecord,
  errors: MixedCheckoutItemError[],
): Promise<RentalLine[]> {
  const rawBookings = Array.isArray(input.rentalBookings)
    ? input.rentalBookings
    : [];
  const directIds = Array.isArray(input.rentalBookingIds)
    ? input.rentalBookingIds
    : [];
  const requested = [
    ...rawBookings.filter(
      (v): v is AnyRecord =>
        typeof v === "object" && v !== null && !Array.isArray(v),
    ),
    ...directIds.map((id) => ({ bookingId: id })),
  ];
  const bookingIds = [
    ...new Set(
      requested.map((b) => itemId(b.bookingId ?? b.id)).filter(Boolean),
    ),
  ];
  if (bookingIds.length === 0) return [];
  const { data, error } = await client
    .from("rental_bookings")
    .select(
      "id, user_id, status, asset_id, sku_id, start_date, end_date, rental_days, hub_id, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, currency_code, pricing_breakdown, booking_deposit_payment_status, booking_deposit_paid_amount, products(is_hidden)",
    )
    .in("id", bookingIds);
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const byId = new Map(
    (data ?? []).map((row: AnyRecord) => [String(row.id), row]),
  );
  const lines: RentalLine[] = [];
  for (const req of requested) {
    const bookingId = itemId(req.bookingId ?? req.id);
    const cartLineId = asPaymentNonEmptyString(req.cartLineId);
    const booking = byId.get(bookingId);
    if (!booking) {
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: "BOOKING_NOT_FOUND",
          message: "Rental booking was not found.",
          suggestedAction: "remove_item",
        }),
      );
      continue;
    }
    if (String(booking.user_id ?? "") !== userId) {
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: "BOOKING_ACCESS_DENIED",
          message: "Rental booking does not belong to this user.",
          suggestedAction: "remove_item",
        }),
      );
      continue;
    }
    if (String(booking.status ?? "") !== "draft")
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: "BOOKING_NOT_DRAFT",
          message: "Rental booking is no longer a draft.",
          suggestedAction: "remove_item",
        }),
      );
    const depositStatus = String(
      booking.booking_deposit_payment_status ?? "unpaid",
    );
    if (depositStatus !== "unpaid")
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: "BOOKING_DEPOSIT_ALREADY_PAID",
          message: "Booking Deposit is not unpaid for this booking.",
          suggestedAction: "remove_item",
        }),
      );
    if (!booking.hub_id)
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: "PICKUP_HUB_REQUIRED",
          message: "Pickup hub is required for this rental booking.",
          suggestedAction: "select_pickup_hub",
        }),
      );
    if (
      errors.some(
        (e) => e.itemType === "rental_booking" && e.itemId === bookingId,
      )
    )
      continue;
    try {
      await validateRentalBookingForConfirmation({
        adminClient: client,
        booking,
        userId,
      });
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : "Rental booking validation failed.";
      const statusMessage =
        typeof validationError === "object" && validationError
          ? String((validationError as AnyRecord).statusMessage ?? message)
          : message;
      const conflict =
        statusMessage.includes("RENTAL_BOOKING_CONFLICT") ||
        message.includes("RENTAL_BOOKING_CONFLICT");
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: conflict
            ? "RENTAL_AVAILABILITY_CONFLICT"
            : "RENTAL_BOOKING_INVALID",
          message: conflict
            ? "Another customer confirmed this rental period first."
            : statusMessage,
          suggestedAction: conflict ? "change_dates_or_remove" : "retry",
        }),
      );
      continue;
    }
    const { bookingDeposit } = computeBookingDepositLinesFromBooking({
      booking,
    });
    const expected = req.expectedBookingDepositAmount;
    if (
      expected !== undefined &&
      !sameMoney(expected, bookingDeposit.grossAmount)
    ) {
      errors.push(
        err({
          itemType: "rental_booking",
          itemId: bookingId,
          cartLineId,
          errorCode: "BOOKING_DEPOSIT_AMOUNT_CHANGED",
          message: "Booking Deposit amount has changed.",
          suggestedAction: "refresh_price",
          meta: {
            expectedAmount: money(expected),
            currentAmount: bookingDeposit.grossAmount,
          },
        }),
      );
      continue;
    }
    lines.push({
      booking,
      bookingDepositAmount: bookingDeposit.grossAmount,
      cartLineId,
    });
  }
  return lines;
}

export function buildMixedCheckoutAllocations(input: {
  saleLines: SaleLine[];
  rentalLines: RentalLine[];
  shippingAmount: number;
  currencyCode: string;
}): MixedCheckoutAllocationPreview[] {
  const allocations: MixedCheckoutAllocationPreview[] = [];
  for (const line of input.saleLines) {
    allocations.push({
      allocationType: "sale_product",
      targetType: "order_line",
      targetId: line.skuId,
      amount: line.lineTotal,
      currencyCode: input.currencyCode,
      taxCategory: "sale_revenue",
      whtRate: 0,
      whtAmount: 0,
      metadata: {
        skuId: line.skuId,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        cartLineId: line.cartLineId ?? null,
      },
    });
  }
  if (input.shippingAmount > 0)
    allocations.push({
      allocationType: "shipping",
      targetType: "shipping",
      targetId: null,
      amount: input.shippingAmount,
      currencyCode: input.currencyCode,
      taxCategory: "shipping_income",
      whtRate: 0,
      whtAmount: 0,
      metadata: {},
    });
  for (const line of input.rentalLines) {
    allocations.push({
      allocationType: "booking_deposit",
      targetType: "rental_booking",
      targetId: String(line.booking.id),
      amount: line.bookingDepositAmount,
      currencyCode: input.currencyCode,
      taxCategory: "partial_refundable_security_deposit",
      whtRate: 0,
      whtAmount: 0,
      metadata: {
        bookingId: String(line.booking.id),
        cartLineId: line.cartLineId ?? null,
        refundableSecurityDepositPart: true,
      },
    });
  }
  return allocations;
}

export async function prevalidateMixedCheckout(input: {
  client: AnyClient;
  userId: string;
  body: AnyRecord;
}): Promise<MixedCheckoutValidationResult> {
  const errors: MixedCheckoutItemError[] = [];
  const saleLines = await validateSaleItems(input.client, input.body, errors);
  const rentalLines = await validateRentalBookings(
    input.client,
    input.userId,
    input.body,
    errors,
  );
  if (saleLines.length === 0 && rentalLines.length === 0 && errors.length === 0)
    errors.push(
      err({
        itemType: "checkout",
        itemId: "cart",
        errorCode: "EMPTY_CHECKOUT",
        message: "No payable sale items or rental bookings were found.",
        suggestedAction: "remove_item",
      }),
    );
  const shipping = await validateShipping(
    input.client,
    input.userId,
    input.body,
    saleLines,
    errors,
  );
  const currencyCode =
    saleLines[0]?.currencyCode ??
    normalizeCurrency(rentalLines[0]?.booking.currency_code);
  for (const line of [
    ...saleLines.map((l) => l.currencyCode),
    ...rentalLines.map((l) => normalizeCurrency(l.booking.currency_code)),
  ]) {
    if (line !== currencyCode)
      errors.push(
        err({
          itemType: "checkout",
          itemId: "currency",
          errorCode: "MIXED_CURRENCIES_UNSUPPORTED",
          message: "Mixed currencies are not supported.",
          suggestedAction: "remove_item",
        }),
      );
  }
  if (errors.length > 0)
    return {
      ok: false,
      code: "MIXED_CHECKOUT_VALIDATION_FAILED",
      message: "Some cart items are no longer available for checkout.",
      errors,
    };
  const saleSubtotalAmount = money(
    saleLines.reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const shippingAmount = money(shipping.cost);
  const bookingDepositTotalAmount = money(
    rentalLines.reduce((sum, line) => sum + line.bookingDepositAmount, 0),
  );
  const allocations = buildMixedCheckoutAllocations({
    saleLines,
    rentalLines,
    shippingAmount,
    currencyCode,
  });
  const amountTotal = money(
    allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
  );
  const checkoutKind =
    saleLines.length > 0 && rentalLines.length > 0
      ? "mixed"
      : saleLines.length > 0
        ? "sale_only"
        : "rental_deposit_only";
  return {
    ok: true,
    checkoutKind,
    currencyCode,
    amountTotal,
    saleSubtotalAmount,
    shippingAmount,
    bookingDepositTotalAmount,
    saleLines,
    rentalLines,
    allocations,
    shippingBreakdown: shipping.breakdown as AnyRecord,
    validationSnapshot: {
      shippingMode: input.body.shippingMode ?? "delivery",
      saleItems: saleLines,
      rentalBookings: rentalLines.map((line) => ({
        bookingId: String(line.booking.id),
        bookingDepositAmount: line.bookingDepositAmount,
      })),
    },
  };
}

export function buildMixedPaymentReturnUri(
  event: H3Event,
  sessionId: string,
): string {
  const proto = event.node.req.headers["x-forwarded-proto"] ?? "http";
  const host =
    event.node.req.headers["x-forwarded-host"] ?? event.node.req.headers.host;
  return `${proto}://${host}/mixed-checkout/result?sessionId=${encodeURIComponent(sessionId)}`;
}

function addressSnapshot(input: AnyRecord): AnyRecord {
  const address =
    input.address && typeof input.address === "object"
      ? (input.address as AnyRecord)
      : {};
  return {
    title: String(address.title ?? "Mixed checkout"),
    contactName: asPaymentNonEmptyString(address.contactName),
    contactPhone: asPaymentNonEmptyString(address.contactPhone),
    fullAddress: String(address.fullAddress ?? ""),
    subDistrict: asPaymentNonEmptyString(address.subDistrict),
    district: asPaymentNonEmptyString(address.district),
    province: asPaymentNonEmptyString(address.province),
    postalCode: asPaymentNonEmptyString(address.postalCode),
    note: asPaymentNonEmptyString(address.note),
  };
}

async function createAwaitingPaymentOrder(input: {
  client: AnyClient;
  userId: string;
  cartId: string | null;
  body: AnyRecord;
  validation: MixedCheckoutValidationOk;
  sessionId: string;
}): Promise<AnyRecord | null> {
  if (input.validation.saleLines.length === 0) return null;
  const shippingMode =
    input.body.shippingMode === "pickup" ? "pickup" : "delivery";
  const addressId =
    shippingMode === "pickup"
      ? null
      : asPaymentNonEmptyString(
          (input.body.address as AnyRecord | undefined)?.id,
        );
  const pickupBranchId =
    shippingMode === "pickup"
      ? asPaymentNonEmptyString(input.body.pickupBranchId)
      : null;
  const { data: order, error } = await input.client
    .from("orders")
    .insert({
      user_id: input.userId,
      company_id: asPaymentNonEmptyString(input.body.companyId),
      cart_id: input.cartId,
      mixed_checkout_session_id: input.sessionId,
      checkout_mode: "payment",
      payment_method: asPaymentMethod(input.body.method) ?? "promptpay",
      status: "submitted",
      payment_status: "awaiting_payment",
      fulfillment_status: "unfulfilled",
      shipping_mode: shippingMode,
      pickup_branch_id: pickupBranchId,
      address_id: addressId,
      address_snapshot: addressSnapshot(input.body),
      subtotal: input.validation.saleSubtotalAmount,
      discount_total: input.validation.saleLines.reduce(
        (sum, line) =>
          sum +
          Math.max(0, line.originalUnitPrice - line.unitPrice) * line.quantity,
        0,
      ),
      shipping_cost: input.validation.shippingAmount,
      shipping_breakdown: input.validation.shippingBreakdown,
      grand_total:
        input.validation.saleSubtotalAmount + input.validation.shippingAmount,
      currency_code: input.validation.currencyCode,
      notes: asPaymentNonEmptyString(input.body.notes),
    })
    .select("*")
    .single();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  const { error: itemsError } = await input.client.from("order_items").insert(
    input.validation.saleLines.map((line) => ({
      order_id: order.id,
      product_id: line.productId,
      sku_id: line.skuId,
      name: line.name,
      thumbnail: null,
      unit_price: line.unitPrice,
      original_unit_price: line.originalUnitPrice,
      discount_percent:
        line.originalUnitPrice > 0
          ? Math.round(
              ((line.originalUnitPrice - line.unitPrice) /
                line.originalUnitPrice) *
                100,
            )
          : 0,
      quantity: line.quantity,
      line_total: line.lineTotal,
    })),
  );
  if (itemsError) {
    await input.client.from("orders").delete().eq("id", order.id);
    throw createError({ statusCode: 500, statusMessage: itemsError.message });
  }
  return order as AnyRecord;
}

async function normalizeMixedCheckoutCartId(input: {
  client: AnyClient;
  userId: string;
  body: AnyRecord;
}): Promise<string | null> {
  const cartId = asPaymentNonEmptyString(input.body.cartId);

  try {
    if (cartId) {
      const { data: cart, error } = await input.client
        .from("carts")
        .select("id,user_id")
        .eq("id", cartId)
        .maybeSingle();
      if (!error && cart && cart.user_id === input.userId) return cartId;
    }

    const { data: currentCart, error: currentCartError } = await input.client
      .from("carts")
      .select("id,user_id")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (currentCartError || !currentCart) return null;
    return asPaymentNonEmptyString(currentCart.id);
  } catch {
    return null;
  }
}

export function mapMixedPaymentAttemptResponse(attempt: AnyRecord) {
  return {
    paymentAttemptId: String(attempt.id),
    sessionId: String(attempt.mixed_checkout_session_id),
    method: attempt.method,
    status: attempt.status,
    amount: money(attempt.amount),
    currency: normalizeCurrency(attempt.currency_code),
    redirectUrl: attempt.gateway_authorize_uri ?? null,
    qrImageUrl: attempt.qr_image_url ?? null,
    expiresAt: attempt.expires_at ?? null,
  };
}

export async function createMixedCheckout(input: {
  client: AnyClient;
  event: H3Event;
  userId: string;
  body: AnyRecord;
  createCharge?: (args: {
    session: AnyRecord;
    attempt: AnyRecord;
    validation: MixedCheckoutValidationOk;
  }) => Promise<NormalizedGatewayCharge>;
}) {
  const validation = await prevalidateMixedCheckout({
    client: input.client,
    userId: input.userId,
    body: input.body,
  });
  if (!validation.ok) return validation;
  const idempotencyKey = asPaymentNonEmptyString(input.body.idempotencyKey);
  if (!idempotencyKey)
    throw createError({
      statusCode: 400,
      statusMessage: "idempotencyKey is required",
    });
  const method = asPaymentMethod(input.body.method) ?? "promptpay";
  const cardToken = asPaymentNonEmptyString(input.body.cardToken);
  if (validation.currencyCode === "THB" && validation.amountTotal < 20)
    throw createError({
      statusCode: 422,
      statusMessage: "AMOUNT_BELOW_MINIMUM",
    });

  const { data: existing } = await input.client
    .from("mixed_checkout_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return { ok: true, idempotent: true, session: existing };
  const normalizedCartId = await normalizeMixedCheckoutCartId({
    client: input.client,
    userId: input.userId,
    body: input.body,
  });
  const sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: session, error: sessionError } = await input.client
    .from("mixed_checkout_sessions")
    .insert({
      user_id: input.userId,
      cart_id: normalizedCartId,
      status: "validated",
      checkout_kind: validation.checkoutKind,
      currency_code: validation.currencyCode,
      amount_total: validation.amountTotal,
      sale_subtotal_amount: validation.saleSubtotalAmount,
      shipping_amount: validation.shippingAmount,
      booking_deposit_total_amount: validation.bookingDepositTotalAmount,
      idempotency_key: idempotencyKey,
      validation_snapshot: validation.validationSnapshot,
      allocation_plan_snapshot: { allocations: validation.allocations },
      expires_at: sessionExpiresAt,
    })
    .select("*")
    .single();
  if (sessionError)
    throw createError({ statusCode: 500, statusMessage: sessionError.message });

  const order = await createAwaitingPaymentOrder({
    client: input.client,
    userId: input.userId,
    cartId: normalizedCartId,
    body: input.body,
    validation,
    sessionId: String(session.id),
  });
  if (order)
    await input.client
      .from("mixed_checkout_sessions")
      .update({ sale_order_id: order.id })
      .eq("id", session.id);
  const { data: allocations, error: allocationError } = await input.client
    .from("mixed_payment_allocations")
    .insert(
      validation.allocations.map((allocation) => ({
        mixed_checkout_session_id: session.id,
        user_id: input.userId,
        allocation_type: allocation.allocationType,
        target_type: allocation.targetType,
        target_id: allocation.targetId,
        order_id:
          allocation.allocationType === "sale_product" ||
          allocation.allocationType === "shipping"
            ? (order?.id ?? null)
            : null,
        rental_booking_id:
          allocation.allocationType === "booking_deposit"
            ? allocation.targetId
            : null,
        amount: allocation.amount,
        currency_code: allocation.currencyCode,
        tax_category: allocation.taxCategory,
        wht_rate: allocation.whtRate,
        wht_amount: allocation.whtAmount,
        status: "planned",
        metadata: allocation.metadata,
      })),
    )
    .select("*");
  if (allocationError)
    throw createError({
      statusCode: 500,
      statusMessage: allocationError.message,
    });
  const attemptExpiresAt =
    method === "promptpay"
      ? new Date(Date.now() + 3 * 60 * 1000).toISOString()
      : null;
  const { data: attempt, error: attemptError } = await input.client
    .from("mixed_payment_attempts")
    .insert({
      mixed_checkout_session_id: session.id,
      user_id: input.userId,
      method,
      status: "created",
      amount: validation.amountTotal,
      currency_code: validation.currencyCode,
      idempotency_key: idempotencyKey,
      expires_at: attemptExpiresAt,
      metadata: { payment_context: "mixed_checkout" },
    })
    .select("*")
    .single();
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });
  await input.client
    .from("mixed_payment_allocations")
    .update({ mixed_payment_attempt_id: attempt.id, status: "payment_pending" })
    .eq("mixed_checkout_session_id", session.id);
  await input.client
    .from("mixed_checkout_sessions")
    .update({ status: "payment_created" })
    .eq("id", session.id);
  if (order)
    await input.client
      .from("orders")
      .update({ mixed_payment_attempt_id: attempt.id })
      .eq("id", order.id);

  if (method === "credit_card" && !cardToken) {
    return {
      ok: true,
      idempotent: false,
      session: {
        ...session,
        sale_order_id: order?.id ?? null,
        status: "payment_created",
      },
      order,
      allocations: allocations ?? [],
      attempt: mapMixedPaymentAttemptResponse(attempt),
    };
  }

  try {
    const metadata = {
      payment_context: "mixed_checkout",
      mixed_checkout_session_id: String(session.id),
      mixed_payment_attempt_id: String(attempt.id),
    };
    const charge = input.createCharge
      ? await input.createCharge({ session, attempt, validation })
      : method === "credit_card"
        ? await createOmiseCardCharge(input.event, {
            orderId: String(session.id),
            paymentAttemptId: String(attempt.id),
            amount: validation.amountTotal,
            currency: validation.currencyCode,
            cardToken: cardToken ?? "",
            returnUri: buildMixedPaymentReturnUri(
              input.event,
              String(session.id),
            ),
            metadata,
          })
        : await createOmisePromptPayCharge(input.event, {
            orderId: String(session.id),
            paymentAttemptId: String(attempt.id),
            amount: validation.amountTotal,
            currency: validation.currencyCode,
            expiresAt: attemptExpiresAt,
            returnUri: buildMixedPaymentReturnUri(
              input.event,
              String(session.id),
            ),
            metadata,
          });
    const { data: updatedAttempt, error: updateError } = await input.client
      .from("mixed_payment_attempts")
      .update({
        status: charge.status,
        gateway_charge_id: charge.gatewayChargeId,
        gateway_source_id: charge.gatewaySourceId,
        gateway_authorize_uri: charge.authorizeUri,
        qr_image_url: charge.qrImageUrl,
        expires_at: charge.expiresAt ?? attemptExpiresAt,
        failure_code: charge.failureCode,
        failure_message: charge.failureMessage,
        raw_gateway_response: charge.raw,
      })
      .eq("id", attempt.id)
      .select("*")
      .single();
    if (updateError)
      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      });
    if (charge.status === "paid") {
      await applyMixedCheckoutGatewayResult({
        client: input.client,
        session: {
          ...session,
          cart_id: normalizedCartId,
          sale_order_id: order?.id ?? null,
        },
        attempt: updatedAttempt,
        result: charge,
      });
    }
    const { data: latestAttempt } = await input.client
      .from("mixed_payment_attempts")
      .select("*")
      .eq("id", attempt.id)
      .maybeSingle();
    return {
      ok: true,
      idempotent: false,
      session: {
        ...session,
        sale_order_id: order?.id ?? null,
        status: "payment_created",
      },
      order,
      allocations: allocations ?? [],
      attempt: mapMixedPaymentAttemptResponse(latestAttempt ?? updatedAttempt),
    };
  } catch (gatewayError) {
    await input.client
      .from("mixed_payment_attempts")
      .update({
        status: "failed",
        failure_message:
          gatewayError instanceof Error
            ? gatewayError.message
            : "Gateway error",
      })
      .eq("id", attempt.id);
    await input.client
      .from("mixed_checkout_sessions")
      .update({ status: "failed" })
      .eq("id", session.id);
    await input.client
      .from("mixed_payment_allocations")
      .update({ status: "voided" })
      .eq("mixed_checkout_session_id", session.id);
    throw gatewayError;
  }
}

export async function expireMixedCheckoutIfNeeded(
  client: AnyClient,
  session: AnyRecord,
) {
  if (TERMINAL_MIXED_CHECKOUT_SESSION_STATUSES.has(String(session.status)))
    return session;
  const nowMs = Date.now();
  const sessionExpiresMs = new Date(String(session.expires_at)).getTime();
  const sessionExpired =
    !Number.isFinite(sessionExpiresMs) || sessionExpiresMs <= nowMs;
  const { data: attempts, error: attemptError } = await client
    .from("mixed_payment_attempts")
    .select("id, mixed_checkout_session_id, status, expires_at, created_at")
    .eq("mixed_checkout_session_id", session.id)
    .order("created_at", { ascending: false });
  if (attemptError)
    throw createError({ statusCode: 500, statusMessage: attemptError.message });

  const latestAttempt = ((attempts ?? []) as AnyRecord[])
    .filter(
      (attempt) =>
        EXPIRABLE_MIXED_PAYMENT_ATTEMPT_STATUSES.has(String(attempt.status)) ||
        String(attempt.status) === "expired",
    )
    .sort((a, b) => {
      const bMs = new Date(String(b.created_at)).getTime();
      const aMs = new Date(String(a.created_at)).getTime();
      return (
        (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
      );
    })[0];
  const attemptExpiresMs = latestAttempt?.expires_at
    ? new Date(String(latestAttempt.expires_at)).getTime()
    : Number.NaN;
  const latestAttemptExpired =
    String(latestAttempt?.status) === "expired" ||
    (Number.isFinite(attemptExpiresMs) && attemptExpiresMs <= nowMs);

  if (!sessionExpired && !latestAttemptExpired) return session;
  await client
    .from("mixed_checkout_sessions")
    .update({ status: "expired" })
    .eq("id", session.id);
  await client
    .from("mixed_payment_attempts")
    .update({ status: "expired" })
    .eq("mixed_checkout_session_id", session.id)
    .neq("status", "paid");
  await client
    .from("mixed_payment_allocations")
    .update({ status: "voided" })
    .eq("mixed_checkout_session_id", session.id)
    .eq("status", "payment_pending");
  if (session.sale_order_id)
    await client
      .from("orders")
      .update({
        status: "cancelled",
        payment_status: "cancelled",
        fulfillment_status: "cancelled",
      })
      .eq("id", session.sale_order_id)
      .neq("payment_status", "paid");
  return { ...session, status: "expired" };
}
