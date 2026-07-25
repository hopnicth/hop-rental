<script setup lang="ts">
/**
 * T2 return-settlement panel (decisions.md §b addendum item 3 — SIMPLE).
 *
 * The panel COMPUTES everything and shows staff ONE instruction:
 * "REFUND ฿X" / "COLLECT ฿Y" / "EVEN". Staff enter only damage penalties
 * (amount + note each), an optional special discount (+ mandatory note),
 * signatures, and — when money moves — the transfer slip (iPad camera via
 * capture="environment"). The server RPC recomputes authoritatively.
 */
import DigitalSignaturePad from "~/components/admin/DigitalSignaturePad.vue";

const props = defineProps<{ bookingId: string; bookingStatus?: string }>();
const emit = defineEmits<{ settled: [] }>();

const toast = useToast();

const heldTotal = ref(0);
const currencyCode = ref("THB");
const existingSettlement = ref<Record<string, unknown> | null>(null);
const returnChecklistComplete = ref(false);
const loading = ref(true);

// ── [§8.9 half 2] Settlement payment state + super-admin waive ──────────────
interface PaymentState {
  id: string;
  state: string;
  amount_due: number;
  amount_paid: number;
  currency_code: string;
  waived_at: string | null;
  waive_reason: string | null;
}
const paymentState = ref<PaymentState | null>(null);
const { profile } = useUserProfile();
const isSuperAdmin = computed(
  () => profile.value?.platformRole === "super_admin",
);
const awaitingPayment = computed(
  () => paymentState.value?.state === "awaiting_payment",
);
/** The settle FORM is only meaningful before the return is recorded. */
const showSettleForm = computed(() => props.bookingStatus !== "returned");
const waiveOpen = ref(false);
const waiveReason = ref("");
const waiving = ref(false);

interface PenaltyLine {
  amount: number | null;
  note: string;
}
const penaltyLines = ref<PenaltyLine[]>([]);
const specialDiscountAmount = ref<number | null>(null);
const specialDiscountNote = ref("");
const refundBankAccountRef = ref("");
// [146] RECORD-BUT-NO-MONEY memo. Text only — it never enters any total. The
// server refuses a LATE return without one; this panel does not know late_days
// yet (the launch preview feed lands in 2b), so the requirement is surfaced by
// the RPC's ratified Thai refusal rather than gated client-side.
const staffMemo = ref("");
const notes = ref("");
const customerSignature = ref<string | null>(null);
const staffSignature = ref<string | null>(null);
const slipFile = ref<File | null>(null);
const submitting = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await $fetch<{
      heldTotal: number;
      currencyCode: string;
      settlement: Record<string, unknown> | null;
      returnChecklistComplete: boolean;
      paymentState: PaymentState | null;
    }>(`/api/admin/rental-bookings/${props.bookingId}/return-settlement`);
    heldTotal.value = res.heldTotal;
    currencyCode.value = res.currencyCode;
    existingSettlement.value = res.settlement;
    returnChecklistComplete.value = res.returnChecklistComplete;
    paymentState.value = res.paymentState;
  } catch {
    toast.add({
      title: "Failed to load settlement preview",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());

const penaltyTotal = computed(() =>
  penaltyLines.value.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
);
const discount = computed(() =>
  Math.max(0, Number(specialDiscountAmount.value) || 0),
);
const netCharge = computed(() =>
  Math.max(0, penaltyTotal.value - discount.value),
);
const refundAmount = computed(() =>
  Math.max(0, heldTotal.value - netCharge.value),
);
const collectAmount = computed(() =>
  Math.max(0, netCharge.value - heldTotal.value),
);
const outcome = computed(() => {
  if (refundAmount.value > 0) return "refund" as const;
  if (collectAmount.value > 0) return "collect" as const;
  return "even" as const;
});
const moneyMoves = computed(
  () => refundAmount.value > 0 || collectAmount.value > 0,
);

const invalidLines = computed(() =>
  penaltyLines.value.some(
    (line) => !(Number(line.amount) > 0) || line.note.trim().length === 0,
  ),
);
const canSubmit = computed(
  () =>
    !submitting.value &&
    returnChecklistComplete.value &&
    !invalidLines.value &&
    (discount.value === 0 || specialDiscountNote.value.trim().length > 0) &&
    !!customerSignature.value &&
    !!staffSignature.value &&
    (!moneyMoves.value || !!slipFile.value) &&
    (outcome.value !== "refund" || refundBankAccountRef.value.trim().length > 0),
);

function addPenaltyLine() {
  penaltyLines.value.push({ amount: null, note: "" });
}
function removePenaltyLine(index: number) {
  penaltyLines.value.splice(index, 1);
}
function onSlipChange(eventTarget: Event) {
  const input = eventTarget.target as HTMLInputElement;
  slipFile.value = input.files?.[0] ?? null;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currencyCode.value || "THB",
  }).format(value);
}

/**
 * [§8.9 half 2] Super-admin waive. The server is the authority: the endpoint
 * re-checks the role from the session and logs every refusal to
 * money_ops_decision_logs before returning the error. This visibility gate is
 * UX only.
 */
async function submitWaive() {
  if (waiving.value || waiveReason.value.trim().length === 0) return;
  waiving.value = true;
  try {
    await $fetch(
      `/api/admin/rental-bookings/${props.bookingId}/settlement-waive`,
      { method: "POST", body: { reason: waiveReason.value.trim() } },
    );
    toast.add({
      title: "ยกเว้นยอดชำระเรียบร้อย",
      color: "success",
      icon: "bx:check-circle",
    });
    waiveOpen.value = false;
    waiveReason.value = "";
    await load();
  } catch (e) {
    const err = e as { data?: { statusMessage?: string; message?: string } };
    toast.add({
      title: "ยกเว้นยอดชำระไม่สำเร็จ",
      description: err?.data?.statusMessage ?? err?.data?.message ?? "ไม่ทราบสาเหตุ",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    waiving.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const body = new FormData();
    body.append(
      "penaltyLines",
      JSON.stringify(
        penaltyLines.value.map((line) => ({
          amount: Number(line.amount),
          note: line.note.trim(),
        })),
      ),
    );
    body.append("specialDiscountAmount", String(discount.value));
    if (specialDiscountNote.value.trim()) {
      body.append("specialDiscountNote", specialDiscountNote.value.trim());
    }
    if (refundBankAccountRef.value.trim()) {
      body.append("refundBankAccountRef", refundBankAccountRef.value.trim());
    }
    if (staffMemo.value.trim()) body.append("staffMemo", staffMemo.value.trim());
    if (notes.value.trim()) body.append("notes", notes.value.trim());
    body.append("customerSignature", customerSignature.value ?? "");
    body.append("staffSignature", staffSignature.value ?? "");
    if (slipFile.value) body.append("slip", slipFile.value);

    await $fetch(
      `/api/admin/rental-bookings/${props.bookingId}/return-settlement`,
      { method: "POST", body },
    );
    toast.add({
      title: "Return settled — booking returned",
      color: "success",
      icon: "bx:check-circle",
    });
    emit("settled");
    await load();
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } };
    toast.add({
      title: "Settlement failed",
      description: err?.data?.statusMessage ?? "Unknown error",
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div>
        <h3 class="font-semibold">Return & settlement</h3>
        <p class="text-xs text-muted">
          Enter penalties and discount — the system computes the outcome.
        </p>
      </div>
    </template>

    <div v-if="loading" class="text-sm text-muted">Loading…</div>

    <div v-else class="space-y-4">
      <!-- [§8.9 half 2] Settlement payment state + super-admin waive -->
      <div
        v-if="paymentState"
        class="space-y-3 rounded-xl border border-default p-3 text-sm"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-semibold">สถานะการชำระเงินค่าปิดยอด</p>
            <p class="text-xs text-muted">
              ยอดที่ต้องชำระ
              {{ formatMoney(Number(paymentState.amount_due ?? 0)) }}
            </p>
          </div>
          <UBadge
            :color="
              paymentState.state === 'paid'
                ? 'success'
                : paymentState.state === 'waived'
                  ? 'neutral'
                  : 'warning'
            "
            variant="soft"
          >
            {{
              paymentState.state === "paid"
                ? "ชำระแล้ว"
                : paymentState.state === "waived"
                  ? "ยกเว้นแล้ว"
                  : "รอชำระเงิน"
            }}
          </UBadge>
        </div>

        <p
          v-if="paymentState.state === 'waived' && paymentState.waive_reason"
          class="text-xs text-muted"
        >
          เหตุผลการยกเว้น: {{ paymentState.waive_reason }}
        </p>

        <UButton
          v-if="awaitingPayment && isSuperAdmin"
          color="warning"
          variant="soft"
          icon="bx:receipt"
          label="ยกเว้นยอดชำระ"
          @click="waiveOpen = true"
        />
      </div>

      <UModal v-model:open="waiveOpen" title="ยืนยันการยกเว้นยอดชำระ">
        <template #body>
          <div class="space-y-3 text-sm">
            <p>
              ระบบจะยกเว้นยอดค้างชำระ
              <span class="font-semibold">{{
                formatMoney(Number(paymentState?.amount_due ?? 0))
              }}</span>
              โดยจะไม่มีการรับชำระเงินสำหรับรายการนี้
              และรายการเรียกเก็บทั้งหมดจะถูกยกเลิก
            </p>
            <p class="text-xs text-warning">
              การดำเนินการนี้ย้อนกลับไม่ได้ และจะถูกบันทึกไว้ในระบบตรวจสอบ
            </p>
            <UFormField label="เหตุผลในการยกเว้น (จำเป็น)">
              <UTextarea
                v-model="waiveReason"
                :rows="3"
                class="w-full"
                placeholder="ระบุเหตุผลสำหรับการตรวจสอบภายหลัง"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="ยกเลิก"
              :disabled="waiving"
              @click="waiveOpen = false"
            />
            <UButton
              color="warning"
              label="ยืนยันการยกเว้น"
              :loading="waiving"
              :disabled="waiving || waiveReason.trim().length === 0"
              @click="void submitWaive()"
            />
          </div>
        </template>
      </UModal>

      <UAlert
        v-if="showSettleForm && !returnChecklistComplete"
        color="warning"
        variant="soft"
        title="Complete the return checklist first"
        description="The equipment return checklist must be completed before settlement."
      />
      <!-- Settle FORM — hidden once the booking is returned (already settled);
           the payment-state/waive block above stays visible. -->
      <div v-if="showSettleForm" class="space-y-4">
      <UAlert
        v-if="existingSettlement"
        color="info"
        variant="soft"
        title="Settlement already recorded — completing the return"
        :description="`Re-enter the SAME figures to finish (stored: penalties ${formatMoney(Number(existingSettlement.penalty_total ?? 0))}, discount ${formatMoney(Number(existingSettlement.special_discount_amount ?? 0))}, refund ${formatMoney(Number(existingSettlement.refund_amount ?? 0))}).`"
      />
      <p class="text-sm">
        Held balance:
        <span class="font-semibold">{{ formatMoney(heldTotal) }}</span>
      </p>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Damage penalties</p>
          <UButton
            size="xs"
            variant="soft"
            icon="bx:plus"
            label="Add penalty"
            @click="addPenaltyLine"
          />
        </div>
        <div
          v-for="(line, index) in penaltyLines"
          :key="index"
          class="flex flex-wrap items-end gap-2"
        >
          <UFormField label="Amount">
            <UInput
              v-model.number="line.amount"
              type="number"
              min="0"
              step="0.01"
              class="w-32"
            />
          </UFormField>
          <UFormField label="Note (required)">
            <UInput v-model="line.note" class="w-72" />
          </UFormField>
          <UButton
            icon="bx:x"
            size="xs"
            variant="ghost"
            color="neutral"
            aria-label="Remove penalty"
            @click="removePenaltyLine(index)"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Special discount" hint="Staff-entered; note required">
          <UInput
            v-model.number="specialDiscountAmount"
            type="number"
            min="0"
            step="0.01"
            class="w-32"
          />
        </UFormField>
        <UFormField v-if="discount > 0" label="Discount note (required)">
          <UInput v-model="specialDiscountNote" class="w-72" />
        </UFormField>
      </div>

      <!-- [146] RECORD-BUT-NO-MONEY memo (decisions.md 2026-07-26 b).
           Text only: no amount, no charge line, no document, no effect on any
           total. The server REQUIRES it when the return is late. -->
      <UFormField
        label="หมายเหตุการคืน"
        hint="บังคับเมื่อมีการคืนล่าช้า"
      >
        <UTextarea
          v-model="staffMemo"
          :rows="3"
          class="w-full"
          placeholder="เช่น คืนล่าช้า 1 วัน — ออกบิลเรียกเก็บที่โปรแกรมบัญชี"
        />
      </UFormField>

      <!-- The single computed instruction (decision 3) -->
      <UAlert
        :color="outcome === 'refund' ? 'success' : outcome === 'collect' ? 'warning' : 'info'"
        variant="soft"
        :title="
          outcome === 'refund'
            ? `REFUND ${formatMoney(refundAmount)} to customer`
            : outcome === 'collect'
              ? `COLLECT ${formatMoney(collectAmount)} from customer`
              : 'EVEN — no money moves'
        "
        :description="`Held ${formatMoney(heldTotal)} · penalties ${formatMoney(penaltyTotal)} · discount ${formatMoney(discount)}`"
      />

      <UFormField
        v-if="outcome === 'refund'"
        label="Customer bank account (required for refund)"
      >
        <UInput
          v-model="refundBankAccountRef"
          placeholder="Bank / account no. / account name"
          class="w-96"
        />
      </UFormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <p class="mb-1 text-sm font-medium">Customer signature</p>
          <DigitalSignaturePad v-model="customerSignature" />
        </div>
        <div>
          <p class="mb-1 text-sm font-medium">Staff signature</p>
          <DigitalSignaturePad v-model="staffSignature" />
        </div>
      </div>

      <UFormField
        v-if="moneyMoves"
        label="Transfer slip (required)"
        hint="Photograph the slip with the iPad camera"
      >
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          capture="environment"
          class="block text-sm"
          @change="onSlipChange"
        />
      </UFormField>

      <UFormField label="Notes (optional)">
        <UInput v-model="notes" class="w-full" />
      </UFormField>

      <UButton
        color="primary"
        label="Complete return & settle"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="void submit()"
      />
      </div>
    </div>
  </UCard>
</template>
