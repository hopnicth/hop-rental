<script setup lang="ts">
import QrcodeVue from "qrcode.vue";

const { t } = useI18n();

type Doc = {
  id: string;
  documentType: string;
  documentNo: string | null;
  status: string;
} | null;
type Detail = {
  booking: Record<string, any>;
  money: Record<string, number | string>;
  payment: Record<string, string>;
  cancellation: Record<string, any> | null;
  refundRequest: Record<string, any> | null;
  refundProof: {
    exists: boolean;
    id?: string;
    mimeType?: string | null;
    fileSizeBytes?: number;
    createdAt?: string | null;
  };
  // [146] Staff's return memo — TEXT ONLY, never an amount or an obligation.
  returnMemo: { memo: string; lateDays: number } | null;
  /** Server-authoritative deposit regime (f_deposits_enabled). Gates DISPLAY only. */
  depositsEnabled: boolean;
  eligibility: { eligible: boolean; refundCutoffLocalDate: string } | null;
  documents: {
    bookingConfirmation: Doc;
    bookingDepositPaymentConfirmation: Doc;
    cancellationConfirmation: Doc;
    refundConfirmation: Doc;
    bookingDepositForfeitureReceipt: Doc;
    noShowForfeitureNotice: Doc;
  };
};

const route = useRoute();
const toast = useToast();
const { refreshBookings } = useBooking();
const bookingId = computed(() => String(route.params.bookingId || ""));
const detail = ref<Detail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const issuing = ref<string | null>(null);
const cancelOpen = ref(false);
const cancelling = ref(false);
const cancelError = ref<string | null>(null);
const documentIssueStatus = ref<string | null>(null);
const refundProofLoading = ref(false);
const depositSlips = ref<
  { id: string; originalFilename: string; status: string; uploadedAt: string }[]
>([]);
const canUploadDepositSlip = computed(
  () => detail.value?.booking.status === "draft",
);
const form = reactive({
  refundBankName: "",
  refundBankAccountNumber: "",
  refundBankAccountName: "",
  refundContactPhone: "",
  refundCustomerNote: "",
  confirmRefundDestinationAccuracy: false,
});

// [K-1 / mig 145] LAUNCH bookings are free: there is no deposit and no refund
// policy, so cancelling is a pure slot release and is always allowed while the
// booking is still confirmed. A booking WITH a paid deposit keeps the
// deposit-era rules (refund eligibility + cutoff) below.
const isLaunchBooking = computed(
  () => detail.value?.booking.bookingDepositPaymentStatus !== "paid",
);
const canCancelLaunch = computed(
  () => detail.value?.booking.status === "confirmed" && isLaunchBooking.value,
);
const canCancel = computed(
  () =>
    detail.value?.booking.status === "confirmed" &&
    detail.value?.booking.bookingDepositPaymentStatus === "paid" &&
    detail.value?.eligibility?.eligible === true,
);
const outsideCutoff = computed(
  () =>
    detail.value?.booking.status === "confirmed" &&
    detail.value?.booking.bookingDepositPaymentStatus === "paid" &&
    detail.value?.eligibility?.eligible === false,
);
const canIssueBookingConfirmation = computed(
  () =>
    detail.value?.booking.status === "confirmed" &&
    detail.value?.booking.bookingDepositPaymentStatus === "paid",
);
const hasCancelled = computed(
  () =>
    detail.value?.booking.status === "cancelled" ||
    !!detail.value?.cancellation,
);
const hasNoShow = computed(() => detail.value?.booking.status === "no_show");
const isRefunded = computed(
  () => detail.value?.refundRequest?.status === "refunded",
);
const refundAmountDue = computed(
  () =>
    detail.value?.refundRequest?.amount ??
    detail.value?.cancellation?.refundAmountDue ??
    detail.value?.money.bookingDepositPaid ??
    0,
);
const hasRefundProof = computed(
  () => detail.value?.refundProof?.exists === true,
);
const refundBankAccountNumberModel = computed({
  get: () => form.refundBankAccountNumber,
  set: (value: string) => {
    normalizeRefundBankAccountNumber(value);
  },
});
const documentEntries = computed(() => {
  const docs = detail.value?.documents;
  const entries = [
    {
      type: "rental_booking_confirmation",
      doc: docs?.bookingConfirmation ?? null,
    },
    {
      type: "rental_booking_cancellation_confirmation",
      doc: docs?.cancellationConfirmation ?? null,
    },
  ];
  if (docs?.refundConfirmation) {
    entries.push({
      type: "rental_booking_deposit_refund_confirmation",
      doc: docs.refundConfirmation,
    });
  }
  return entries;
});
const noShowDocumentEntries = computed(() => {
  const docs = detail.value?.documents;
  return [
    {
      type: "rental_booking_no_show_forfeiture_notice",
      doc: docs?.noShowForfeitureNotice ?? null,
    },
    {
      type: "booking_deposit_forfeiture_ordinary_receipt",
      doc: docs?.bookingDepositForfeitureReceipt ?? null,
    },
  ].filter((entry) => entry.doc);
});

useHead(() => ({
  title: detail.value
    ? t("rentalsPage.detail.pageTitle", {
        reference: detail.value.booking.reference,
      })
    : t("rentalsPage.detail.title"),
}));

function money(value: unknown, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}
function date(value: unknown) {
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeZone: "Asia/Bangkok",
      }).format(new Date(`${value}T00:00:00.000Z`))
    : "—";
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
function docLabel(type: string) {
  if (type === "rental_booking_confirmation")
    return t("rentalsPage.documents.types.rentalBookingConfirmation");
  if (type === "rental_booking_deposit_refund_confirmation")
    return t("rentalsPage.documents.types.bookingDepositRefundConfirmation");
  if (type === "booking_deposit_forfeiture_ordinary_receipt")
    return t("rentalsPage.documents.types.bookingDepositForfeitureReceipt");
  if (type === "rental_booking_no_show_forfeiture_notice")
    return t("rentalsPage.documents.types.noShowForfeitureNotice");
  return t("rentalsPage.documents.types.cancellationConfirmation");
}
function canIssueDocument(type: string) {
  if (type === "rental_booking_confirmation")
    return canIssueBookingConfirmation.value;
  return false;
}
function unavailableDocumentText(type: string) {
  if (type === "rental_booking_confirmation")
    return t("rentalsPage.documents.unavailable.bookingConfirmation");
  if (type === "rental_booking_cancellation_confirmation")
    return t("rentalsPage.documents.unavailable.cancellationConfirmation");
  return t("rentalsPage.documents.unavailable.refundConfirmation");
}

function statusText(status: unknown) {
  return t(`rentalsPage.status.${String(status || "draft")}`);
}
function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}
function normalizeRefundBankAccountNumber(value: unknown) {
  const normalized = digitsOnly(value);
  form.refundBankAccountNumber = normalized;
  return normalized;
}
function onRefundBankAccountNumberInput(event: Event) {
  const input =
    event.target instanceof HTMLInputElement
      ? event.target
      : event.currentTarget instanceof HTMLInputElement
        ? event.currentTarget
        : null;
  const normalized = normalizeRefundBankAccountNumber(
    input?.value ?? form.refundBankAccountNumber,
  );
  if (input && input.value !== normalized) input.value = normalized;
}
function friendlyCancelError(error: any) {
  const message = error?.statusMessage || error?.message || "";
  if (message === "REFUND_BANK_ACCOUNT_NUMBER_INVALID") {
    return t("rentalsPage.detail.refundBankAccountNumberInvalid");
  }
  return message || t("rentalsPage.detail.cancelFailed");
}
function resetForm() {
  Object.assign(form, {
    refundBankName: "",
    refundBankAccountNumber: "",
    refundBankAccountName: "",
    refundContactPhone: "",
    refundCustomerNote: "",
    confirmRefundDestinationAccuracy: false,
  });
  cancelError.value = null;
}

async function loadDetail() {
  if (!bookingId.value) return;
  loading.value = true;
  error.value = null;
  try {
    detail.value = await $fetch<Detail>(
      `/api/user/rental-bookings/${encodeURIComponent(bookingId.value)}`,
    );
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : t("rentalsPage.detail.loadFailed");
  } finally {
    loading.value = false;
  }
}
async function loadDepositSlips() {
  if (!bookingId.value) return;
  try {
    const res = await $fetch<{
      slips: {
        id: string;
        originalFilename: string;
        status: string;
        uploadedAt: string;
      }[];
    }>(
      `/api/user/rental-bookings/${encodeURIComponent(bookingId.value)}/deposit-slips`,
    );
    depositSlips.value = res.slips ?? [];
  } catch {
    depositSlips.value = [];
  }
}
async function issueDoc(
  type:
    | "rental_booking_confirmation"
    | "rental_booking_deposit_payment_confirmation",
) {
  if (!detail.value || issuing.value) return;
  issuing.value = type;
  try {
    const res = await $fetch<{ printUrl: string }>(
      `/api/user/rental-bookings/${encodeURIComponent(bookingId.value)}/documents/${type}`,
      { method: "POST" },
    );
    await loadDetail();
    await navigateTo(res.printUrl, { open: { target: "_blank" } });
  } catch (e) {
    toast.add({
      title:
        e instanceof Error
          ? e.message
          : t("rentalsPage.documents.unavailableToast"),
      color: "error",
    });
  } finally {
    issuing.value = null;
  }
}
async function openRefundProof() {
  if (!detail.value || refundProofLoading.value) return;
  refundProofLoading.value = true;
  try {
    const result = await $fetch<{ signedUrl: string }>(
      `/api/user/rental-bookings/${encodeURIComponent(bookingId.value)}/refund-proof`,
    );
    if (import.meta.client) window.open(result.signedUrl, "_blank", "noopener");
  } catch (e) {
    toast.add({
      title:
        e instanceof Error
          ? e.message
          : t("rentalsPage.detail.refundProofOpenFailed"),
      color: "error",
    });
  } finally {
    refundProofLoading.value = false;
  }
}
async function submitCancel() {
  if ((!canCancel.value && !canCancelLaunch.value) || cancelling.value) return;
  // [F-1] Capture the regime BEFORE the awaits below. loadDetail() refetches the
  // booking as `cancelled`, and canCancelLaunch requires status === "confirmed",
  // so reading it after the refetch always yields false and the launch success
  // toast could never fire — the customer was told a refund request had been
  // created when a launch cancel creates none.
  const wasLaunchCancel = canCancelLaunch.value;
  cancelling.value = true;
  cancelError.value = null;
  try {
    const result = await $fetch<{ documentIssueStatus?: string }>(
      `/api/user/rental-bookings/${encodeURIComponent(bookingId.value)}/cancel`,
      { method: "POST", body: { ...form } },
    );
    documentIssueStatus.value = result.documentIssueStatus ?? null;
    cancelOpen.value = false;
    resetForm();
    await loadDetail();
    await refreshBookings();
    toast.add({
      title: wasLaunchCancel
        ? t("rentalsPage.detail.cancelLaunchSuccess")
        : t("rentalsPage.detail.cancelSuccessRefundRequest"),
      color: "success",
    });
  } catch (e: any) {
    cancelError.value = friendlyCancelError(e);
  } finally {
    cancelling.value = false;
  }
}

watch(
  bookingId,
  () => {
    void loadDetail();
    void loadDepositSlips();
  },
  { immediate: true },
);
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-4">
      <UButton to="/user/rentals" variant="ghost" icon="bx:arrow-back">{{
        t("rentalsPage.detail.backToList")
      }}</UButton>
    </div>
    <UCard v-if="loading"
      ><div class="py-10 text-center text-muted">
        {{ t("rentalsPage.detail.loading") }}
      </div></UCard
    >
    <UAlert
      v-else-if="error"
      color="error"
      icon="bx:error-circle"
      :title="error"
    />
    <div v-else-if="detail" class="space-y-6">
      <UCard
        ><template #header
          ><div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 class="text-2xl font-bold">
                {{
                  detail.booking.itemName ||
                  t("rentalsPage.detail.fallbackBookingTitle")
                }}
              </h1>
              <p class="text-sm text-muted">
                {{
                  t("rentalsPage.detail.bookingReference", {
                    reference: detail.booking.reference,
                  })
                }}
              </p>
            </div>
            <div class="flex gap-2">
              <UBadge>{{ statusText(detail.booking.status) }}</UBadge
              ><!-- Deposit DISPLAY gate (decisions.md 2026-07-26 addendum). A
                   launch booking carries no deposit, so a deposit chip on it is
                   fiction AND a bare-มัดจำ exposure. Ruling (a-ก): the slot is
                   EMPTY at launch — no chip, no replacement text. The deposit-era
                   markup below is PRESERVED behind the server-authoritative flag,
                   never deleted, so revival is a config flip.
                   The flag is `depositsEnabled`, NOT `isLaunchBooking`: that
                   predicate is `bookingDepositPaymentStatus !== "paid"` and would
                   also swallow deposit-era pending/failed/expired bookings, whose
                   deposit status the customer must still see. -->
              <UBadge v-if="detail.depositsEnabled" color="info">{{
                t("rentalsPage.detail.depositStatus", {
                  status: detail.booking.bookingDepositPaymentStatus,
                })
              }}</UBadge>
            </div>
          </div></template
        >
        <UAlert
          v-if="hasNoShow"
          class="mb-4"
          color="warning"
          icon="bx:user-x"
          :title="t('rentalsPage.detail.noShowTitle')"
          :description="t('rentalsPage.detail.noShowDesc')"
        />
        <!-- [146] RECORD-BUT-NO-MONEY memo. Neutral colour and no currency
             formatting on purpose: this is a note, not a charge and not a
             balance. Late days are stated as a fact, never as a penalty. -->
        <UAlert
          v-if="detail.returnMemo"
          class="mb-4"
          color="neutral"
          variant="soft"
          icon="bx:note"
          :title="t('rentalsPage.detail.returnMemoTitle')"
        >
          <template #description>
            <p v-if="detail.returnMemo.lateDays > 0" class="mb-1 font-medium">
              {{
                t("rentalsPage.detail.returnMemoLateDays", {
                  count: detail.returnMemo.lateDays,
                })
              }}
            </p>
            <p class="whitespace-pre-line">{{ detail.returnMemo.memo }}</p>
          </template>
        </UAlert>
        <div class="grid gap-4 md:grid-cols-3">
          <p>
            <b>{{ t("rentalsPage.rentalPeriod") }}</b
            ><br />{{ date(detail.booking.startDate) }} →
            {{ date(detail.booking.endDate) }} ·
            {{
              t("rentalsPage.detail.days", { count: detail.booking.rentalDays })
            }}
          </p>
          <p>
            <b>{{ t("rentalsPage.pickupHub") }}</b
            ><br />{{ detail.booking.hubName || "—" }}
          </p>
          <p>
            <b>{{ t("rentalsPage.bookerName") }}</b
            ><br />{{ detail.booking.bookerName || "—" }} ·
            {{ detail.booking.bookerPhone || "—" }}
          </p>
        </div></UCard
      >
      <!-- Pay / upload the Booking Deposit on the central payment request page. -->
      <PaymentRequestRelatedCard
        v-if="canUploadDepositSlip"
        target-type="rental_booking_deposit"
        :target-id="detail.booking.id"
      />

      <PaymentSlipHistory
        v-if="depositSlips.length"
        :slips="depositSlips"
      />
      <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
        <UCard
          ><template #header
            ><h2 class="font-semibold">
              {{ t("rentalsPage.detail.rentalSummary") }}
            </h2></template
          >
          <div class="space-y-2 text-sm">
            <p>
              <b>{{ t("rentalsPage.detail.item") }}:</b>
              {{ detail.booking.itemName || "—" }}
            </p>
            <p>
              <b>{{ t("rentalsPage.detail.asset") }}:</b>
              {{ detail.booking.assetCode || "—" }}
            </p>
            <p>
              <b>{{ t("rentalsPage.detail.quantity") }}:</b> 1
            </p>
          </div></UCard
        >
        <UCard v-if="!hasCancelled && !hasNoShow"
          ><template #header
            ><h2 class="font-semibold">
              {{ t("rentalsPage.detail.bookingQr") }}
            </h2></template
          >
          <div class="text-center">
            <div class="mx-auto inline-block rounded-xl border bg-white p-4">
              <QrcodeVue
                :value="detail.booking.qrValue"
                :size="180"
                level="H"
              />
            </div>
            <p class="mt-3 text-sm text-muted">
              {{ t("rentalsPage.detail.bookingQrNote") }}
            </p>
          </div></UCard
        >
      </div>
      <UCard
        ><template #header
          ><h2 class="font-semibold">
            {{ t("rentalsPage.detail.paymentSummary") }}
          </h2></template
        >
        <div class="grid gap-3 text-sm md:grid-cols-4">
          <!-- Deposit DISPLAY gate: these two cells and the footnote below are
               deposit-era money. On a launch booking they render ฿0.00 and bare
               มัดจำ — fiction plus a glossary exposure. Hidden behind the flag,
               markup preserved (decisions.md 2026-07-26 addendum). -->
          <p v-if="detail.depositsEnabled">
            {{ t("rentalsPage.detail.bookingDepositPaid") }}<br /><b>{{
              money(
                detail.money.bookingDepositPaid,
                detail.money.currencyCode as string,
              )
            }}</b>
          </p>
          <p>
            {{ t("rentalsPage.detail.rentalFeeDueAtPickup") }}<br /><b>{{
              money(
                detail.money.rentalFeeDueAtPickup,
                detail.money.currencyCode as string,
              )
            }}</b>
          </p>
          <p v-if="detail.depositsEnabled">
            {{ t("rentalsPage.detail.remainingDepositDueAtPickup") }}<br /><b>{{
              money(
                detail.money.remainingRefundableSecurityDepositDueAtPickup,
                detail.money.currencyCode as string,
              )
            }}</b>
          </p>
          <p>
            {{ t("rentalsPage.detail.totalDueAtPickup") }}<br /><b>{{
              money(
                detail.money.totalDueAtPickup,
                detail.money.currencyCode as string,
              )
            }}</b>
          </p>
        </div>
        <p v-if="detail.depositsEnabled" class="mt-4 text-xs text-muted">
          {{ t("rentalsPage.detail.depositOperationalNote") }}
        </p></UCard
      >
      <UCard
        ><template #header
          ><h2 class="font-semibold">
            {{ t("rentalsPage.documents.title") }}
          </h2></template
        >
        <div class="grid gap-3 md:grid-cols-3">
          <div
            v-for="entry in documentEntries"
            :key="entry.type"
            class="rounded-lg border p-4"
          >
            <p class="font-medium">{{ docLabel(entry.type) }}</p>
            <p class="text-xs text-muted">
              {{
                entry.doc?.documentNo || t("rentalsPage.documents.notIssuedYet")
              }}
            </p>
            <UButton
              v-if="entry.doc"
              class="mt-3"
              size="sm"
              :to="`/user/documents/${entry.doc.id}/print`"
              target="_blank"
              >{{ t("rentalsPage.documents.viewPrint") }}</UButton
            ><UButton
              v-else-if="canIssueDocument(entry.type)"
              class="mt-3"
              size="sm"
              :loading="issuing === entry.type"
              @click="issueDoc(entry.type as any)"
              >{{ t("rentalsPage.documents.issue") }}</UButton
            >
            <p v-else class="mt-3 text-xs text-muted">
              {{ unavailableDocumentText(entry.type) }}
            </p>
          </div>
        </div></UCard
      >
      <UCard v-if="noShowDocumentEntries.length > 0">
        <template #header>
          <div>
            <h2 class="font-semibold">
              {{ t("rentalsPage.documents.noShowForfeitureTitle") }}
            </h2>
            <p class="text-xs text-muted">
              {{ t("rentalsPage.documents.noShowForfeitureDesc") }}
            </p>
          </div>
        </template>
        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="entry in noShowDocumentEntries"
            :key="entry.type"
            class="rounded-lg border border-warning/30 p-4"
          >
            <p class="font-medium">{{ docLabel(entry.type) }}</p>
            <p class="text-xs text-muted">
              {{
                entry.doc?.documentNo || t("rentalsPage.documents.notIssuedYet")
              }}
            </p>
            <UButton
              v-if="entry.doc"
              class="mt-3"
              size="sm"
              color="warning"
              variant="soft"
              :to="`/user/documents/${entry.doc.id}/print`"
              target="_blank"
            >
              {{ t("rentalsPage.documents.viewPrint") }}
            </UButton>
          </div>
        </div>
      </UCard>
      <UCard id="cancel-refund" class="scroll-mt-24 border-warning/30"
        ><template #header
          ><div>
            <!-- [F-2] LAUNCH bookings carry no money, so the deposit/refund
                 framing must not appear on them. The deposit-era copy stays for
                 the (135-gated) deposit path. -->
            <h2 class="font-semibold">
              {{
                canCancelLaunch
                  ? t("rentalsPage.detail.cancelLaunchSectionTitle")
                  : t("rentalsPage.detail.cancelRefundTitle")
              }}
            </h2>
            <p v-if="!canCancelLaunch" class="text-xs text-muted">
              {{ t("rentalsPage.detail.cancelRefundSubtitle") }}
            </p>
          </div></template
        >
        <UAlert
          v-if="hasNoShow"
          color="warning"
          icon="bx:user-x"
          :title="t('rentalsPage.detail.noShowRefundTitle')"
          :description="t('rentalsPage.detail.noShowRefundDesc')"
        />
        <!-- [K-1] LAUNCH booking: free, so no refund figures and no cutoff —
             cancelling simply releases the slot. -->
        <div v-else-if="canCancelLaunch" class="space-y-4">
          <UAlert
            color="warning"
            icon="bx:info-circle"
            :title="t('rentalsPage.detail.cancelLaunchTitle')"
            :description="t('rentalsPage.detail.cancelLaunchDesc')"
          />
          <UButton color="error" icon="bx:x-circle" @click="cancelOpen = true">{{
            t("rentalsPage.detail.cancelLaunchSubmitOpen")
          }}</UButton>
        </div>
        <div v-else-if="canCancel" class="space-y-4">
          <UAlert
            color="warning"
            icon="bx:info-circle"
            :title="t('rentalsPage.detail.cancelEligibleTitle')"
            :description="
              t('rentalsPage.detail.cancelEligibleDesc', {
                amount: money(
                  refundAmountDue,
                  detail.money.currencyCode as string,
                ),
              })
            "
          />
          <div
            class="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"
          >
            <p>
              {{ t("rentalsPage.detail.refundCutoff") }}:
              <b>{{ detail.eligibility?.refundCutoffLocalDate || "—" }}</b>
            </p>
            <p class="mt-1 text-muted">
              {{ t("rentalsPage.detail.cancelSubmitNote") }}
            </p>
          </div>
          <UButton
            color="error"
            icon="bx:x-circle"
            @click="cancelOpen = true"
            >{{ t("rentalsPage.detail.cancelSubmitOpen") }}</UButton
          >
        </div>
        <UAlert
          v-else-if="outsideCutoff"
          color="warning"
          icon="bx:phone"
          :title="t('rentalsPage.detail.outsideCutoffTitle')"
          :description="t('rentalsPage.detail.outsideCutoffDesc')"
        />
        <div v-else-if="hasCancelled" class="space-y-3">
          <UAlert
            :color="isRefunded ? 'success' : 'info'"
            icon="bx:check-circle"
            :title="
              isRefunded
                ? t('rentalsPage.detail.refundedTitle')
                : t('rentalsPage.detail.cancelledPendingRefundTitle')
            "
            :description="
              isRefunded
                ? t('rentalsPage.detail.refundedDesc', {
                    date: dateTime(detail.refundRequest?.refundedAt),
                  })
                : t('rentalsPage.detail.cancelledPendingRefundDesc', {
                    date: dateTime(detail.cancellation?.cancelledAt),
                    status:
                      detail.refundRequest?.status || 'pending_admin_review',
                  })
            "
          />
          <p class="text-sm">
            {{ t("rentalsPage.detail.refundAmountDue") }}:
            <b>{{
              money(refundAmountDue, detail.money.currencyCode as string)
            }}</b>
          </p>
          <section
            v-if="hasRefundProof"
            id="refund-proof"
            class="rounded-lg border p-3"
          >
            <p class="font-medium">
              {{ t("rentalsPage.detail.refundProofTitle") }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ t("rentalsPage.detail.refundProofAvailable") }}
            </p>
            <UButton
              class="mt-3"
              size="sm"
              icon="bx:file"
              :loading="refundProofLoading"
              @click="openRefundProof"
              >{{ t("rentalsPage.detail.viewRefundProof") }}</UButton
            >
          </section>
          <UButton
            v-if="detail.documents.cancellationConfirmation"
            size="sm"
            variant="outline"
            :to="`/user/documents/${detail.documents.cancellationConfirmation.id}/print`"
            target="_blank"
            >{{ t("rentalsPage.detail.viewPrintCancellation") }}</UButton
          >
          <UButton
            v-if="detail.documents.refundConfirmation"
            size="sm"
            variant="outline"
            :to="`/user/documents/${detail.documents.refundConfirmation.id}/print`"
            target="_blank"
            >{{ t("rentalsPage.detail.viewPrintRefund") }}</UButton
          >
        </div>
        <p v-else class="text-sm text-muted">
          {{ t("rentalsPage.detail.notCancellable") }}
        </p>
      </UCard>
    </div>
    <UModal
      v-model:open="cancelOpen"
      :title="
        canCancelLaunch
          ? t('rentalsPage.detail.cancelLaunchModalTitle')
          : t('rentalsPage.detail.cancelModalTitle')
      "
      :dismissible="!cancelling"
      ><template #body
        ><div class="space-y-3">
          <!-- [K-1] LAUNCH booking: nothing was paid, so no refund destination
               is collected — only a confirmation. -->
          <template v-if="canCancelLaunch">
            <UAlert
              color="warning"
              :description="t('rentalsPage.detail.cancelLaunchModalDesc')"
            />
            <UAlert v-if="cancelError" color="error" :title="cancelError" />
          </template>
          <template v-else>
          <UAlert
            color="warning"
            :title="t('rentalsPage.detail.cancelModalWarningTitle')"
            :description="t('rentalsPage.detail.cancelModalWarningDesc')"
          /><UInput
            v-model="form.refundBankName"
            :placeholder="t('rentalsPage.detail.refundBankName')"
          /><UInput
            v-model="refundBankAccountNumberModel"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :placeholder="t('rentalsPage.detail.refundBankAccountNumber')"
            @input="onRefundBankAccountNumberInput"
          />
          <p class="text-xs text-muted">
            {{ t("rentalsPage.detail.refundBankAccountNumberHelper") }}
          </p>
          <UInput
            v-model="form.refundBankAccountName"
            :placeholder="t('rentalsPage.detail.refundBankAccountName')"
          /><UInput
            v-model="form.refundContactPhone"
            :placeholder="t('rentalsPage.detail.refundContactPhone')"
          /><UTextarea
            v-model="form.refundCustomerNote"
            :placeholder="t('rentalsPage.detail.refundCustomerNote')"
          /><UCheckbox
            v-model="form.confirmRefundDestinationAccuracy"
            :label="t('rentalsPage.detail.confirmRefundDestinationAccuracy')"
          /><UAlert
            v-if="cancelError"
            color="error"
            :title="cancelError"
          /></template></div></template
      ><template #footer
        ><div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            :disabled="cancelling"
            @click="cancelOpen = false"
            >{{
              canCancelLaunch
                ? t("rentalsPage.detail.cancelLaunchBack")
                : t("rentalsPage.cancelKeep")
            }}</UButton
          ><UButton
            color="error"
            :loading="cancelling"
            :disabled="
              cancelling ||
              (!canCancelLaunch && !form.confirmRefundDestinationAccuracy)
            "
            @click="submitCancel"
            >{{
              canCancelLaunch
                ? t("rentalsPage.detail.cancelLaunchConfirm")
                : t("rentalsPage.detail.confirmCancellation")
            }}</UButton
          >
        </div></template
      ></UModal
    >
  </UContainer>
</template>
