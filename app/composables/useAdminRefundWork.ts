type RefundWorkSummary = {
  pending_admin_review: number;
  processing: number;
  needs_customer_contact: number;
  refunded: number;
  failed: number;
  unresolved_total: number;
};

type RealtimeChannel = ReturnType<
  ReturnType<typeof useSupabaseClient>["channel"]
>;

const emptyRefundWorkSummary: RefundWorkSummary = {
  pending_admin_review: 0,
  processing: 0,
  needs_customer_contact: 0,
  refunded: 0,
  failed: 0,
  unresolved_total: 0,
};

const refundWorkSummary = ref<RefundWorkSummary>({ ...emptyRefundWorkSummary });
const refundWorkLoading = ref(false);
let refundWorkChannel: RealtimeChannel | null = null;
let refundWorkSubscriberCount = 0;

export function useAdminRefundWork() {
  const supabase = useSupabaseClient();

  function setRefundWorkSummary(summary: RefundWorkSummary | null | undefined) {
    refundWorkSummary.value = { ...emptyRefundWorkSummary, ...(summary ?? {}) };
  }

  async function refreshRefundWorkSummary() {
    refundWorkLoading.value = true;
    try {
      setRefundWorkSummary(
        await $fetch<RefundWorkSummary>("/api/admin/refunds/summary"),
      );
    } catch {
      // Badge gracefully degrades when the request fails.
    } finally {
      refundWorkLoading.value = false;
    }
  }

  function subscribeRefundWork() {
    if (import.meta.server) return;
    refundWorkSubscriberCount += 1;
    if (refundWorkChannel) return;
    refundWorkChannel = supabase.channel("admin-refund-work");
    refundWorkChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payment_refunds" },
      () => void refreshRefundWorkSummary(),
    );
    refundWorkChannel.subscribe();
  }

  function unsubscribeRefundWork() {
    refundWorkSubscriberCount = Math.max(0, refundWorkSubscriberCount - 1);
    if (refundWorkSubscriberCount === 0 && refundWorkChannel) {
      supabase.removeChannel(refundWorkChannel);
      refundWorkChannel = null;
    }
  }

  return {
    refundWorkSummary,
    refundWorkLoading,
    setRefundWorkSummary,
    refreshRefundWorkSummary,
    subscribeRefundWork,
    unsubscribeRefundWork,
  };
}
