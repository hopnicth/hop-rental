import type {
  AdminSaleOrderQueueFilterParams,
  AdminSaleOrderQueueResponse,
  AdminSaleOrderQueueRow,
  AdminSaleOrderQueueSummary,
  AdminSaleOrderQueueView,
} from "~/types/admin-order";
import type {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";

const PAGE_SIZE = 20;
const QUEUE_VALUES = new Set<AdminSaleOrderQueueView>([
  "action_required",
  "delivery",
  "pickup",
  "awaiting_payment",
  "all",
]);

function firstQueryValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function parseQueue(value: unknown): AdminSaleOrderQueueView {
  const raw = firstQueryValue(value) as AdminSaleOrderQueueView;
  return QUEUE_VALUES.has(raw) ? raw : "action_required";
}

function parseCsv<T extends string>(value: unknown): T[] {
  return firstQueryValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as T[];
}

function emptySummary(): AdminSaleOrderQueueSummary {
  return {
    actionRequired: 0,
    delivery: 0,
    pickup: 0,
    awaitingPayment: 0,
    all: 0,
  };
}

function emptyFilters(
  query: Record<string, unknown> = {},
): AdminSaleOrderQueueFilterParams {
  return {
    queue: parseQueue(query.queue),
    search: firstQueryValue(query.search),
    orderStatus: parseCsv<OrderStatus>(query.orderStatus),
    paymentStatus: parseCsv<OrderPaymentStatus>(query.paymentStatus),
    fulfillmentStatus: parseCsv<OrderFulfillmentStatus>(
      query.fulfillmentStatus,
    ),
    dateFrom: firstQueryValue(query.dateFrom),
    dateTo: firstQueryValue(query.dateTo),
  };
}

function parsePage(value: unknown): number {
  return Math.max(0, Number(firstQueryValue(value) || 0) || 0);
}

function buildQuery(
  filters: AdminSaleOrderQueueFilterParams,
  page: number,
  pageSize: number,
): Record<string, string> {
  const query: Record<string, string> = {
    queue: filters.queue ?? "action_required",
    page: String(page),
    pageSize: String(pageSize),
  };
  if (filters.search) query.search = filters.search;
  if (filters.dateFrom) query.dateFrom = filters.dateFrom;
  if (filters.dateTo) query.dateTo = filters.dateTo;
  if (filters.orderStatus?.length)
    query.orderStatus = filters.orderStatus.join(",");
  if (filters.paymentStatus?.length)
    query.paymentStatus = filters.paymentStatus.join(",");
  if (filters.fulfillmentStatus?.length)
    query.fulfillmentStatus = filters.fulfillmentStatus.join(",");
  return query;
}

export function useAdminOrderQueue() {
  const route = useRoute();
  const router = useRouter();
  const filters = reactive<AdminSaleOrderQueueFilterParams>(
    emptyFilters(route.query as Record<string, unknown>),
  );
  const items = ref<AdminSaleOrderQueueRow[]>([]);
  const summary = useState<AdminSaleOrderQueueSummary>(
    "admin-order-queue:summary",
    emptySummary,
  );
  const total = ref(0);
  const page = ref(parsePage(route.query.page));
  const pageSize = ref(PAGE_SIZE);
  const hasMore = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let requestToken = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  async function fetchPage(targetPage: number): Promise<void> {
    const safePage = Math.max(0, targetPage);
    const query = buildQuery(filters, safePage, pageSize.value);
    const myToken = ++requestToken;
    loading.value = true;
    error.value = null;
    try {
      if (import.meta.client) await router.replace({ query });
      const data = await $fetch<AdminSaleOrderQueueResponse>(
        "/api/admin/orders/queue",
        { query },
      );
      if (myToken !== requestToken) return;
      items.value = data.items;
      summary.value = data.summary;
      total.value = data.total;
      page.value = data.page;
      pageSize.value = data.pageSize;
      hasMore.value = data.hasMore;
    } catch (err) {
      if (myToken !== requestToken) return;
      error.value =
        err instanceof Error ? err.message : "Failed to load sale order queue";
    } finally {
      if (myToken === requestToken) loading.value = false;
    }
  }

  const refresh = () => fetchPage(page.value);
  const refreshFirstPage = () => fetchPage(0);
  const goToPage = (targetPage: number) => fetchPage(targetPage);
  const resetFilters = () => Object.assign(filters, emptyFilters());

  if (import.meta.client) {
    onMounted(() => void refresh());
    watch(
      () => filters.search,
      () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => void refreshFirstPage(), 300);
      },
    );
    watch(
      () =>
        [
          filters.queue,
          filters.dateFrom,
          filters.dateTo,
          filters.orderStatus?.join(",") ?? "",
          filters.paymentStatus?.join(",") ?? "",
          filters.fulfillmentStatus?.join(",") ?? "",
        ].join("|"),
      () => void refreshFirstPage(),
    );
  }

  return {
    filters,
    items,
    summary,
    total,
    page,
    pageSize,
    hasMore,
    loading,
    error,
    refresh,
    refreshFirstPage,
    goToPage,
    resetFilters,
  };
}
