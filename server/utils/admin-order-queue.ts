import { getQuery, type H3Event } from "h3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminSaleOrderFulfillmentMethod,
  AdminSaleOrderQueueFilterParams,
  AdminSaleOrderQueueResponse,
  AdminSaleOrderQueueRow,
  AdminSaleOrderQueueSummary,
  AdminSaleOrderQueueView,
} from "~~/app/types/admin-order";
import type {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "~~/app/types/order";
import { fetchAdminUserProfiles } from "~~/server/utils/admin-orders";

type AnyClient = Pick<SupabaseClient, "from">;
type AnyRow = Record<string, unknown>;
type FilterQuery = {
  eq(column: string, value: string): FilterQuery;
  in(column: string, values: string[]): FilterQuery;
  gte(column: string, value: string): FilterQuery;
  lte(column: string, value: string): FilterQuery;
  not(column: string, op: string, value: string): FilterQuery;
  or(clause: string): FilterQuery;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const QUEUE_VALUES = new Set<AdminSaleOrderQueueView>([
  "action_required",
  "delivery",
  "pickup",
  "awaiting_payment",
  "all",
]);

const ACTION_PAYMENT_STATUSES: OrderPaymentStatus[] = ["paid", "deferred"];
const ACTION_FULFILLMENT_STATUSES: OrderFulfillmentStatus[] = [
  "unfulfilled",
  "preparing",
  "ready_for_carrier_pickup",
];
const AWAITING_PAYMENT_STATUSES: OrderPaymentStatus[] = [
  "awaiting_payment",
  "pending_review",
];
const INACTIVE_ORDER_STATUSES: OrderStatus[] = ["completed", "cancelled"];

export const ADMIN_SALE_ORDER_QUEUE_SELECT =
  "id, order_number, user_id, status, payment_status, fulfillment_status, shipping_mode, pickup_branch_id, grand_total, currency_code, address_snapshot, created_at, updated_at, order_items(count)";

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export function parseAdminSaleOrderQueueFilters(event: H3Event): {
  filters: AdminSaleOrderQueueFilterParams;
  page: number;
  pageSize: number;
} {
  const q = getQuery(event);
  const rawQueue = asString(q.queue) as AdminSaleOrderQueueView | undefined;
  const queue =
    rawQueue && QUEUE_VALUES.has(rawQueue) ? rawQueue : "action_required";

  return {
    filters: {
      queue,
      search: asString(q.search),
      orderStatus: asArray(q.orderStatus),
      paymentStatus: asArray(q.paymentStatus),
      fulfillmentStatus: asArray(q.fulfillmentStatus),
      dateFrom: asString(q.dateFrom),
      dateTo: asString(q.dateTo),
    },
    page: Math.max(0, Number(q.page ?? 0) || 0),
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(q.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
    ),
  };
}

function applyGlobalFilters<T>(
  query: T,
  filters: AdminSaleOrderQueueFilterParams,
  searchUserIds: Set<string> | null,
): T {
  let q = query as unknown as FilterQuery;

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
      const ids = Array.from(new Set([trimmed, ...userIdList]));
      q = q.or(`id.in.(${ids.join(",")}),user_id.in.(${ids.join(",")})`);
    } else {
      const term = `*${trimmed.replace(/[%_*]/g, "")}*`;
      const userClause =
        userIdList.length > 0 ? `,user_id.in.(${userIdList.join(",")})` : "";
      q = q.or(`order_number.ilike.${term}${userClause}`);
    }
  }

  return q as T;
}

function applyActionRequiredFilters<T>(query: T): T {
  let q = query as unknown as FilterQuery;
  q = q.not("status", "in", `(${INACTIVE_ORDER_STATUSES.join(",")})`);
  q = q.in("payment_status", ACTION_PAYMENT_STATUSES);
  q = q.in("fulfillment_status", ACTION_FULFILLMENT_STATUSES);
  return q as T;
}

function applyAwaitingPaymentFilters<T>(query: T): T {
  let q = query as unknown as FilterQuery;
  q = q.not("status", "in", `(${INACTIVE_ORDER_STATUSES.join(",")})`);
  q = q.in("payment_status", AWAITING_PAYMENT_STATUSES);
  return q as T;
}

function applyQueueFilters<T>(query: T, queue: AdminSaleOrderQueueView): T {
  let q = query as unknown as FilterQuery;
  if (queue === "all") return q as T;
  if (queue === "awaiting_payment") return applyAwaitingPaymentFilters(q as T);
  q = applyActionRequiredFilters(q as T) as typeof q;
  if (queue === "delivery") q = q.eq("shipping_mode", "delivery");
  if (queue === "pickup") q = q.eq("shipping_mode", "pickup");
  return q as T;
}

async function countQueue(
  adminClient: AnyClient,
  filters: AdminSaleOrderQueueFilterParams,
  queue: AdminSaleOrderQueueView,
  searchUserIds: Set<string> | null,
): Promise<number> {
  let q = adminClient
    .from("orders")
    .select("id", { count: "exact", head: true });
  q = applyGlobalFilters(q, filters, searchUserIds);
  q = applyQueueFilters(q, queue);
  const { count, error } = await q;
  if (error) throw error;
  return Number(count ?? 0);
}

function asRow(row: unknown): AnyRow {
  return row && typeof row === "object" ? (row as AnyRow) : {};
}

function itemCount(row: AnyRow): number {
  const itemsAgg = Array.isArray(row.order_items) ? row.order_items[0] : null;
  return itemsAgg && typeof itemsAgg === "object"
    ? Number((itemsAgg as AnyRow).count ?? 0)
    : 0;
}

async function fetchBranchMap(
  adminClient: AnyClient,
  branchIds: string[],
): Promise<Map<string, { id: string; name: string | null }>> {
  const ids = Array.from(new Set(branchIds.filter(Boolean)));
  const map = new Map<string, { id: string; name: string | null }>();
  if (ids.length === 0) return map;

  const { data, error } = await adminClient
    .from("store_branches")
    .select("id, code, name_th, name_en")
    .in("id", ids);
  if (error) throw error;

  for (const raw of data ?? []) {
    const row = asRow(raw);
    const id = String(row.id ?? "");
    if (!id) continue;
    const name =
      typeof row.name_th === "string" && row.name_th.length > 0
        ? row.name_th
        : typeof row.name_en === "string" && row.name_en.length > 0
          ? row.name_en
          : typeof row.code === "string"
            ? row.code
            : null;
    map.set(id, { id, name });
  }
  return map;
}

function mapQueueRow(
  raw: unknown,
  profiles: Awaited<ReturnType<typeof fetchAdminUserProfiles>>,
  branches: Map<string, { id: string; name: string | null }>,
): AdminSaleOrderQueueRow {
  const row = asRow(raw);
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const profile = userId ? profiles.get(userId) : undefined;
  const snapshot = asRow(row.address_snapshot);
  const branchId =
    typeof row.pickup_branch_id === "string" ? row.pickup_branch_id : null;
  const fulfillmentMethod =
    row.shipping_mode === "delivery" || row.shipping_mode === "pickup"
      ? (row.shipping_mode as AdminSaleOrderFulfillmentMethod)
      : null;

  return {
    id: String(row.id ?? ""),
    orderNumber: String(row.order_number ?? ""),
    customer: {
      id: userId,
      name: profile?.fullName ?? null,
      phone: profile?.phone ?? null,
    },
    createdAt: String(row.created_at ?? ""),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    orderStatus: String(row.status ?? "submitted") as OrderStatus,
    paymentStatus: String(
      row.payment_status ?? "not_applicable",
    ) as OrderPaymentStatus,
    fulfillmentStatus: String(
      row.fulfillment_status ?? "not_applicable",
    ) as OrderFulfillmentStatus,
    fulfillmentMethod,
    pickupBranch: branchId
      ? (branches.get(branchId) ?? { id: branchId, name: null })
      : null,
    addressTitle:
      typeof snapshot.title === "string" && snapshot.title.length > 0
        ? snapshot.title
        : null,
    itemCount: itemCount(row),
    grandTotal: Number(row.grand_total ?? 0),
    currencyCode: String(row.currency_code ?? "THB"),
  };
}

export async function fetchAdminSaleOrderQueue(input: {
  adminClient: AnyClient;
  filters: AdminSaleOrderQueueFilterParams;
  page: number;
  pageSize: number;
  searchUserIds: Set<string> | null;
}): Promise<AdminSaleOrderQueueResponse> {
  const queue = input.filters.queue ?? "action_required";
  const [actionRequired, delivery, pickup, awaitingPayment, all] =
    await Promise.all([
      countQueue(
        input.adminClient,
        input.filters,
        "action_required",
        input.searchUserIds,
      ),
      countQueue(
        input.adminClient,
        input.filters,
        "delivery",
        input.searchUserIds,
      ),
      countQueue(
        input.adminClient,
        input.filters,
        "pickup",
        input.searchUserIds,
      ),
      countQueue(
        input.adminClient,
        input.filters,
        "awaiting_payment",
        input.searchUserIds,
      ),
      countQueue(input.adminClient, input.filters, "all", input.searchUserIds),
    ]);

  const summary: AdminSaleOrderQueueSummary = {
    actionRequired,
    delivery,
    pickup,
    awaitingPayment,
    all,
  };

  const total =
    queue === "delivery"
      ? delivery
      : queue === "pickup"
        ? pickup
        : queue === "awaiting_payment"
          ? awaitingPayment
          : queue === "all"
            ? all
            : actionRequired;
  const start = input.page * input.pageSize;
  const end = start + input.pageSize - 1;

  let q = input.adminClient
    .from("orders")
    .select(ADMIN_SALE_ORDER_QUEUE_SELECT)
    .order("created_at", { ascending: false })
    .range(start, end);
  q = applyGlobalFilters(q, input.filters, input.searchUserIds);
  q = applyQueueFilters(q, queue);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown[];
  const userIds = rows
    .map((row) => asRow(row).user_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const branchIds = rows
    .map((row) => asRow(row).pickup_branch_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const [profiles, branches] = await Promise.all([
    fetchAdminUserProfiles(input.adminClient, userIds),
    fetchBranchMap(input.adminClient, branchIds),
  ]);

  return {
    items: rows.map((row) => mapQueueRow(row, profiles, branches)),
    summary,
    total,
    page: input.page,
    pageSize: input.pageSize,
    hasMore: end + 1 < total,
  };
}
