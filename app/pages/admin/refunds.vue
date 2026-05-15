<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type RefundStatus =
  | "pending_admin_review"
  | "processing"
  | "needs_customer_contact"
  | "refunded"
  | "failed";
type RefundItem = {
  id: string;
  status: RefundStatus;
  requestedAt: string;
  processingAt?: string | null;
  needsCustomerContactAt?: string | null;
  refundedAt?: string | null;
  failedAt?: string | null;
  refundAmount: number;
  currencyCode: string;
  adminNote?: string | null;
  manualTransferReference?: string | null;
  destination: {
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
    contactPhone: string;
    customerNote?: string | null;
  };
  originalPayment: Record<string, string | null>;
  booking: Record<string, any> | null;
  customer: Record<string, any> | null;
  cancellation: Record<string, any> | null;
  proof: Record<string, any> | null;
  documents: {
    cancellationConfirmation: Record<string, any> | null;
    refundConfirmation: Record<string, any> | null;
  };
};
type RefundSummary = Record<RefundStatus, number> & {
  unresolved_total: number;
};

const { t } = useI18n();
const STATUSES: RefundStatus[] = [
  "pending_admin_review",
  "processing",
  "needs_customer_contact",
  "refunded",
  "failed",
];

const toast = useToast();
const { refundWorkSummary, setRefundWorkSummary } = useAdminRefundWork();
const activeStatus = ref<RefundStatus>("pending_admin_review");
const items = ref<RefundItem[]>([]);
const selected = ref<RefundItem | null>(null);
const loading = ref(false);
const detailLoading = ref(false);
const actionBusy = ref<string | null>(null);
const proofUploading = ref(false);
const error = ref<string | null>(null);
const proofError = ref<string | null>(null);
const adminNote = ref("");
const manualTransferReference = ref("");
const proofInput = ref<HTMLInputElement | null>(null);
const proofFile = shallowRef<File | null>(null);

const selectedId = computed(() => selected.value?.id ?? null);
const proofFileName = computed(
  () => proofFile.value?.name ?? t("adminRefunds.proof.noFileSelected"),
);
const proofSelectLabel = computed(() =>
  proofFile.value
    ? t("adminRefunds.proof.selectNewFile")
    : t("adminRefunds.proof.selectFile"),
);
const canUploadProof = computed(() =>
  Boolean(selected.value?.id && proofFile.value && !proofUploading.value),
);

function money(value: unknown, currency = "THB") {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(
    Number(value ?? 0),
  );
}
function dateTime(value: unknown) {
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(String(value)))
    : "—";
}
function age(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(ms / 36e5));
  if (hours < 24) return t("adminRefunds.ageHours", { count: hours });
  return t("adminRefunds.ageDays", { count: Math.floor(hours / 24) });
}
function itemName(item: RefundItem) {
  return (
    item.booking?.itemName ||
    item.booking?.id ||
    t("adminRefunds.fallbackBooking")
  );
}
function customerName(item: RefundItem) {
  return (
    item.customer?.fullName ||
    item.booking?.bookerName ||
    item.destination.contactPhone ||
    item.customer?.userId ||
    "—"
  );
}
function statusLabel(status: string) {
  return t(`adminRefunds.status.${status}`);
}
function statusCount(status: RefundStatus) {
  return refundWorkSummary.value[status] ?? 0;
}
function resetActionForm() {
  adminNote.value = "";
  manualTransferReference.value = selected.value?.manualTransferReference ?? "";
  proofFile.value = null;
  proofError.value = null;
  if (proofInput.value) proofInput.value.value = "";
}

async function loadQueue() {
  loading.value = true;
  error.value = null;
  try {
    const res = await $fetch<{ items: RefundItem[]; summary: RefundSummary }>(
      "/api/admin/refunds",
      { query: { status: activeStatus.value } },
    );
    items.value = res.items;
    setRefundWorkSummary(res.summary);
    if (selectedId.value) {
      const stillVisible = res.items.find(
        (item) => item.id === selectedId.value,
      );
      if (!stillVisible) selected.value = null;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("adminRefunds.loadFailed");
  } finally {
    loading.value = false;
  }
}
async function openDetail(id: string) {
  detailLoading.value = true;
  try {
    selected.value = await $fetch<RefundItem>(`/api/admin/refunds/${id}`);
    resetActionForm();
  } catch (e) {
    toast.add({
      title:
        e instanceof Error ? e.message : t("adminRefunds.detailLoadFailed"),
      color: "error",
    });
  } finally {
    detailLoading.value = false;
  }
}
async function uploadProof() {
  if (!selected.value || !proofFile.value) return;
  proofUploading.value = true;
  proofError.value = null;
  try {
    const fd = new FormData();
    fd.append("file", proofFile.value);
    if (adminNote.value) fd.append("notes", adminNote.value);
    selected.value = await $fetch<RefundItem>(
      `/api/admin/refunds/${selected.value.id}/proof`,
      { method: "POST", body: fd },
    );
    proofFile.value = null;
    await loadQueue();
    toast.add({ title: t("adminRefunds.proofUploaded"), color: "success" });
  } catch (e) {
    proofError.value =
      e instanceof Error ? e.message : t("adminRefunds.proofUploadFailed");
    toast.add({
      title:
        e instanceof Error ? e.message : t("adminRefunds.proofUploadFailed"),
      color: "error",
    });
  } finally {
    proofUploading.value = false;
  }
}
async function runAction(action: string) {
  if (!selected.value || actionBusy.value) return;
  actionBusy.value = action;
  try {
    const body: Record<string, string> = {};
    if (adminNote.value) body.adminNote = adminNote.value;
    if (action === "mark-refunded") {
      body.manualTransferReference = manualTransferReference.value;
      if (selected.value.proof?.id)
        body.refundProofId = selected.value.proof.id;
    }
    const res = await $fetch<{ detail: RefundItem }>(
      `/api/admin/refunds/${selected.value.id}/${action}`,
      { method: "POST", body },
    );
    selected.value = res.detail;
    resetActionForm();
    await loadQueue();
    toast.add({ title: t("adminRefunds.refundUpdated"), color: "success" });
  } catch (e) {
    toast.add({
      title: e instanceof Error ? e.message : t("adminRefunds.actionFailed"),
      color: "error",
    });
  } finally {
    actionBusy.value = null;
  }
}
function onProofFile(e?: Event) {
  const eventInput =
    e?.currentTarget instanceof HTMLInputElement
      ? e.currentTarget
      : e?.target instanceof HTMLInputElement
        ? e.target
        : null;
  const input = eventInput ?? proofInput.value;
  proofFile.value = input?.files?.item(0) ?? null;
  proofError.value = null;
}
function selectProofFile() {
  if (proofUploading.value) return;
  proofInput.value?.click();
}

watch(activeStatus, () => void loadQueue(), { immediate: true });
</script>

<template>
  <UContainer class="py-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t("adminRefunds.title") }}</h1>
        <p class="text-sm text-muted">{{ t("adminRefunds.subtitle") }}</p>
      </div>
      <UButton icon="bx:refresh" :loading="loading" @click="loadQueue">{{
        t("adminRefunds.refresh")
      }}</UButton>
    </div>

    <div
      class="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-default bg-(--ui-bg-elevated)/70 p-1"
      role="tablist"
      :aria-label="t('adminRefunds.filters.label')"
    >
      <button
        v-for="s in STATUSES"
        :key="s"
        type="button"
        class="rounded-lg px-3 py-2 text-sm font-medium transition"
        :class="
          activeStatus === s
            ? 'bg-primary text-white shadow-sm'
            : 'text-muted hover:bg-white hover:text-default'
        "
        role="tab"
        :aria-selected="activeStatus === s"
        @click="activeStatus = s"
      >
        <span>{{ statusLabel(s) }}</span>
        <span class="ml-1 tabular-nums">{{ statusCount(s) }}</span>
      </button>
    </div>

    <UAlert v-if="error" class="mb-4" color="error" :title="error" />
    <div class="grid gap-6 xl:grid-cols-[1fr_420px]">
      <UCard>
        <template #header
          ><h2 class="font-semibold">
            {{ statusLabel(activeStatus) }}
          </h2></template
        >
        <div v-if="loading" class="py-10 text-center text-muted">
          {{ t("adminRefunds.loading") }}
        </div>
        <div
          v-else-if="items.length === 0"
          class="py-10 text-center text-muted"
        >
          {{ t("adminRefunds.empty") }}
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-muted">
              <tr>
                <th class="py-2">{{ t("adminRefunds.columns.refund") }}</th>
                <th>{{ t("adminRefunds.columns.bookingCustomer") }}</th>
                <th>{{ t("adminRefunds.columns.requested") }}</th>
                <th>{{ t("adminRefunds.columns.amount") }}</th>
                <th>{{ t("adminRefunds.columns.status") }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id" class="border-t">
                <td class="py-3">
                  <p class="font-medium">{{ item.id.slice(0, 8) }}</p>
                  <p class="text-xs text-muted">
                    {{ t("adminRefunds.age", { age: age(item.requestedAt) }) }}
                  </p>
                </td>
                <td>
                  <p>{{ itemName(item) }}</p>
                  <p class="text-xs text-muted">
                    {{ customerName(item) }} ·
                    {{ item.destination.contactPhone }}
                  </p>
                </td>
                <td>{{ dateTime(item.requestedAt) }}</td>
                <td>{{ money(item.refundAmount, item.currencyCode) }}</td>
                <td>
                  <UBadge>{{ statusLabel(item.status) }}</UBadge>
                </td>
                <td>
                  <UButton
                    size="sm"
                    variant="outline"
                    :loading="detailLoading && selectedId === item.id"
                    @click="openDetail(item.id)"
                    >{{ t("adminRefunds.open") }}</UButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard>
        <template #header
          ><h2 class="font-semibold">
            {{ t("adminRefunds.detail.title") }}
          </h2></template
        >
        <div v-if="!selected" class="py-10 text-center text-muted">
          {{ t("adminRefunds.detail.empty") }}
        </div>
        <div v-else class="space-y-5 text-sm">
          <section>
            <h3 class="font-semibold">
              {{ t("adminRefunds.detail.booking") }}
            </h3>
            <p>{{ selected.booking?.id }}</p>
            <p>{{ itemName(selected) }} · {{ selected.booking?.status }}</p>
            <p>
              {{ selected.booking?.startDate }} →
              {{ selected.booking?.endDate }}
            </p>
            <p>
              {{ selected.booking?.bookerName || "—" }} ·
              {{ selected.booking?.bookerPhone || "—" }}
            </p>
          </section>
          <section>
            <h3 class="font-semibold">
              {{ t("adminRefunds.detail.cancellation") }}
            </h3>
            <p>
              {{
                t("adminRefunds.detail.cancelledAt", {
                  value: dateTime(selected.cancellation?.cancelledAt),
                })
              }}
            </p>
            <p>
              {{
                t("adminRefunds.detail.source", {
                  initiator: selected.cancellation?.initiator || "—",
                  source: selected.cancellation?.source || "—",
                })
              }}
            </p>
            <p>
              {{
                t("adminRefunds.detail.eligible", {
                  value: selected.cancellation?.refundEligible
                    ? t("adminRefunds.yes")
                    : t("adminRefunds.no"),
                  cutoff:
                    selected.cancellation?.refundCutoffDateSnapshot || "—",
                })
              }}
            </p>
            <UButton
              v-if="selected.documents.cancellationConfirmation"
              size="xs"
              variant="link"
              :to="`/admin/documents/${selected.documents.cancellationConfirmation.id}/print`"
              target="_blank"
              >{{ t("adminRefunds.detail.cancellationDocument") }}</UButton
            >
          </section>
          <section>
            <h3 class="font-semibold">
              {{ t("adminRefunds.detail.destination") }}
            </h3>
            <p>
              {{ selected.destination.bankName }} ·
              {{ selected.destination.bankAccountNumber }}
            </p>
            <p>{{ selected.destination.bankAccountName }}</p>
            <p>
              {{
                t("adminRefunds.detail.phone", {
                  phone: selected.destination.contactPhone,
                })
              }}
            </p>
            <p v-if="selected.destination.customerNote">
              {{
                t("adminRefunds.detail.customerNote", {
                  note: selected.destination.customerNote,
                })
              }}
            </p>
          </section>
          <section>
            <h3 class="font-semibold">
              {{ t("adminRefunds.detail.originalPayment") }}
            </h3>
            <p>{{ selected.originalPayment.sourceType }}</p>
            <p>
              {{ selected.originalPayment.gateway || "—" }} /
              {{
                selected.originalPayment.gatewayChargeId ||
                selected.originalPayment.gatewayPaymentReference ||
                "—"
              }}
            </p>
          </section>
          <section>
            <h3 class="font-semibold">
              {{ t("adminRefunds.detail.adminData") }}
            </h3>
            <p>
              {{
                t("adminRefunds.detail.status", {
                  status: statusLabel(selected.status),
                })
              }}
            </p>
            <p>
              {{
                t("adminRefunds.detail.manualReference", {
                  value: selected.manualTransferReference || "—",
                })
              }}
            </p>
            <p>
              {{
                t("adminRefunds.detail.adminNote", {
                  value: selected.adminNote || "—",
                })
              }}
            </p>
            <UButton
              v-if="selected.documents.refundConfirmation"
              size="xs"
              variant="link"
              :to="`/admin/documents/${selected.documents.refundConfirmation.id}/print`"
              target="_blank"
              >{{ t("adminRefunds.detail.refundConfirmation") }}</UButton
            >
          </section>
          <section class="space-y-3 rounded-lg border p-3">
            <div>
              <h3 class="font-semibold">{{ t("adminRefunds.proof.title") }}</h3>
              <p class="text-xs text-muted">
                {{ t("adminRefunds.proof.subtitle") }}
              </p>
            </div>
            <UAlert
              v-if="!selected.proof"
              color="warning"
              variant="soft"
              :title="t('adminRefunds.proof.emptyTitle')"
              :description="t('adminRefunds.proof.emptyDesc')"
            />
            <UAlert
              v-else
              color="success"
              variant="soft"
              :title="t('adminRefunds.proof.existsTitle')"
              :description="
                t('adminRefunds.proof.existsDesc', {
                  createdAt: dateTime(selected.proof.createdAt),
                })
              "
            />
            <UButton
              v-if="selected.proof?.fileUrl"
              size="sm"
              variant="outline"
              icon="bx:file"
              :to="selected.proof.fileUrl"
              target="_blank"
              >{{ t("adminRefunds.proof.view") }}</UButton
            >
            <div class="space-y-2 rounded-md bg-muted/30 p-3">
              <p class="text-xs font-medium">
                {{ t("adminRefunds.proof.uploadLabel") }}
              </p>
              <input
                ref="proofInput"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                class="sr-only"
                @input="onProofFile"
                @change="onProofFile"
              />
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  size="sm"
                  variant="outline"
                  icon="bx:file-plus"
                  :disabled="proofUploading"
                  @click="selectProofFile"
                  >{{ proofSelectLabel }}</UButton
                >
                <p class="text-xs text-muted">
                  <span v-if="proofFile" class="font-medium text-default">
                    {{ t("adminRefunds.proof.selectedFile") }}:
                  </span>
                  {{ proofFileName }}
                </p>
              </div>
              <UAlert v-if="proofError" color="error" :title="proofError" />
              <UButton
                size="sm"
                icon="bx:upload"
                :loading="proofUploading"
                :disabled="!canUploadProof"
                @click="uploadProof"
                >{{ t("adminRefunds.proof.uploadAction") }}</UButton
              >
            </div>
          </section>
          <section class="space-y-3 rounded-lg border p-3">
            <h3 class="font-semibold">{{ t("adminRefunds.actions.title") }}</h3>
            <UTextarea
              v-model="adminNote"
              :placeholder="t('adminRefunds.actions.adminNotePlaceholder')"
            /><UInput
              v-model="manualTransferReference"
              :placeholder="
                t('adminRefunds.actions.manualReferencePlaceholder')
              "
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                size="sm"
                :loading="actionBusy === 'start-processing'"
                :disabled="
                  !!actionBusy || selected.status !== 'pending_admin_review'
                "
                @click="runAction('start-processing')"
                >{{ t("adminRefunds.actions.startProcessing") }}</UButton
              ><UButton
                size="sm"
                color="warning"
                :loading="actionBusy === 'needs-customer-contact'"
                :disabled="
                  !!actionBusy ||
                  !['pending_admin_review', 'processing'].includes(
                    selected.status,
                  ) ||
                  !adminNote.trim()
                "
                @click="runAction('needs-customer-contact')"
                >{{ t("adminRefunds.actions.needsContact") }}</UButton
              ><UButton
                size="sm"
                color="error"
                :loading="actionBusy === 'mark-failed'"
                :disabled="
                  !!actionBusy ||
                  ![
                    'pending_admin_review',
                    'processing',
                    'needs_customer_contact',
                  ].includes(selected.status) ||
                  !adminNote.trim()
                "
                @click="runAction('mark-failed')"
                >{{ t("adminRefunds.actions.markFailed") }}</UButton
              ><UButton
                size="sm"
                color="success"
                :loading="actionBusy === 'mark-refunded'"
                :disabled="
                  !!actionBusy ||
                  !['pending_admin_review', 'processing', 'refunded'].includes(
                    selected.status,
                  ) ||
                  !manualTransferReference.trim()
                "
                @click="runAction('mark-refunded')"
                >{{ t("adminRefunds.actions.markRefunded") }}</UButton
              >
            </div>
          </section>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
