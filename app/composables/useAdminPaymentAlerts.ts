/**
 * Admin payment-alert composable.
 *
 * Pulls the alert queue from the server and subscribes to Supabase realtime
 * INSERT/UPDATE on `payment_alerts` so the admin UI reacts immediately when a
 * new alert is recorded by the payment hooks (e.g. `inventory_apply_failed`).
 *
 * The shared realtime channel powers both the layout badge and the alerts
 * page: callers use `subscribe()`/`unsubscribe()` to mount/unmount.
 */
import type {
  AdminPaymentAlert,
  AdminPaymentAlertListResponse,
  AdminPaymentAlertSeverity,
} from "~/types/admin-order-detail";

type RealtimeChannel = ReturnType<
  ReturnType<typeof useSupabaseClient>["channel"]
>;

export interface AdminAlertFilters {
  resolved: "open" | "resolved" | "all";
  severity: AdminPaymentAlertSeverity | null;
  kind: string | null;
}

const items = ref<AdminPaymentAlert[]>([]);
const total = ref(0);
const unresolvedTotal = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const filters = reactive<AdminAlertFilters>({
  resolved: "open",
  severity: null,
  kind: null,
});
let channel: RealtimeChannel | null = null;
let subscriberCount = 0;

export function useAdminPaymentAlerts() {
  const supabase = useSupabaseClient();

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const query: Record<string, string | number> = {
        resolved: filters.resolved,
        limit: 100,
      };
      if (filters.severity) query.severity = filters.severity;
      if (filters.kind) query.kind = filters.kind;
      const res = await $fetch<AdminPaymentAlertListResponse>(
        "/api/admin/payment-alerts",
        { query },
      );
      items.value = res.items;
      total.value = res.total;
      unresolvedTotal.value = res.unresolvedTotal;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load alerts";
    } finally {
      loading.value = false;
    }
  }

  async function refreshUnresolvedCount() {
    try {
      const res = await $fetch<AdminPaymentAlertListResponse>(
        "/api/admin/payment-alerts",
        { query: { resolved: "open", limit: 1 } },
      );
      unresolvedTotal.value = res.unresolvedTotal;
    } catch {
      // Silent — badge gracefully degrades when the request fails.
    }
  }

  async function resolve(id: string): Promise<AdminPaymentAlert> {
    const updated = await $fetch<AdminPaymentAlert>(
      `/api/admin/payment-alerts/${id}/resolve`,
      { method: "POST" },
    );
    items.value = items.value.map((row) => (row.id === id ? updated : row));
    if (unresolvedTotal.value > 0) unresolvedTotal.value -= 1;
    return updated;
  }

  function subscribe() {
    if (import.meta.server) return;
    subscriberCount += 1;
    if (channel) return;
    channel = supabase.channel("admin-payment-alerts");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payment_alerts" },
      () => {
        void load();
        void refreshUnresolvedCount();
      },
    );
    channel.subscribe();
  }

  function unsubscribe() {
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  return {
    items,
    total,
    unresolvedTotal,
    loading,
    error,
    filters,
    load,
    refreshUnresolvedCount,
    resolve,
    subscribe,
    unsubscribe,
  };
}
