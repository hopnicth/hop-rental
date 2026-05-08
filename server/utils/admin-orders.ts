import { getQuery, type H3Event } from "h3";
import type {
  AdminCustomerCard,
  AdminCustomerSummary,
  AdminOrderQueueView,
  AdminOrderFilterParams,
  AdminRentalBookingRow,
  AdminSaleOrderRow,
} from "~~/app/types/admin-order";
import type {
  AdminCustomerProfile,
  AdminPaymentAlert,
  AdminRentalBookingDetail,
  AdminSaleOrderDetail,
  AdminSaleOrderItem,
} from "~~/app/types/admin-order-detail";
import type {
  OrderAddressSnapshot,
  OrderCheckoutMode,
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from "~~/app/types/order";
import type {
  RentalBookingStatus,
  RentalPricingBreakdownRow,
} from "~~/app/types/rental-booking";
import type { ShippingBreakdown } from "~~/app/utils/shipping";

type AnyClient = {
  from: (table: string) => any;
};

export interface AdminUserProfileSummary {
  fullName: string | null;
  phone: string | null;
  kycStatus: AdminCustomerProfile["kycStatus"];
  idCardUrl: string | null;
}

export const ADMIN_ORDER_LIST_SELECT =
  "id, order_number, user_id, status, payment_status, fulfillment_status, checkout_mode, payment_method, grand_total, currency_code, address_snapshot, created_at, order_items(count)";

export const ADMIN_RENTAL_BOOKING_LIST_SELECT =
  "id, user_id, walk_in_phone, status, asset_id, asset_name, asset_thumbnail, product_name, thumbnail, hub_name, booker_name, booker_phone, start_date, end_date, rental_days, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_refund_status, currency_code, created_at, asset:assets(storage_branch_id, store_branches(id, code, name_th, name_en))";

const DEFAULT_PAGE_SIZE = 20;
const FETCH_OVERSAMPLE_CAP = 2000;

export function parseAdminOrderFilters(event: H3Event): {
  filters: AdminOrderFilterParams;
  page: number;
  pageSize: number;
} {
  const q = getQuery(event);

  function asString(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  function asArray<T extends string>(v: unknown): T[] | undefined {
    if (typeof v !== "string") return undefined;
    const parts = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? (parts as T[]) : undefined;
  }

  const filters: AdminOrderFilterParams = {
    search: asString(q.search),
    view:
      asString(q.view) === "action_required"
        ? "action_required"
        : ("all" satisfies AdminOrderQueueView),
    type: (asString(q.type) as "all" | "sale" | "rental" | undefined) ?? "all",
    orderStatus: asArray(q.orderStatus),
    paymentStatus: asArray(q.paymentStatus),
    fulfillmentStatus: asArray(q.fulfillmentStatus),
    rentalStatus: asArray(q.rentalStatus),
    dateFrom: asString(q.dateFrom),
    dateTo: asString(q.dateTo),
    branchId: asString(q.branchId),
  };

  const page = Math.max(0, Number(q.page ?? 0) || 0);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(q.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );

  return { filters, page, pageSize };
}

function asRow(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

export function mapAdminSaleOrderRow(row: unknown): AdminSaleOrderRow {
  const r = asRow(row);
  const snapshot = asRow(r.address_snapshot);
  const itemsAgg = Array.isArray(r.order_items) ? r.order_items[0] : null;
  const itemCount =
    itemsAgg && typeof itemsAgg === "object"
      ? Number((itemsAgg as Record<string, unknown>).count ?? 0)
      : 0;

  return {
    id: String(r.id ?? ""),
    orderNumber: String(r.order_number ?? ""),
    userId: String(r.user_id ?? ""),
    status: String(r.status ?? "submitted") as AdminSaleOrderRow["status"],
    paymentStatus: String(
      r.payment_status ?? "not_applicable",
    ) as AdminSaleOrderRow["paymentStatus"],
    fulfillmentStatus: String(
      r.fulfillment_status ?? "not_applicable",
    ) as AdminSaleOrderRow["fulfillmentStatus"],
    checkoutMode: String(
      r.checkout_mode ?? "payment",
    ) as AdminSaleOrderRow["checkoutMode"],
    paymentMethod: r.payment_method
      ? (String(r.payment_method) as AdminSaleOrderRow["paymentMethod"])
      : null,
    grandTotal: Number(r.grand_total ?? 0),
    currencyCode: String(r.currency_code ?? "THB"),
    itemCount,
    addressTitle:
      typeof snapshot.title === "string" && snapshot.title.length > 0
        ? snapshot.title
        : null,
    createdAt: String(r.created_at ?? ""),
  };
}

export function mapAdminRentalBookingRow(row: unknown): AdminRentalBookingRow {
  const r = asRow(row);
  const asset = asRow(r.asset);
  const branch = asRow(asset.store_branches);
  const branchId =
    typeof asset.storage_branch_id === "string"
      ? asset.storage_branch_id
      : null;
  const branchName =
    typeof branch.name_th === "string" && branch.name_th.length > 0
      ? branch.name_th
      : typeof branch.name_en === "string"
        ? branch.name_en
        : null;

  return {
    id: String(r.id ?? ""),
    userId: String(r.user_id ?? ""),
    walkInPhone: typeof r.walk_in_phone === "string" ? r.walk_in_phone : null,
    status: String(r.status ?? "draft") as AdminRentalBookingRow["status"],
    assetName: typeof r.asset_name === "string" ? r.asset_name : null,
    productName: String(r.product_name ?? ""),
    thumbnail:
      typeof r.asset_thumbnail === "string" && r.asset_thumbnail.length > 0
        ? r.asset_thumbnail
        : typeof r.thumbnail === "string"
          ? r.thumbnail
          : null,
    startDate: String(r.start_date ?? ""),
    endDate: String(r.end_date ?? ""),
    rentalDays: Number(r.rental_days ?? 0),
    rentalTotal: Number(r.rental_total ?? 0),
    depositAmount: Number(r.deposit_amount ?? 0),
    depositPaidAmount: Number(r.deposit_paid_amount ?? 0),
    depositPaymentMethod:
      typeof r.deposit_payment_method === "string"
        ? (r.deposit_payment_method as AdminRentalBookingRow["depositPaymentMethod"])
        : null,
    depositPaymentStatus: String(
      r.deposit_payment_status ?? "unpaid",
    ) as AdminRentalBookingRow["depositPaymentStatus"],
    depositRefundStatus: String(
      r.deposit_refund_status ?? "not_refunded",
    ) as AdminRentalBookingRow["depositRefundStatus"],
    currencyCode: String(r.currency_code ?? "THB"),
    storageBranchId: branchId,
    storageBranchName: branchName,
    hubName: typeof r.hub_name === "string" ? r.hub_name : null,
    bookerName: typeof r.booker_name === "string" ? r.booker_name : null,
    bookerPhone: typeof r.booker_phone === "string" ? r.booker_phone : null,
    createdAt: String(r.created_at ?? ""),
  };
}

export const ADMIN_ORDERS_FETCH_CAP = FETCH_OVERSAMPLE_CAP;
export const ADMIN_ORDERS_DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * UUID v4 shape (8-4-4-4-12 hex). Used to route UUID-shaped search terms
 * straight to `user_id.eq` instead of dragging them through ilike clauses
 * (which break when the value starts with `%xx` and PostgREST interprets it
 * as URL percent-encoding).
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export async function resolveSearchUserIds(
  adminClient: AnyClient,
  search: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const trimmed = search.trim();

  // PostgREST URL-decodes `%xx` inside filter values, so wrap with `*`
  // (the documented ILIKE wildcard) and strip raw `%`/`_` from the input.
  const term = `*${trimmed.replace(/[%_*]/g, "")}*`;

  const { data } = await adminClient
    .from("users")
    .select("id")
    .or(`full_name.ilike.${term},phone.ilike.${term}`)
    .limit(200);

  for (const r of (data ?? []) as Array<{ id?: string }>) {
    if (typeof r.id === "string") ids.add(r.id);
  }

  if (isUuid(trimmed)) ids.add(trimmed);

  return ids;
}

/**
 * Customer email lookup is intentionally a no-op for now: emails live on
 * `auth.users` which is not exposed via PostgREST, and `auth.admin.listUsers`
 * is not reliably wired through `@nuxtjs/supabase`'s service-role client.
 * The customer card already shows full_name + phone from `public.users`.
 */
export async function fetchAdminEmailMap(
  _adminClient: AnyClient,
): Promise<Map<string, string>> {
  return new Map<string, string>();
}

export async function fetchAdminSaleOrders(
  adminClient: AnyClient,
  filters: AdminOrderFilterParams,
  searchUserIds: Set<string> | null,
): Promise<AdminSaleOrderRow[]> {
  let q = adminClient
    .from("orders")
    .select(ADMIN_ORDER_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(FETCH_OVERSAMPLE_CAP);

  if (filters.orderStatus?.length) q = q.in("status", filters.orderStatus);
  if (filters.paymentStatus?.length)
    q = q.in("payment_status", filters.paymentStatus);
  if (filters.fulfillmentStatus?.length)
    q = q.in("fulfillment_status", filters.fulfillmentStatus);
  if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59`);

  if (filters.search) {
    const trimmed = filters.search.trim();
    const userIdList = searchUserIds ? Array.from(searchUserIds) : [];
    if (isUuid(trimmed)) {
      // UUID-shaped term: match exactly on order id or any resolved user id.
      const ids = Array.from(new Set([trimmed, ...userIdList]));
      q = q.or(`id.in.(${ids.join(",")}),user_id.in.(${ids.join(",")})`);
    } else {
      const term = `*${trimmed.replace(/[%_*]/g, "")}*`;
      const userClause =
        userIdList.length > 0 ? `,user_id.in.(${userIdList.join(",")})` : "";
      q = q.or(`order_number.ilike.${term}${userClause}`);
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: unknown) => mapAdminSaleOrderRow(row));
}

export async function fetchAdminRentalBookings(
  adminClient: AnyClient,
  filters: AdminOrderFilterParams,
  searchUserIds: Set<string> | null,
): Promise<AdminRentalBookingRow[]> {
  let q = adminClient
    .from("rental_bookings")
    .select(ADMIN_RENTAL_BOOKING_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(FETCH_OVERSAMPLE_CAP);

  if (filters.rentalStatus?.length) q = q.in("status", filters.rentalStatus);
  if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59`);

  if (filters.search) {
    const trimmed = filters.search.trim();
    const userIdList = searchUserIds ? Array.from(searchUserIds) : [];
    if (isUuid(trimmed)) {
      const ids = Array.from(new Set([trimmed, ...userIdList]));
      q = q.or(`id.in.(${ids.join(",")}),user_id.in.(${ids.join(",")})`);
    } else {
      const term = `*${trimmed.replace(/[%_*]/g, "")}*`;
      const userClause =
        userIdList.length > 0 ? `,user_id.in.(${userIdList.join(",")})` : "";
      q = q.or(
        `asset_name.ilike.${term},product_name.ilike.${term},booker_phone.ilike.${term}${userClause}`,
      );
    }
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).map((row: unknown) =>
    mapAdminRentalBookingRow(row),
  );

  if (filters.branchId) {
    return rows.filter((r) => r.storageBranchId === filters.branchId);
  }
  return rows;
}

export function isAdminSaleOrderActionRequired(
  order: Pick<
    AdminSaleOrderRow,
    "status" | "paymentStatus" | "fulfillmentStatus"
  >,
): boolean {
  return (
    order.status !== "completed" &&
    order.status !== "cancelled" &&
    (order.paymentStatus === "paid" || order.paymentStatus === "deferred") &&
    (order.fulfillmentStatus === "unfulfilled" ||
      order.fulfillmentStatus === "preparing")
  );
}

export function isAdminRentalBookingActionRequired(
  booking: Pick<AdminRentalBookingRow, "status">,
): boolean {
  return booking.status === "confirmed" || booking.status === "picked_up";
}

export function countAdminActionRequiredItems(
  saleOrders: AdminSaleOrderRow[],
  rentalBookings: AdminRentalBookingRow[],
): number {
  return (
    saleOrders.filter(isAdminSaleOrderActionRequired).length +
    rentalBookings.filter(isAdminRentalBookingActionRequired).length
  );
}

export function filterAdminActionRequiredRows(
  saleOrders: AdminSaleOrderRow[],
  rentalBookings: AdminRentalBookingRow[],
) {
  return {
    saleOrders: saleOrders.filter(isAdminSaleOrderActionRequired),
    rentalBookings: rentalBookings.filter(isAdminRentalBookingActionRequired),
  };
}

export async function fetchAdminUserProfiles(
  adminClient: AnyClient,
  userIds: string[],
): Promise<Map<string, AdminUserProfileSummary>> {
  const map = new Map<string, AdminUserProfileSummary>();
  if (userIds.length === 0) return map;

  const { data, error } = await adminClient
    .from("users")
    .select("id, full_name, phone, kyc_status, id_card_url")
    .in("id", userIds);

  if (error) throw error;

  for (const r of (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    phone: string | null;
    kyc_status?: AdminCustomerProfile["kycStatus"];
    id_card_url?: string | null;
  }>) {
    map.set(r.id, {
      fullName: r.full_name ?? null,
      phone: r.phone ?? null,
      kycStatus: r.kyc_status ?? null,
      idCardUrl: r.id_card_url ?? null,
    });
  }
  return map;
}

export function groupCustomerCards(
  saleOrders: AdminSaleOrderRow[],
  rentalBookings: AdminRentalBookingRow[],
  profiles: Map<string, AdminUserProfileSummary>,
  emails: Map<string, string>,
): AdminCustomerCard[] {
  const byUser = new Map<string, AdminCustomerCard>();

  function ensure(userId: string): AdminCustomerCard {
    let card = byUser.get(userId);
    if (card) return card;
    const profile = profiles.get(userId);
    const summary: AdminCustomerSummary = {
      userId,
      fullName: profile?.fullName ?? null,
      phone: profile?.phone ?? null,
      email: emails.get(userId) ?? null,
      saleCount: 0,
      rentalCount: 0,
      latestActivityAt: "",
      totalSaleAmount: 0,
      totalRentalAmount: 0,
      currencyCode: "THB",
    };
    card = { customer: summary, saleOrders: [], rentalBookings: [] };
    byUser.set(userId, card);
    return card;
  }

  for (const o of saleOrders) {
    const card = ensure(o.userId);
    card.saleOrders.push(o);
    card.customer.saleCount += 1;
    card.customer.totalSaleAmount += o.grandTotal;
    if (o.createdAt > card.customer.latestActivityAt) {
      card.customer.latestActivityAt = o.createdAt;
    }
    card.customer.currencyCode = o.currencyCode || card.customer.currencyCode;
  }

  for (const b of rentalBookings) {
    const card = ensure(b.userId);
    card.rentalBookings.push(b);
    card.customer.rentalCount += 1;
    card.customer.totalRentalAmount += b.rentalTotal;
    if (b.createdAt > card.customer.latestActivityAt) {
      card.customer.latestActivityAt = b.createdAt;
    }
    card.customer.currencyCode = b.currencyCode || card.customer.currencyCode;
  }

  return Array.from(byUser.values()).sort((a, b) =>
    a.customer.latestActivityAt < b.customer.latestActivityAt ? 1 : -1,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// P5.2 — DETAIL VIEW (sale orders + rental bookings)
// ─────────────────────────────────────────────────────────────────────────────

export const ADMIN_ORDER_DETAIL_SELECT =
  "id, order_number, user_id, company_id, cart_id, checkout_mode, payment_method, status, payment_status, fulfillment_status, address_id, address_snapshot, subtotal, discount_total, shipping_cost, shipping_breakdown, grand_total, currency_code, notes, tracking_carrier, tracking_number, tracking_note, shipped_at, created_at, updated_at";

export const ADMIN_ORDER_ITEMS_SELECT =
  "id, product_id, sku_id, name, thumbnail, unit_price, original_unit_price, discount_percent, quantity, line_total";

export const ADMIN_RENTAL_BOOKING_DETAIL_SELECT =
  "id, user_id, walk_in_phone, status, asset_id, asset_code, asset_name, asset_thumbnail, asset_snapshot, product_id, sku_id, product_name, matched_product_id, matched_product_name, thumbnail, hub_id, hub_name, start_date, end_date, rental_days, pricing_model, currency_code, daily_rate, weekly_rate, monthly_rate, rental_total, deposit_amount, deposit_paid_amount, deposit_payment_method, deposit_payment_status, deposit_refund_status, pricing_breakdown, booker_name, booker_phone, created_at, updated_at, asset:assets(storage_branch_id, store_branches(id, code, name_th, name_en))";

const EMPTY_ADDRESS_SNAPSHOT: OrderAddressSnapshot = {
  title: "",
  contactName: null,
  contactPhone: null,
  fullAddress: "",
  subDistrict: null,
  district: null,
  province: null,
  postalCode: null,
  note: null,
};

function toAddressSnapshot(value: unknown): OrderAddressSnapshot {
  const r = asRow(value);
  return {
    title: typeof r.title === "string" ? r.title : "",
    contactName: typeof r.contactName === "string" ? r.contactName : null,
    contactPhone: typeof r.contactPhone === "string" ? r.contactPhone : null,
    fullAddress: typeof r.fullAddress === "string" ? r.fullAddress : "",
    subDistrict: typeof r.subDistrict === "string" ? r.subDistrict : null,
    district: typeof r.district === "string" ? r.district : null,
    province: typeof r.province === "string" ? r.province : null,
    postalCode: typeof r.postalCode === "string" ? r.postalCode : null,
    note: typeof r.note === "string" ? r.note : null,
  };
}

export function mapAdminSaleOrderItem(row: unknown): AdminSaleOrderItem {
  const r = asRow(row);
  return {
    id: String(r.id ?? ""),
    productId: String(r.product_id ?? ""),
    skuId: String(r.sku_id ?? ""),
    name: String(r.name ?? ""),
    thumbnail:
      typeof r.thumbnail === "string" && r.thumbnail.length > 0
        ? r.thumbnail
        : null,
    unitPrice: Number(r.unit_price ?? 0),
    originalUnitPrice:
      r.original_unit_price === null || r.original_unit_price === undefined
        ? null
        : Number(r.original_unit_price),
    discountPercent: Number(r.discount_percent ?? 0),
    quantity: Number(r.quantity ?? 0),
    lineTotal: Number(r.line_total ?? 0),
  };
}

export function mapAdminSaleOrderDetail(
  row: unknown,
  items: AdminSaleOrderItem[],
  customer: AdminCustomerProfile,
  alerts: AdminPaymentAlert[] = [],
): AdminSaleOrderDetail {
  const r = asRow(row);
  const snapshot =
    r.address_snapshot && typeof r.address_snapshot === "object"
      ? toAddressSnapshot(r.address_snapshot)
      : EMPTY_ADDRESS_SNAPSHOT;
  const shippingBreakdown =
    r.shipping_breakdown && typeof r.shipping_breakdown === "object"
      ? (r.shipping_breakdown as ShippingBreakdown | Record<string, never>)
      : {};

  return {
    id: String(r.id ?? ""),
    orderNumber: String(r.order_number ?? ""),
    userId: String(r.user_id ?? ""),
    companyId: typeof r.company_id === "string" ? r.company_id : null,
    cartId: typeof r.cart_id === "string" ? r.cart_id : null,
    checkoutMode: String(r.checkout_mode ?? "payment") as OrderCheckoutMode,
    paymentMethod: r.payment_method
      ? (String(r.payment_method) as OrderPaymentMethod)
      : null,
    status: String(r.status ?? "submitted") as OrderStatus,
    paymentStatus: String(
      r.payment_status ?? "not_applicable",
    ) as OrderPaymentStatus,
    fulfillmentStatus: String(
      r.fulfillment_status ?? "not_applicable",
    ) as OrderFulfillmentStatus,
    addressId: typeof r.address_id === "string" ? r.address_id : null,
    addressSnapshot: snapshot,
    subtotal: Number(r.subtotal ?? 0),
    discountTotal: Number(r.discount_total ?? 0),
    shippingCost: Number(r.shipping_cost ?? 0),
    shippingBreakdown,
    grandTotal: Number(r.grand_total ?? 0),
    currencyCode: String(r.currency_code ?? "THB"),
    notes: typeof r.notes === "string" ? r.notes : null,
    trackingCarrier:
      typeof r.tracking_carrier === "string" ? r.tracking_carrier : null,
    trackingNumber:
      typeof r.tracking_number === "string" ? r.tracking_number : null,
    trackingNote: typeof r.tracking_note === "string" ? r.tracking_note : null,
    shippedAt: typeof r.shipped_at === "string" ? r.shipped_at : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    items,
    customer,
    alerts,
  };
}

export function mapAdminRentalBookingDetail(
  row: unknown,
  customer: AdminCustomerProfile,
): AdminRentalBookingDetail {
  const r = asRow(row);
  const asset = asRow(r.asset);
  const branch = asRow(asset.store_branches);
  const branchId =
    typeof asset.storage_branch_id === "string"
      ? asset.storage_branch_id
      : null;
  const branchName =
    typeof branch.name_th === "string" && branch.name_th.length > 0
      ? branch.name_th
      : typeof branch.name_en === "string"
        ? branch.name_en
        : null;
  const pricingBreakdown =
    r.pricing_breakdown && typeof r.pricing_breakdown === "object"
      ? (r.pricing_breakdown as
          | RentalPricingBreakdownRow
          | Record<string, never>)
      : {};

  return {
    id: String(r.id ?? ""),
    userId: String(r.user_id ?? ""),
    walkInPhone: typeof r.walk_in_phone === "string" ? r.walk_in_phone : null,
    status: String(r.status ?? "draft") as RentalBookingStatus,
    assetId: typeof r.asset_id === "string" ? r.asset_id : null,
    assetCode: typeof r.asset_code === "string" ? r.asset_code : null,
    assetName: typeof r.asset_name === "string" ? r.asset_name : null,
    assetThumbnail:
      typeof r.asset_thumbnail === "string" && r.asset_thumbnail.length > 0
        ? r.asset_thumbnail
        : null,
    productId: typeof r.product_id === "string" ? r.product_id : null,
    skuId: typeof r.sku_id === "string" ? r.sku_id : null,
    productName: String(r.product_name ?? ""),
    matchedProductId:
      typeof r.matched_product_id === "string" ? r.matched_product_id : null,
    matchedProductName:
      typeof r.matched_product_name === "string"
        ? r.matched_product_name
        : null,
    thumbnail:
      typeof r.thumbnail === "string" && r.thumbnail.length > 0
        ? r.thumbnail
        : null,
    hubId: typeof r.hub_id === "string" ? r.hub_id : null,
    hubName: typeof r.hub_name === "string" ? r.hub_name : null,
    startDate: String(r.start_date ?? ""),
    endDate: String(r.end_date ?? ""),
    rentalDays: Number(r.rental_days ?? 0),
    pricingModel: "daily",
    currencyCode: String(r.currency_code ?? "THB"),
    dailyRate: Number(r.daily_rate ?? 0),
    weeklyRate: Number(r.weekly_rate ?? 0),
    monthlyRate: Number(r.monthly_rate ?? 0),
    rentalTotal: Number(r.rental_total ?? 0),
    depositAmount: Number(r.deposit_amount ?? 0),
    depositPaidAmount: Number(r.deposit_paid_amount ?? 0),
    depositPaymentMethod:
      typeof r.deposit_payment_method === "string"
        ? (r.deposit_payment_method as AdminRentalBookingDetail["depositPaymentMethod"])
        : null,
    depositPaymentStatus: String(
      r.deposit_payment_status ?? "unpaid",
    ) as AdminRentalBookingDetail["depositPaymentStatus"],
    depositRefundStatus: String(
      r.deposit_refund_status ?? "not_refunded",
    ) as AdminRentalBookingDetail["depositRefundStatus"],
    pricingBreakdown,
    storageBranchId: branchId,
    storageBranchName: branchName,
    bookerName: typeof r.booker_name === "string" ? r.booker_name : null,
    bookerPhone: typeof r.booker_phone === "string" ? r.booker_phone : null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    customer,
  };
}

export async function fetchAdminCustomerProfile(
  adminClient: AnyClient,
  userId: string,
): Promise<AdminCustomerProfile> {
  const map = await fetchAdminUserProfiles(adminClient, [userId]);
  const profile = map.get(userId);
  return {
    userId,
    fullName: profile?.fullName ?? null,
    phone: profile?.phone ?? null,
    kycStatus: profile?.kycStatus ?? null,
    idCardUrl: profile?.idCardUrl ?? null,
  };
}

// ─── Status transition allowlists ───────────────────────────────────────────
// Re-exported from `app/utils/admin-order-transitions` so the same tables drive
// both the PATCH validation and the UI button visibility on the detail pages.

export {
  ORDER_FULFILLMENT_STATUS_TRANSITIONS,
  ORDER_PAYMENT_STATUS_TRANSITIONS,
  ORDER_STATUS_TRANSITIONS,
  RENTAL_BOOKING_STATUS_TRANSITIONS,
} from "~~/app/utils/admin-order-transitions";
