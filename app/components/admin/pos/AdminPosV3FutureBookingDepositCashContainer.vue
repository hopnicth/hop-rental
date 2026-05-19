<script setup lang="ts">
interface DraftBookingResult {
  booking: {
    id: string;
    status: string;
    asset: {
      id: string;
      code: string | null;
      name: string;
      thumbnailUrl: string | null;
    };
    customer: {
      kind: "account" | "walk_in";
      userId: string | null;
      walkInPhone: string | null;
      bookerName: string | null;
      bookerPhone: string | null;
    };
    branch: { id: string; code: string; name: string };
    dates: {
      startDate: string;
      endDate: string;
      customerReturnDate: string;
      rentalDays: number;
    };
  };
  quote: {
    currencyCode: string;
    rentalTotalAmount: number;
    requiredSecurityDepositAmount: number;
    bookingDepositDueNow: number;
    remainingSecurityDepositDueAtPickup: number;
    estimatedPickupDueAmount: number;
  };
  payment: { bookingDepositPaymentStatus: string; paymentRequired: boolean };
  warnings: string[];
}

interface FinalizationResult {
  status: string;
  paymentAttemptId: string;
  bookingDepositPaidAmount: number;
  currencyCode: string;
  booking?: {
    id: string;
    status: string;
    bookingDepositPaymentStatus: string;
    bookingDepositPaidAmount: number;
    currencyCode: string;
  };
  warnings?: string[];
  idempotent?: boolean;
  /** Best-effort document issuance result — only present when status === "confirmed" */
  document?: {
    status: "issued" | "failed";
    taskId?: string | null;
    officialDocumentId?: string | null;
    documentNo?: string | null;
    alreadyIssued?: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
  };
}

const props = defineProps<{ draftResult: DraftBookingResult }>();
const emit = defineEmits<{
  "booking-confirmed": [result: FinalizationResult];
}>();

// Cash tendered amount: what the customer hands over (editable by staff)
const cashTenderedAmount = ref(props.draftResult.quote.bookingDepositDueNow);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const finalizationResult = ref<FinalizationResult | null>(null);

// Idempotency key: stable per booking ID; regenerate when a new draft is passed.
// Does not depend on cashTenderedAmount — backend payload is always bookingDepositDueNow
const idempotencyKey = ref(crypto.randomUUID());
watch(
  () => props.draftResult.booking.id,
  () => {
    idempotencyKey.value = crypto.randomUUID();
    cashTenderedAmount.value = props.draftResult.quote.bookingDepositDueNow;
    finalizationResult.value = null;
    submitError.value = null;
  },
);

const ZERO_DUE_WARNING = "ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED";
const isZeroDue = computed(
  () => props.draftResult.quote.bookingDepositDueNow <= 0,
);
const isConfirmed = computed(
  () => finalizationResult.value?.status === "confirmed",
);
const isDegradedSuccess = computed(
  () => finalizationResult.value?.status === "paid_confirm_failed",
);
// Document sub-states — only meaningful when isConfirmed is true
const isDocumentIssued = computed(
  () =>
    isConfirmed.value &&
    finalizationResult.value?.document?.status === "issued",
);
const isDocumentFailed = computed(
  () =>
    isConfirmed.value &&
    finalizationResult.value?.document?.status === "failed",
);

// Normalize paid amount/currency across both response shapes:
//   confirmed:           values are nested under finalizationResult.booking
//   paid_confirm_failed: values are at top level
const displayedPaidAmount = computed(
  () =>
    finalizationResult.value?.booking?.bookingDepositPaidAmount ??
    finalizationResult.value?.bookingDepositPaidAmount ??
    0,
);
const displayedCurrencyCode = computed(
  () =>
    finalizationResult.value?.booking?.currencyCode ??
    finalizationResult.value?.currencyCode ??
    "THB",
);

// Cashier UX: change amount = cash tendered - booking deposit due
const changeAmount = computed(() =>
  Math.max(
    cashTenderedAmount.value - props.draftResult.quote.bookingDepositDueNow,
    0,
  ),
);

// Guard: cash tendered must be >= booking deposit due
const isCashTenderedInsufficient = computed(
  () => cashTenderedAmount.value < props.draftResult.quote.bookingDepositDueNow,
);

const canSubmit = computed(() => {
  if (
    isSubmitting.value ||
    isZeroDue.value ||
    !props.draftResult.booking.id ||
    isCashTenderedInsufficient.value
  )
    return false;
  return cashTenderedAmount.value > 0;
});

async function submitCashPayment() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  submitError.value = null;
  try {
    // Backend payload always sends the fixed Booking Deposit Due amount.
    // cashTenderedAmount and changeAmount are cashier UI concerns only.
    const result = await $fetch<FinalizationResult>(
      `/api/admin/pos-v3/rental-bookings/${encodeURIComponent(props.draftResult.booking.id)}/booking-deposit-payments`,
      {
        method: "POST",
        body: {
          idempotencyKey: idempotencyKey.value,
          paymentMethod: "cash",
          amount: props.draftResult.quote.bookingDepositDueNow,
        },
      },
    );
    finalizationResult.value = result;
    // Emit only for confirmed booking — not for paid_confirm_failed
    if (result.status === "confirmed") {
      emit("booking-confirmed", result);
    }
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Payment finalization failed";
    const code = (err as { statusCode?: number })?.statusCode;
    submitError.value = code ? `[${code}] ${msg}` : msg;
  } finally {
    isSubmitting.value = false;
  }
}

function fmt(value: number, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

/** Open the BDC print route in a new tab using the issued officialDocumentId. */
function openBookingDepositDocumentPrint() {
  const docId = finalizationResult.value?.document?.officialDocumentId;
  const bookingId =
    finalizationResult.value?.booking?.id || props.draftResult.booking.id;
  if (!docId) return;
  window.open(
    `/admin/documents/${encodeURIComponent(docId)}/print?bookingId=${encodeURIComponent(bookingId)}`,
    "_blank",
  );
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Collect Booking Deposit</h2>
          <p class="text-sm text-muted">
            รับเงิน Booking Deposit เป็นเงินสด · ยืนยัน Future Booking Draft
          </p>
        </div>
        <UBadge
          :color="
            isConfirmed ? 'success' : isDegradedSuccess ? 'warning' : 'neutral'
          "
          variant="soft"
        >
          {{
            isConfirmed
              ? "Confirmed"
              : isDegradedSuccess
                ? "Review Required"
                : "Awaiting Deposit"
          }}
        </UBadge>
      </div>
    </template>

    <!-- Confirmed success -->
    <div v-if="isConfirmed && finalizationResult" class="space-y-4">
      <UAlert
        color="success"
        variant="soft"
        title="Booking Deposit received"
        description="Booking confirmed · Future rental is now ready for pickup on the booked date."
      />

      <div class="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <p class="text-muted">Booking ID</p>
          <p class="font-mono text-xs font-semibold">
            {{ finalizationResult.booking?.id || draftResult.booking.id }}
          </p>
          <UBadge size="sm" color="success" variant="soft">confirmed</UBadge>
        </div>
        <div>
          <p class="text-muted">Paid</p>
          <p class="font-semibold">
            {{ fmt(displayedPaidAmount, displayedCurrencyCode) }}
          </p>
          <UBadge size="sm" color="neutral" variant="soft">Cash</UBadge>
        </div>
        <div>
          <p class="text-muted">Payment attempt</p>
          <p class="font-mono text-xs">
            {{ finalizationResult.paymentAttemptId }}
          </p>
        </div>
      </div>

      <!-- Document issued: print CTA -->
      <div v-if="isDocumentIssued" class="space-y-3 pt-1">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="success" variant="soft" icon="bx:file">
            เอกสารยืนยันพร้อมพิมพ์
          </UBadge>
          <span
            v-if="finalizationResult.document?.documentNo"
            class="font-mono text-xs text-muted"
          >
            {{ finalizationResult.document.documentNo }}
          </span>
        </div>
        <UButton
          icon="bx:printer"
          color="primary"
          variant="soft"
          @click="openBookingDepositDocumentPrint"
        >
          พิมพ์เอกสารยืนยันการรับเงินมัดจำการจอง
        </UButton>
      </div>

      <!-- Document failed: confirmed but document not ready — must NOT show print CTA -->
      <div v-else-if="isDocumentFailed" class="space-y-3 pt-1">
        <UAlert
          color="success"
          variant="soft"
          title="การจองสำเร็จแล้ว · รับเงินมัดจำแล้ว"
          description="ไม่ต้องรับเงินซ้ำ"
        />
        <UAlert
          color="warning"
          variant="soft"
          title="เอกสารยังเตรียมไม่สำเร็จ"
          description="การรับเงินและการยืนยันการจองสำเร็จแล้ว ไม่ต้องรับเงินซ้ำ กรุณาติดตามการออกเอกสารภายหลังตามขั้นตอนของระบบ"
        />
        <p
          v-if="finalizationResult.document?.errorCode"
          class="font-mono text-xs text-muted"
        >
          Error: {{ finalizationResult.document.errorCode }}
        </p>
        <UButton
          icon="bx:detail"
          color="neutral"
          variant="soft"
          :to="`/admin/rental-bookings/${encodeURIComponent(finalizationResult.booking?.id || draftResult.booking.id)}`"
        >
          ดูรายละเอียดการจอง
        </UButton>
      </div>
    </div>

    <!-- Degraded success: paid_confirm_failed -->
    <div v-else-if="isDegradedSuccess && finalizationResult" class="space-y-4">
      <UAlert
        color="warning"
        variant="soft"
        title="Cash payment recorded — manual review required"
        description="Cash was collected and recorded. Booking confirmation did not complete automatically. Staff or admin manual review is required before this booking is active."
      />
      <div class="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p class="text-muted">Booking ID</p>
          <p class="font-mono font-semibold">{{ draftResult.booking.id }}</p>
          <UBadge size="sm" color="warning" variant="soft"
            >paid_confirm_failed</UBadge
          >
        </div>
        <div>
          <p class="text-muted">Amount collected</p>
          <p class="font-semibold">
            {{
              fmt(
                finalizationResult.bookingDepositPaidAmount,
                finalizationResult.currencyCode,
              )
            }}
          </p>
          <p class="text-xs text-muted">
            Payment ID: {{ finalizationResult.paymentAttemptId }}
          </p>
        </div>
      </div>
    </div>

    <!-- Main cash finalization form -->
    <div v-else class="space-y-5">
      <!-- Processing state: body-level loading panel shown while API call is in flight -->
      <UAlert
        v-if="isSubmitting"
        color="info"
        variant="soft"
        icon="bx:loader-circle"
        title="กำลังดำเนินการ..."
        description="กำลังบันทึกการรับเงินและยืนยันการจอง · กำลังเตรียมเอกสารยืนยันการรับเงินมัดจำการจอง"
      />

      <!-- E2: Draft Booking Summary (read-only staff review) -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Draft Booking Summary
        </p>
        <div class="rounded-xl border border-default bg-elevated/50 p-4">
          <div class="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p class="text-muted">Booking ID</p>
              <p class="font-mono text-xs font-semibold">
                {{ draftResult.booking.id }}
              </p>
              <UBadge size="sm" color="neutral" variant="soft">draft</UBadge>
            </div>
            <div>
              <p class="text-muted">Asset</p>
              <p class="font-semibold">{{ draftResult.booking.asset.name }}</p>
              <p class="text-xs text-muted">
                {{ draftResult.booking.asset.code }}
              </p>
            </div>
            <div>
              <p class="text-muted">Customer</p>
              <p class="font-semibold">
                {{
                  draftResult.booking.customer.bookerName ||
                  (draftResult.booking.customer.kind === "account"
                    ? "Account customer"
                    : "Walk-in")
                }}
              </p>
              <p class="text-xs text-muted">
                {{
                  draftResult.booking.customer.walkInPhone ||
                  draftResult.booking.customer.userId ||
                  "—"
                }}
              </p>
            </div>
            <div>
              <p class="text-muted">Rental Period</p>
              <p class="font-semibold">
                {{ draftResult.booking.dates.startDate }} →
                {{ draftResult.booking.dates.customerReturnDate }}
              </p>
              <p class="text-xs text-muted">
                {{ draftResult.booking.dates.rentalDays }} วัน
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- E3: Amount Due Summary -->
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted">
          Booking Deposit Due Now
        </p>
        <div
          class="flex flex-wrap items-end gap-4 rounded-xl bg-primary/5 px-4 py-3"
        >
          <div>
            <p class="text-2xl font-bold text-primary">
              {{
                fmt(
                  draftResult.quote.bookingDepositDueNow,
                  draftResult.quote.currencyCode,
                )
              }}
            </p>
            <p class="text-xs text-muted">
              Booking Deposit (cash, collected now)
            </p>
          </div>
          <div class="text-sm text-muted">
            <p>
              Security deposit:
              {{
                fmt(
                  draftResult.quote.requiredSecurityDepositAmount,
                  draftResult.quote.currencyCode,
                )
              }}
            </p>
            <p>
              Remaining due at pickup:
              {{
                fmt(
                  draftResult.quote.remainingSecurityDepositDueAtPickup,
                  draftResult.quote.currencyCode,
                )
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- E4: Zero-due warning — disable form when bookingDepositDueNow = 0 -->
      <UAlert
        v-if="isZeroDue"
        color="warning"
        variant="soft"
        :title="ZERO_DUE_WARNING"
        description="Booking Deposit due = ฿0. Cash finalization is not enabled for zero-deposit bookings. Please consult the system administrator."
      />

      <!-- E4: Cash payment form (only when amount > 0) -->
      <div v-if="!isZeroDue" class="space-y-4">
        <!-- E4a: Booking Deposit Due (read-only) -->
        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">
            Booking Deposit Due
          </p>
          <div
            class="rounded-xl border border-default bg-elevated/50 px-4 py-3"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-muted">Exact amount</p>
                <p class="text-2xl font-bold text-primary">
                  {{
                    fmt(
                      draftResult.quote.bookingDepositDueNow,
                      draftResult.quote.currencyCode,
                    )
                  }}
                </p>
              </div>
              <UIcon name="bx:lock" class="h-5 w-5 text-muted" />
            </div>
          </div>
        </div>

        <!-- E4b: Cash Tendered input -->
        <div class="space-y-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted">
            Cash Tendered
          </p>
          <div class="grid gap-3 md:grid-cols-2">
            <div
              class="flex items-center gap-2 rounded-xl border border-default bg-elevated/50 px-4 py-3"
            >
              <UIcon name="bx:money" class="text-success" />
              <div>
                <p class="text-xs text-muted">Payment method</p>
                <p class="font-semibold">Cash</p>
              </div>
              <UBadge class="ml-auto" color="success" variant="soft"
                >Cash</UBadge
              >
            </div>
            <UFormField label="Amount tendered" required>
              <UInput
                v-model.number="cashTenderedAmount"
                type="number"
                :min="0"
                :step="1"
                :disabled="isSubmitting"
                icon="bx:wallet"
                placeholder="Enter cash amount"
              />
            </UFormField>
          </div>
        </div>

        <!-- E4c: Change amount display -->
        <div
          v-if="cashTenderedAmount >= draftResult.quote.bookingDepositDueNow"
          class="rounded-xl border border-default bg-success/5 px-4 py-3"
        >
          <p class="text-xs text-muted">Change to return</p>
          <p class="text-xl font-semibold text-success">
            {{ fmt(changeAmount, draftResult.quote.currencyCode) }}
          </p>
        </div>

        <!-- E4d: Underpayment warning -->
        <UAlert
          v-if="isCashTenderedInsufficient"
          color="warning"
          variant="soft"
          icon="bx:error-circle"
          title="Insufficient cash"
          description="Cash received is lower than the required Booking Deposit. Please collect the full amount before confirming."
        />
      </div>

      <!-- Error state -->
      <UAlert
        v-if="submitError"
        color="error"
        variant="soft"
        title="Payment finalization failed"
        :description="submitError"
      />

      <!-- E5: Confirm action -->
      <UButton
        icon="bx:check-circle"
        color="primary"
        :loading="isSubmitting"
        :disabled="!canSubmit"
        @click="submitCashPayment"
      >
        รับเงินและยืนยันการจอง
      </UButton>
    </div>
  </UCard>
</template>
