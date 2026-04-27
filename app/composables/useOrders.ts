import type {
  CreateOrderParams,
  OrderAddressSnapshot,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderRecord,
  OrderStatus,
} from "~/types/order";
import type { Address } from "~/types/user";

const ordersStore = ref<OrderRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const ORDER_STATUSES = [
  "submitted",
  "confirmed",
  "completed",
  "cancelled",
] as const;
const ORDER_PAYMENT_STATUSES = [
  "not_applicable",
  "pending_review",
  "awaiting_payment",
  "paid",
  "deferred",
  "cancelled",
  "refunded",
] as const;
const ORDER_FULFILLMENT_STATUSES = [
  "not_applicable",
  "unfulfilled",
  "preparing",
  "ready_for_carrier_pickup",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
] as const;

function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

function isOrderPaymentStatus(value: unknown): value is OrderPaymentStatus {
  return (
    typeof value === "string" &&
    (ORDER_PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}

function isOrderFulfillmentStatus(
  value: unknown,
): value is OrderFulfillmentStatus {
  return (
    typeof value === "string" &&
    (ORDER_FULFILLMENT_STATUSES as readonly string[]).includes(value)
  );
}

function mapAddressToSnapshot(address: Address): OrderAddressSnapshot {
  return {
    title: address.title,
    contactName: address.contactName,
    contactPhone: address.contactPhone,
    fullAddress: address.fullAddress,
    subDistrict: address.subDistrict,
    district: address.district,
    province: address.province,
    postalCode: address.postalCode,
    note: address.note,
  };
}

function deriveFallbackOrderStatus(row: Record<string, unknown>): OrderStatus {
  if (isOrderStatus(row.status)) {
    return row.status;
  }

  if (row.status === "confirmed") return "confirmed";
  if (row.status === "cancelled") return "cancelled";
  return "submitted";
}

function deriveFallbackPaymentStatus(
  row: Record<string, unknown>,
): OrderPaymentStatus {
  if (isOrderPaymentStatus(row.payment_status)) {
    return row.payment_status;
  }

  const checkoutMode = row.checkout_mode as
    | OrderRecord["checkoutMode"]
    | undefined;
  const paymentMethod = row.payment_method as
    | OrderRecord["paymentMethod"]
    | undefined;

  if (row.status === "cancelled") return "cancelled";
  if (checkoutMode === "quotation") return "not_applicable";
  if (row.status === "confirmed") {
    return paymentMethod === "company_credit" ? "deferred" : "paid";
  }
  if (row.status === "pending_review") return "pending_review";
  if (paymentMethod === "company_credit") return "pending_review";
  return "awaiting_payment";
}

function deriveFallbackFulfillmentStatus(
  row: Record<string, unknown>,
): OrderFulfillmentStatus {
  if (isOrderFulfillmentStatus(row.fulfillment_status)) {
    return row.fulfillment_status;
  }

  const checkoutMode = row.checkout_mode as
    | OrderRecord["checkoutMode"]
    | undefined;

  if (row.status === "cancelled") return "cancelled";
  if (checkoutMode === "quotation") return "not_applicable";
  if (row.status === "completed") return "delivered";
  return "unfulfilled";
}

function mapRowToOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: row.id as string,
    orderNumber: row.order_number as string,
    userId: row.user_id as string,
    companyId: (row.company_id as string) ?? null,
    cartId: (row.cart_id as string) ?? null,
    checkoutMode: row.checkout_mode as OrderRecord["checkoutMode"],
    paymentMethod: (row.payment_method as OrderRecord["paymentMethod"]) ?? null,
    status: deriveFallbackOrderStatus(row),
    paymentStatus: deriveFallbackPaymentStatus(row),
    fulfillmentStatus: deriveFallbackFulfillmentStatus(row),
    addressId: (row.address_id as string) ?? null,
    addressSnapshot:
      (row.address_snapshot as OrderAddressSnapshot) ??
      mapAddressToSnapshot({
        id: "",
        userId: null,
        companyId: null,
        title: "",
        contactName: null,
        contactPhone: null,
        isDefault: false,
        fullAddress: "",
        subDistrict: null,
        district: null,
        province: null,
        postalCode: null,
        latitude: null,
        longitude: null,
        note: null,
        createdAt: "",
        updatedAt: "",
      }),
    subtotal: Number(row.subtotal) || 0,
    discountTotal: Number(row.discount_total) || 0,
    shippingCost: Number(row.shipping_cost) || 0,
    shippingBreakdown:
      (row.shipping_breakdown as OrderRecord["shippingBreakdown"]) ?? {},
    grandTotal: Number(row.grand_total) || 0,
    currencyCode: (row.currency_code as string) ?? "THB",
    notes: (row.notes as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function upsertOrderInStore(order: OrderRecord): void {
  const index = ordersStore.value.findIndex((item) => item.id === order.id);
  if (index >= 0) {
    ordersStore.value.splice(index, 1, order);
    return;
  }
  ordersStore.value.unshift(order);
}

function deriveInitialOrderStatus(): OrderStatus {
  return "submitted";
}

function deriveInitialPaymentStatus(
  params: CreateOrderParams,
): OrderPaymentStatus {
  if (params.checkoutMode === "quotation") {
    return "not_applicable";
  }

  return params.paymentMethod === "company_credit"
    ? "pending_review"
    : "awaiting_payment";
}

function deriveInitialFulfillmentStatus(
  params: CreateOrderParams,
): OrderFulfillmentStatus {
  return params.checkoutMode === "quotation" ? "not_applicable" : "unfulfilled";
}

export function useOrders() {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();

  async function resolveUserId(): Promise<string | null> {
    if (user.value?.id) return user.value.id;
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    return authUser?.id ?? null;
  }

  async function resolveOrderCartId(
    userId: string,
    requestedCartId: string | null | undefined,
  ): Promise<string | null> {
    if (requestedCartId) {
      const { data: requestedCart, error: requestedCartError } = await supabase
        .from("carts")
        .select("id")
        .eq("id", requestedCartId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!requestedCartError && requestedCart?.id) {
        return requestedCart.id as string;
      }
    }

    const { data: ownedCart, error: ownedCartError } = await supabase
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (ownedCartError) {
      return null;
    }

    return (ownedCart?.id as string | undefined) ?? null;
  }

  async function fetchOrders(): Promise<void> {
    const userId = await resolveUserId();
    if (!userId) {
      ordersStore.value = [];
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      ordersStore.value = (data ?? []).map((row: Record<string, unknown>) =>
        mapRowToOrder(row),
      );
    } catch (fetchError) {
      error.value =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to fetch orders";
    } finally {
      loading.value = false;
    }
  }

  async function submitOrder(params: CreateOrderParams): Promise<OrderRecord> {
    const userId = await resolveUserId();
    if (!userId) {
      throw new Error("Authentication required to submit an order.");
    }

    if (params.items.length === 0) {
      throw new Error("At least one sale item is required to submit an order.");
    }

    const subtotal = params.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const discountTotal = params.items.reduce(
      (sum, item) =>
        sum +
        Math.max(0, item.originalUnitPrice - item.unitPrice) * item.quantity,
      0,
    );
    const shippingCost = Math.max(0, Number(params.shippingCost) || 0);
    const shippingBreakdown = params.shippingBreakdown ?? {};
    const grandTotal = subtotal + shippingCost;
    const resolvedCartId = await resolveOrderCartId(userId, params.cartId);

    const orderInsert = {
      user_id: userId,
      company_id: params.companyId ?? null,
      cart_id: resolvedCartId,
      checkout_mode: params.checkoutMode,
      payment_method:
        params.checkoutMode === "quotation"
          ? null
          : (params.paymentMethod ?? null),
      status: deriveInitialOrderStatus(),
      payment_status: deriveInitialPaymentStatus(params),
      fulfillment_status: deriveInitialFulfillmentStatus(params),
      address_id: params.address.id ? params.address.id : null,
      address_snapshot: mapAddressToSnapshot(params.address),
      subtotal,
      discount_total: discountTotal,
      shipping_cost: shippingCost,
      shipping_breakdown: shippingBreakdown,
      grand_total: grandTotal,
      currency_code: "THB",
      notes: params.notes ?? null,
    };

    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert(orderInsert)
      .select("*")
      .single();

    if (orderError) {
      throw new Error(orderError.message);
    }

    const order = mapRowToOrder(orderRow as Record<string, unknown>);
    const itemRows = params.items.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      sku_id: item.skuId,
      name: item.name,
      thumbnail: item.thumbnail,
      unit_price: item.unitPrice,
      original_unit_price: item.originalUnitPrice,
      discount_percent: item.discountPercent,
      quantity: item.quantity,
      line_total: item.unitPrice * item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemRows);

    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      throw new Error(itemsError.message);
    }

    upsertOrderInStore(order);
    return order;
  }

  if (import.meta.client) {
    watch(
      () => user.value?.id ?? null,
      (userId) => {
        if (!userId) {
          ordersStore.value = [];
        }
      },
    );
  }

  return {
    orders: computed(() => ordersStore.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    fetchOrders,
    submitOrder,
  };
}
