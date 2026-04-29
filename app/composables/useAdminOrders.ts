/**
 * Admin Orders dashboard composable.
 *
 * Manages filter state, server-side pagination (load-more) and
 * the grouped customer card list shown on /admin/orders.
 *
 * Calls /api/admin/orders/customers under the hood.
 */
import type {
  AdminCustomerCard,
  AdminCustomerListResponse,
  AdminOrderFilterParams,
} from "~/types/admin-order";

const PAGE_SIZE = 20;

function emptyFilters(): AdminOrderFilterParams {
  return {
    search: "",
    view: "all",
    type: "all",
    orderStatus: [],
    paymentStatus: [],
    fulfillmentStatus: [],
    rentalStatus: [],
    dateFrom: "",
    dateTo: "",
    branchId: "",
  };
}

function buildQuery(
  filters: AdminOrderFilterParams,
  page: number,
  pageSize: number,
): Record<string, string> {
  const q: Record<string, string> = {
    page: String(page),
    pageSize: String(pageSize),
  };

  if (filters.search) q.search = filters.search;
  if (filters.view && filters.view !== "all") q.view = filters.view;
  if (filters.type && filters.type !== "all") q.type = filters.type;
  if (filters.orderStatus?.length)
    q.orderStatus = filters.orderStatus.join(",");
  if (filters.paymentStatus?.length)
    q.paymentStatus = filters.paymentStatus.join(",");
  if (filters.fulfillmentStatus?.length)
    q.fulfillmentStatus = filters.fulfillmentStatus.join(",");
  if (filters.rentalStatus?.length)
    q.rentalStatus = filters.rentalStatus.join(",");
  if (filters.dateFrom) q.dateFrom = filters.dateFrom;
  if (filters.dateTo) q.dateTo = filters.dateTo;
  if (filters.branchId) q.branchId = filters.branchId;

  return q;
}

export function useAdminOrders() {
  const filters = reactive<AdminOrderFilterParams>(emptyFilters());

  const items = ref<AdminCustomerCard[]>([]);
  const total = ref(0);
  const actionRequiredCount = useState<number>(
    "admin-orders:action-required-count",
    () => 0,
  );
  const page = ref(0);
  const pageSize = ref(PAGE_SIZE);
  const hasMore = ref(false);

  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);

  let requestToken = 0;

  async function fetchPage(targetPage: number, append: boolean): Promise<void> {
    const myToken = ++requestToken;
    if (append) loadingMore.value = true;
    else loading.value = true;
    error.value = null;

    try {
      const data = await $fetch<AdminCustomerListResponse>(
        "/api/admin/orders/customers",
        {
          query: buildQuery(filters, targetPage, pageSize.value),
        },
      );

      // Drop stale responses (e.g. fast filter changes).
      if (myToken !== requestToken) return;

      if (append) {
        items.value = [...items.value, ...data.items];
      } else {
        items.value = data.items;
      }
      total.value = data.total;
      actionRequiredCount.value = data.actionRequiredCount;
      page.value = data.page;
      pageSize.value = data.pageSize;
      hasMore.value = data.hasMore;
    } catch (err) {
      if (myToken !== requestToken) return;
      error.value =
        err instanceof Error ? err.message : "Failed to load admin orders";
    } finally {
      if (myToken === requestToken) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  async function refresh(): Promise<void> {
    await fetchPage(0, false);
  }

  async function loadMore(): Promise<void> {
    if (!hasMore.value || loading.value || loadingMore.value) return;
    await fetchPage(page.value + 1, true);
  }

  async function refreshActionRequiredCount(): Promise<void> {
    const data = await $fetch<AdminCustomerListResponse>(
      "/api/admin/orders/customers",
      { query: { page: "0", pageSize: "1" } },
    );
    actionRequiredCount.value = data.actionRequiredCount;
  }

  function applyFilters(patch: Partial<AdminOrderFilterParams>): void {
    Object.assign(filters, patch);
  }

  function resetFilters(): void {
    Object.assign(filters, emptyFilters());
  }

  return {
    filters,
    items,
    total,
    actionRequiredCount,
    page,
    pageSize,
    hasMore,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    refreshActionRequiredCount,
    applyFilters,
    resetFilters,
  };
}
