<script setup lang="ts">
import type { AdminBookingOpsPayload } from "~/types/admin-booking-ops";
import type {
  AdminDocumentIssueResponse,
  AdminIssuedDocumentSummary,
  OperationalRentalDocumentType,
} from "~/types/admin-documents";
import type {
  AdminRentalBookingDetail,
  AdminRentalBookingPatchPayload,
} from "~/types/admin-order-detail";
import type { RentalBookingStatus } from "~/types/rental-booking";
import {
  documentTypeToPrintFormType,
  getOperationalDocumentUiState,
} from "~/utils/admin-documents";
import { RENTAL_BOOKING_STATUS_TRANSITIONS } from "~/utils/admin-order-transitions";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

type BadgeColor =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "error"
  | "primary";
type NoShowForfeitureDocumentType =
  | "rental_booking_no_show_forfeiture_notice"
  | "booking_deposit_forfeiture_ordinary_receipt";

const route = useRoute();
const toast = useToast();
const bookingId = computed(() => String(route.params.id ?? ""));

const booking = ref<AdminRentalBookingDetail | null>(null);
const ops = ref<AdminBookingOpsPayload | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const updating = ref(false);
const markingNoShow = ref(false);
const issuingNoShowDocuments = ref(false);
const retryingBdc = ref(false);
const issuingDocument = ref<OperationalRentalDocumentType | null>(null);
const operationalDocumentTypes: OperationalRentalDocumentType[] = [
  "rental_pickup_form",
  "rental_return_form",
];
const noShowForfeitureDocumentTypes: NoShowForfeitureDocumentType[] = [
  "rental_booking_no_show_forfeiture_notice",
  "booking_deposit_forfeiture_ordinary_receipt",
];

async function loadOps(): Promise<void> {
  if (!bookingId.value) return;
  try {
    ops.value = await $fetch<AdminBookingOpsPayload>(
      `/api/admin/rental-bookings/${bookingId.value}/ops`,
    );
  } catch (e) {
    toast.add({
      title: "Failed to load checklists/documents",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  }
}

async function load(): Promise<void> {
  if (!bookingId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const [detail] = await Promise.all([
      $fetch<AdminRentalBookingDetail>(
        `/api/admin/rental-bookings/${bookingId.value}`,
      ),
      loadOps(),
    ]);
    booking.value = detail;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load booking";
  } finally {
    loading.value = false;
  }
}

function onOpsUpdated(payload: AdminBookingOpsPayload): void {
  ops.value = payload;
}

async function applyPatch(
  patch: AdminRentalBookingPatchPayload,
): Promise<void> {
  if (!bookingId.value) return;
  updating.value = true;
  try {
    booking.value = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${bookingId.value}`,
      { method: "PATCH", body: patch },
    );
    toast.add({ title: "Booking updated", color: "success" });
  } catch (e) {
    toast.add({
      title: "Update failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    updating.value = false;
  }
}

async function markNoShow(): Promise<void> {
  if (!bookingId.value || !isOverdueConfirmed.value || markingNoShow.value)
    return;
  const reason = import.meta.client
    ? window.prompt("Optional no-show note for audit/support", "")
    : "";
  if (reason === null) return;
  markingNoShow.value = true;
  try {
    booking.value = await $fetch<AdminRentalBookingDetail>(
      `/api/admin/rental-bookings/${bookingId.value}/mark-no-show`,
      { method: "POST", body: { reason } },
    );
    await loadOps();
    toast.add({ title: "Booking marked as no-show", color: "success" });
  } catch (e) {
    toast.add({
      title: "Mark no-show failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    markingNoShow.value = false;
  }
}

if (import.meta.client) {
  onMounted(() => void load());
}

// ── Formatting helpers ──
function formatCurrency(value: number, currency = "THB"): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateOnly(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function unitLabel(unit: "day" | "week" | "month", count: number): string {
  if (unit === "day") return count === 1 ? "day" : "days";
  if (unit === "week") return count === 1 ? "week" : "weeks";
  return count === 1 ? "month" : "months";
}

function rentalStatusColor(s: RentalBookingStatus): BadgeColor {
  if (s === "confirmed") return "success";
  if (s === "picked_up") return "info";
  if (s === "returned") return "primary";
  if (s === "draft") return "warning";
  if (s === "no_show") return "warning";
  return "error";
}

function bangkokTodayLocalDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const isOverdueConfirmed = computed(
  () =>
    booking.value?.status === "confirmed" &&
    Boolean(booking.value.startDate) &&
    booking.value.startDate < bangkokTodayLocalDate(),
);

// Phase 2D-B6: CTA to resume booking deposit collection in POS V3.
// Only eligible when the booking is draft AND deposit is unpaid.
// Hides for paid, paid_confirm_failed, confirmed, cancelled, no_show, returned, picked_up.
const canResumeDepositCollection = computed(
  () =>
    booking.value?.status === "draft" &&
    booking.value?.bookingDepositPaymentStatus === "unpaid",
);

// Phase 2E-B2: CTA to resume pickup workflow in POS V3.
// Shown only when booking is confirmed (pickup-ready — staff still needs to complete handover).
// Hidden for draft, picked_up, returned, cancelled, no_show.
const canResumePosV3Pickup = computed(
  () => booking.value?.status === "confirmed",
);

const allowedStatuses = computed<RentalBookingStatus[]>(() =>
  booking.value
    ? (RENTAL_BOOKING_STATUS_TRANSITIONS[booking.value.status] ?? [])
    : [],
);

const breakdownLines = computed(() => {
  const bd = booking.value?.pricingBreakdown;
  if (!bd || !("lines" in bd)) return [];
  return bd.lines ?? [];
});

function printFormUrl(type: "pickup" | "return"): string {
  return `/admin/rental-bookings/${bookingId.value}/print?type=${type}`;
}

function documentPrintUrl(id: string): string {
  return `/admin/documents/${id}/print`;
}

function issuedDocumentPrintUrl(type: OperationalRentalDocumentType): string {
  const doc = operationalDocument(type);
  return doc ? documentPrintUrl(doc.id) : "#";
}

function documentFormType(
  type: OperationalRentalDocumentType,
): "pickup" | "return" {
  return documentTypeToPrintFormType(type);
}

function operationalDocument(
  type: OperationalRentalDocumentType,
): AdminIssuedDocumentSummary | null {
  return (
    ops.value?.issuedDocuments.find(
      (doc) => doc.documentType === type && doc.status !== "voided",
    ) ?? null
  );
}

function noShowForfeitureDocument(
  type: NoShowForfeitureDocumentType,
): AdminIssuedDocumentSummary | null {
  return (
    ops.value?.noShowForfeitureDocuments.find(
      (doc) => doc.documentType === type && doc.status !== "voided",
    ) ?? null
  );
}

function noShowForfeitureDocumentLabel(
  type: NoShowForfeitureDocumentType,
): string {
  return type === "rental_booking_no_show_forfeiture_notice"
    ? "No-show forfeiture notice"
    : "Booking Deposit forfeiture ordinary receipt";
}

const hasMissingNoShowForfeitureDocuments = computed(
  () =>
    booking.value?.status === "no_show" &&
    noShowForfeitureDocumentTypes.some(
      (type) => !noShowForfeitureDocument(type),
    ),
);

function canIssueDocument(type: OperationalRentalDocumentType): boolean {
  return operationalDocumentUiState(type).canIssue;
}

function canPreviewDocument(type: OperationalRentalDocumentType): boolean {
  return operationalDocumentUiState(type).canPreview;
}

function documentHelperText(type: OperationalRentalDocumentType): string {
  return operationalDocumentUiState(type).helperText;
}

function operationalDocumentUiState(type: OperationalRentalDocumentType) {
  return getOperationalDocumentUiState({
    documentType: type,
    bookingStatus: booking.value?.status,
    fulfillmentStatus: ops.value?.fulfillmentStatus,
  });
}

function openWindow(url: string): void {
  if (!import.meta.client || !url || url === "#") return;
  window.open(url, "_blank", "noopener");
}

function previewDocument(type: OperationalRentalDocumentType): void {
  if (!canPreviewDocument(type)) return;
  openWindow(printFormUrl(documentFormType(type)));
}

function reprintDocument(type: OperationalRentalDocumentType): void {
  const url = issuedDocumentPrintUrl(type);
  if (!url || url === "#") return;
  openWindow(url);
}

async function issueDocument(
  type: OperationalRentalDocumentType,
): Promise<void> {
  if (!bookingId.value) return;
  issuingDocument.value = type;
  try {
    const result = await $fetch<AdminDocumentIssueResponse>(
      "/api/admin/documents/issue",
      {
        method: "POST",
        body: {
          sourceType: "rental_booking",
          sourceId: bookingId.value,
          documentType: type,
        },
      },
    );
    await loadOps();
    toast.add({
      title: result.alreadyIssued
        ? "Document already issued"
        : "Document issued",
      description: result.document.documentNo ?? result.document.id,
      color: "success",
    });
    if (import.meta.client) window.open(result.printUrl, "_blank", "noopener");
  } catch (e) {
    toast.add({
      title: "Issue document failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    issuingDocument.value = null;
  }
}

const showBdcCard = computed(() => {
  const bdcDoc = ops.value?.bookingDepositConfirmationDocument;
  return !!bdcDoc && bdcDoc.state !== "not_applicable";
});

const bdcDocument = computed(
  () => ops.value?.bookingDepositConfirmationDocument ?? null,
);

function bdcPrintUrl(): string {
  const id = bdcDocument.value?.officialDocumentId;
  return id ? documentPrintUrl(id) : "#";
}

async function retryBdcDocument(): Promise<void> {
  if (!bookingId.value) return;
  retryingBdc.value = true;
  try {
    await $fetch(
      `/api/admin/rental-bookings/${bookingId.value}/documents/booking-deposit-confirmation/retry`,
      { method: "POST" },
    );
    await loadOps();
    toast.add({
      title: "Booking Deposit Confirmation document issued",
      color: "success",
    });
  } catch (e) {
    toast.add({
      title: "Document retry failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    retryingBdc.value = false;
  }
}

async function issueMissingNoShowDocuments(): Promise<void> {
  if (!bookingId.value || booking.value?.status !== "no_show") return;
  issuingNoShowDocuments.value = true;
  try {
    await $fetch(
      `/api/admin/rental-bookings/${bookingId.value}/no-show-documents/issue`,
      { method: "POST" },
    );
    await loadOps();
    toast.add({ title: "Missing no-show documents issued", color: "success" });
  } catch (e) {
    toast.add({
      title: "Issue no-show documents failed",
      description: e instanceof Error ? e.message : "Unknown error",
      color: "error",
    });
  } finally {
    issuingNoShowDocuments.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold">
          {{ booking?.assetCode || booking?.productName || "Rental booking" }}
        </h2>
        <p class="text-sm text-muted">Booking ID: {{ bookingId }}</p>
      </div>
      <UButton
        icon="bx:arrow-back"
        label="Back to orders"
        color="neutral"
        variant="ghost"
        to="/admin/orders"
      />
    </div>

    <div v-if="loading" class="space-y-3">
      <div class="h-24 animate-pulse rounded-xl bg-elevated" />
      <div class="h-40 animate-pulse rounded-xl bg-elevated" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      icon="bx:error-circle"
      title="Failed to load"
      :description="error"
    >
      <template #actions>
        <UButton size="sm" label="Retry" @click="void load()" />
      </template>
    </UAlert>

    <template v-else-if="booking">
      <!-- Status + transitions -->
      <UCard>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="rentalStatusColor(booking.status)" variant="subtle">
              Status: {{ booking.status }}
            </UBadge>
            <UBadge color="neutral" variant="soft">
              {{ booking.rentalDays }} day{{
                booking.rentalDays === 1 ? "" : "s"
              }}
            </UBadge>
            <UBadge v-if="booking.hubName" color="neutral" variant="soft">
              Hub: {{ booking.hubName }}
            </UBadge>
            <UBadge
              v-if="booking.storageBranchName"
              color="neutral"
              variant="soft"
            >
              Storage: {{ booking.storageBranchName }}
            </UBadge>
          </div>

          <UAlert
            v-if="isOverdueConfirmed"
            color="warning"
            icon="bx:time-five"
            title="Pickup date has passed and this booking is still confirmed"
            description="Staff may still complete a late pickup while the booking remains confirmed, or mark it as no-show if the customer did not arrive."
          />
          <UAlert
            v-else-if="booking.status === 'no_show'"
            color="warning"
            icon="bx:user-x"
            title="Marked as no-show"
            :description="`Booking Deposit retained / refund not applicable${booking.noShowAt ? ` · ${formatDate(booking.noShowAt)}` : ''}`"
          />

          <!-- Phase 2D-B6: Resume Booking Deposit collection CTA -->
          <UAlert
            v-if="canResumeDepositCollection"
            color="warning"
            icon="bx:credit-card"
            title="Booking Draft ยังไม่ได้รับชำระเงิน — ไปที่ POS V3 เพื่อรับมัดจำ"
            class="mb-2"
          >
            <template #description>
              <UButton
                size="sm"
                color="primary"
                variant="solid"
                icon="bx:credit-card"
                label="ดำเนินการรับเงินมัดจำการจอง"
                :to="`/admin/pos-v3?bookingId=${bookingId}`"
              />
            </template>
          </UAlert>

          <!-- Phase 2E-B2: Resume POS V3 Pickup CTA -->
          <!-- Shown when booking is confirmed — staff can continue pickup workflow in POS V3. -->
          <UAlert
            v-if="canResumePosV3Pickup"
            color="primary"
            icon="bx:store"
            title="ไปทำต่อใน POS V3"
            class="mb-2"
          >
            <template #description>
              <p class="mb-2 text-sm text-muted">
                เปิดหน้ารับของและทำต่อจากสถานะล่าสุดของ booking นี้
              </p>
              <UButton
                size="sm"
                color="primary"
                variant="solid"
                icon="bx:store"
                label="ไปทำต่อใน POS V3"
                :to="`/admin/pos-v3?bookingId=${bookingId}`"
              />
            </template>
          </UAlert>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="isOverdueConfirmed"
              size="sm"
              color="warning"
              variant="solid"
              icon="bx:user-x"
              label="Mark as No-show"
              :loading="markingNoShow"
              @click="void markNoShow()"
            />
          </div>

          <div v-if="allowedStatuses.length > 0">
            <p class="mb-1 text-xs font-semibold uppercase text-muted">
              Booking status
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="next in allowedStatuses"
                :key="`bs-${next}`"
                size="sm"
                variant="soft"
                :color="rentalStatusColor(next)"
                :loading="updating"
                @click="void applyPatch({ status: next })"
              >
                → {{ next }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold">Operational Documents</h3>
              <p class="text-xs text-muted">
                Issued pickup/return forms are immutable operational snapshots,
                not receipts or tax invoices.
              </p>
            </div>
          </div>
        </template>

        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="docType in operationalDocumentTypes"
            :key="docType"
            class="rounded-lg border border-default p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-medium">
                  {{
                    docType === "rental_pickup_form"
                      ? "Pickup / Handover Form"
                      : "Return Form"
                  }}
                </p>
                <template v-if="operationalDocument(docType)">
                  <p class="text-sm text-muted">
                    No. {{ operationalDocument(docType)?.documentNo || "—" }} ·
                    {{ operationalDocument(docType)?.status }}
                  </p>
                  <p class="text-xs text-muted">
                    Issued
                    {{
                      formatDate(operationalDocument(docType)?.issuedAt || "")
                    }}
                    · Print count
                    {{ operationalDocument(docType)?.printCount ?? 0 }}
                  </p>
                </template>
                <p v-else class="text-sm text-muted">
                  {{ documentHelperText(docType) }}
                </p>
              </div>
              <UBadge
                v-if="operationalDocument(docType)"
                color="success"
                variant="subtle"
              >
                Issued
              </UBadge>
              <UBadge v-else color="neutral" variant="soft">Not issued</UBadge>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <UButton
                v-if="!operationalDocument(docType)"
                size="sm"
                color="primary"
                variant="soft"
                icon="bx:file-plus"
                label="Issue & Print"
                :disabled="!canIssueDocument(docType)"
                :loading="issuingDocument === docType"
                @click="void issueDocument(docType)"
              />
              <UButton
                v-else
                size="sm"
                color="neutral"
                variant="soft"
                icon="bx:printer"
                label="Reprint"
                @click="reprintDocument(docType)"
              />
            </div>
          </div>
        </div>
      </UCard>

      <!-- Booking Deposit Confirmation Document card -->
      <UCard v-if="showBdcCard">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold">
                Booking Deposit Confirmation Document
              </h3>
              <p class="text-xs text-muted">
                เอกสารยืนยันการรับเงินมัดจำการจอง — non-tax confirmation issued
                at cash collection.
              </p>
            </div>
            <UBadge
              v-if="bdcDocument?.state === 'issued'"
              color="success"
              variant="subtle"
            >
              Issued
            </UBadge>
            <UBadge
              v-else-if="bdcDocument?.state === 'failed'"
              color="error"
              variant="soft"
            >
              Failed
            </UBadge>
            <UBadge
              v-else-if="bdcDocument?.state === 'missing'"
              color="warning"
              variant="soft"
            >
              Missing
            </UBadge>
            <UBadge
              v-else-if="bdcDocument?.state === 'pending'"
              color="neutral"
              variant="soft"
            >
              Pending
            </UBadge>
          </div>
        </template>

        <template v-if="bdcDocument?.state === 'issued'">
          <p class="text-sm">
            No.
            <span class="font-medium">{{ bdcDocument.documentNo || "—" }}</span>
          </p>
          <p class="text-xs text-muted">
            Issued {{ formatDate(bdcDocument.issuedAt || "") }} · Print count
            {{ bdcDocument.printCount }}
          </p>
        </template>
        <template v-else-if="bdcDocument?.state === 'failed'">
          <p class="text-sm text-error">
            Issuance failed.
            <span v-if="bdcDocument.errorCode" class="font-mono text-xs">
              ({{ bdcDocument.errorCode }})
            </span>
          </p>
          <p class="text-xs text-muted">
            Use the retry action to re-attempt document generation.
          </p>
        </template>
        <template v-else-if="bdcDocument?.state === 'missing'">
          <p class="text-sm text-warning">
            No issuance task found — the document was never issued for this
            booking deposit.
          </p>
          <p class="text-xs text-muted">
            Use the retry action to issue the document now.
          </p>
        </template>
        <template v-else-if="bdcDocument?.state === 'pending'">
          <p class="text-sm text-muted">
            Document issuance is in progress. Refresh to see the latest state.
          </p>
        </template>

        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-if="bdcDocument?.state === 'issued'"
            size="sm"
            color="neutral"
            variant="soft"
            icon="bx:printer"
            label="Open / print"
            @click="openWindow(bdcPrintUrl())"
          />
          <UButton
            v-if="bdcDocument?.canRetry"
            size="sm"
            color="warning"
            variant="soft"
            icon="bx:refresh"
            label="Retry issuance"
            :loading="retryingBdc"
            @click="void retryBdcDocument()"
          />
        </div>
      </UCard>

      <UCard v-if="booking.status === 'no_show'">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold">No-show Forfeiture Documents</h3>
              <p class="text-xs text-muted">
                Contractual no-show notice and non-tax ordinary receipt for
                forfeited Booking Deposit.
              </p>
            </div>
            <UButton
              v-if="hasMissingNoShowForfeitureDocuments"
              size="sm"
              color="warning"
              variant="soft"
              icon="bx:file-plus"
              label="Issue missing no-show documents"
              :loading="issuingNoShowDocuments"
              @click="void issueMissingNoShowDocuments()"
            />
          </div>
        </template>

        <UAlert
          v-if="hasMissingNoShowForfeitureDocuments"
          class="mb-3"
          color="warning"
          variant="soft"
          icon="bx:error-circle"
          title="One or more no-show documents are missing"
          description="Use the repair action only to reconcile a no-show booking whose Phase 3.1 event chain already exists."
        />
        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="docType in noShowForfeitureDocumentTypes"
            :key="docType"
            class="rounded-lg border border-warning/30 p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-medium">
                  {{ noShowForfeitureDocumentLabel(docType) }}
                </p>
                <template v-if="noShowForfeitureDocument(docType)">
                  <p class="text-sm text-muted">
                    No.
                    {{ noShowForfeitureDocument(docType)?.documentNo || "—" }} ·
                    {{ noShowForfeitureDocument(docType)?.status }}
                  </p>
                  <p class="text-xs text-muted">
                    Issued
                    {{
                      formatDate(
                        noShowForfeitureDocument(docType)?.issuedAt || "",
                      )
                    }}
                    · Print count
                    {{ noShowForfeitureDocument(docType)?.printCount ?? 0 }}
                  </p>
                </template>
                <p v-else class="text-sm text-muted">
                  Missing — use repair action if the no-show event chain is
                  valid.
                </p>
              </div>
              <UBadge
                v-if="noShowForfeitureDocument(docType)"
                color="success"
                variant="subtle"
              >
                Issued
              </UBadge>
              <UBadge v-else color="warning" variant="soft">Missing</UBadge>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <UButton
                v-if="noShowForfeitureDocument(docType)"
                size="sm"
                color="neutral"
                variant="soft"
                icon="bx:printer"
                label="Open / print"
                @click="
                  openWindow(
                    documentPrintUrl(
                      noShowForfeitureDocument(docType)?.id || '',
                    ),
                  )
                "
              />
            </div>
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Customer + Booker -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Customer / Booker</h3>
          </template>
          <div class="space-y-3 text-sm">
            <div
              v-if="booking.bookerName || booking.bookerPhone"
              class="space-y-1"
            >
              <p class="text-xs font-semibold uppercase text-muted">
                Booker (from booking form)
              </p>
              <p class="font-medium">
                {{ booking.bookerName || "—" }}
              </p>
              <a
                v-if="booking.bookerPhone"
                :href="`tel:${booking.bookerPhone}`"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <UIcon name="bx:phone" />
                {{ booking.bookerPhone }}
              </a>
            </div>
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase text-muted">Account</p>
              <p class="font-medium">
                {{ booking.customer.fullName || "Unnamed customer" }}
              </p>
              <a
                v-if="booking.customer.phone"
                :href="`tel:${booking.customer.phone}`"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <UIcon name="bx:phone" />
                {{ booking.customer.phone }}
              </a>
              <p v-else class="text-muted">No phone on file</p>
              <p class="text-xs text-muted">
                User ID:
                <span class="font-mono">{{ booking.customer.userId }}</span>
              </p>
            </div>
          </div>
        </UCard>

        <!-- Asset snapshot -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Asset</h3>
          </template>
          <div class="flex gap-3 text-sm">
            <img
              v-if="booking.assetThumbnail || booking.thumbnail"
              :src="booking.assetThumbnail || booking.thumbnail || ''"
              :alt="booking.assetName || booking.productName"
              class="h-20 w-20 shrink-0 rounded-lg object-cover"
            />
            <div class="space-y-1">
              <p class="font-medium">
                {{ booking.assetName || booking.productName }}
              </p>
              <p v-if="booking.assetCode" class="text-xs text-muted">
                Code: <span class="font-mono">{{ booking.assetCode }}</span>
              </p>
              <p v-if="booking.matchedProductName" class="text-xs text-muted">
                Matched product: {{ booking.matchedProductName }}
              </p>
              <p v-if="booking.skuId" class="text-xs text-muted">
                SKU: <span class="font-mono">{{ booking.skuId }}</span>
              </p>
            </div>
          </div>
        </UCard>
      </div>

      <AdminBookingHandoverItems
        :booking-id="bookingId"
        :booking-status="booking.status"
      />

      <!-- Rental period -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Rental period</h3>
            <p class="text-xs text-muted">
              Created {{ formatDate(booking.createdAt) }} · Updated
              {{ formatDate(booking.updatedAt) }}
            </p>
          </div>
        </template>
        <div class="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p class="text-xs font-semibold uppercase text-muted">Start</p>
            <p class="font-medium">{{ formatDateOnly(booking.startDate) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase text-muted">End</p>
            <p class="font-medium">{{ formatDateOnly(booking.endDate) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase text-muted">Duration</p>
            <p class="font-medium">
              {{ booking.rentalDays }} day{{
                booking.rentalDays === 1 ? "" : "s"
              }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Pricing breakdown -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">Pricing breakdown</h3>
        </template>

        <div class="grid gap-2 text-xs text-muted md:grid-cols-3">
          <p>
            Daily:
            {{ formatCurrency(booking.dailyRate, booking.currencyCode) }}
          </p>
          <p>
            Weekly:
            {{ formatCurrency(booking.weeklyRate, booking.currencyCode) }}
          </p>
          <p>
            Monthly:
            {{ formatCurrency(booking.monthlyRate, booking.currencyCode) }}
          </p>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-default text-xs uppercase text-muted">
              <tr>
                <th class="py-2">Tier</th>
                <th class="py-2 text-right">Rate</th>
                <th class="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, idx) in breakdownLines"
                :key="`bd-${idx}`"
                class="border-b border-default/40 last:border-b-0"
              >
                <td class="py-3 pr-3">
                  {{ line.count }} ×
                  {{ unitLabel(line.unit, line.count) }}
                </td>
                <td class="py-3 text-right">
                  {{ formatCurrency(line.rate, booking.currencyCode) }}
                </td>
                <td class="py-3 text-right font-medium">
                  {{ formatCurrency(line.subtotal, booking.currencyCode) }}
                </td>
              </tr>
              <tr v-if="breakdownLines.length === 0">
                <td colspan="3" class="py-3 text-center italic text-muted">
                  No tiered breakdown recorded.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 space-y-1 border-t border-default pt-4 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">Rental total</span>
            <span>
              {{ formatCurrency(booking.rentalTotal, booking.currencyCode) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">Deposit</span>
            <span>
              {{ formatCurrency(booking.depositAmount, booking.currencyCode) }}
            </span>
          </div>
          <div
            class="flex justify-between border-t border-default pt-2 text-base font-semibold"
          >
            <span>Total due at start</span>
            <span class="text-primary">
              {{
                formatCurrency(
                  booking.rentalTotal + booking.depositAmount,
                  booking.currencyCode,
                )
              }}
            </span>
          </div>
        </div>
      </UCard>

      <AdminBookingChecklists
        v-if="ops"
        :booking-id="bookingId"
        :checklists="ops.checklists"
        :templates="ops.templates"
        @updated="onOpsUpdated"
      />

      <AdminBookingDocuments
        v-if="ops"
        :booking-id="bookingId"
        :documents="ops.documents"
        @updated="onOpsUpdated"
      />
    </template>
  </div>
</template>
