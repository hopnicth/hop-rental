<script setup lang="ts">
/**
 * Return-settlement panel. ONE instruction, computed — never staff arithmetic.
 *
 * TWO REGIMES, chosen by the server-authoritative `depositsEnabled` flag
 * (f_deposits_enabled, mig 135) that the GET feed carries:
 *
 *  LAUNCH (deposits OFF — the current regime). The web collects ONE money item,
 *  COMPUTED from the booking row: ค่าเช่า (rental_charge), the rental as booked.
 *  Staff enter only a discount (+ mandatory reason) and the RECORD-BUT-NO-MONEY
 *  memo, which is mandatory when the return is late. The instruction is always
 *  COLLECT: rental − discount. Overdue rental, damages, penalties, cleaning and
 *  fuel are ALL billed in the accounting program, off-web — the overdue days and
 *  the memo are shown here as FACTS and printed on the report Admin bills from
 *  (decisions.md 2026-07-27).
 *
 *  DEPOSIT ERA (deposits ON — parked, revivable by flag). Damage penalties, the
 *  special discount, the held-balance algebra and the REFUND/COLLECT/EVEN
 *  outcome with its slip and bank-account fields. HIDDEN, NOT DELETED, per the
 *  deposit DATA vs deposit DISPLAY ruling.
 *
 * The server RPC recomputes every figure authoritatively; everything here is
 * display and pre-flight validation.
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
// [146] Server-authoritative deposit regime + launch preview. depositsEnabled
// gates DISPLAY only: the deposit-era inputs and held-balance arithmetic are
// hidden while deposits are off, never deleted, so revival is a flag flip
// (decisions.md 2026-07-26 addendum — deposit DATA vs deposit DISPLAY).
interface LaunchPreview {
  baseRental: number;
  dailyRate: number;
  lateDays: number;
  rentalBase: number;
}
const depositsEnabled = ref(false);
const preview = ref<LaunchPreview>({
  baseRental: 0,
  dailyRate: 0,
  lateDays: 0,
  rentalBase: 0,
});
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
// server refuses a LATE return without one; the panel mirrors that requirement
// from the preview's late_days, but the RPC remains the authority.
const staffMemo = ref("");
// [146] LAUNCH rental-base discount (staff ≤20% / super_admin ≤50%). The
// ceilings are enforced by the RPC against the LOOKED-UP role — this input
// never decides authority, it only collects the request.
const discountAmount = ref<number | null>(null);
const discountNote = ref("");
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
      depositsEnabled: boolean;
      preview: LaunchPreview;
    }>(`/api/admin/rental-bookings/${props.bookingId}/return-settlement`);
    heldTotal.value = res.heldTotal;
    currencyCode.value = res.currencyCode;
    existingSettlement.value = res.settlement;
    returnChecklistComplete.value = res.returnChecklistComplete;
    paymentState.value = res.paymentState;
    depositsEnabled.value = res.depositsEnabled === true;
    if (res.preview) preview.value = res.preview;
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

// [146] The return checklist is completed in a SIBLING component, and this
// panel's gate ("Complete the return checklist first") comes from the feed
// above — so without this the gate persisted until a manual page reload and
// read as "the checklist did not save". The parent calls reload() when the ops
// payload changes. Exposed rather than keyed on a prop so a remount never
// discards signatures or a memo already typed.
defineExpose({ reload: load });

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

// ── [147] LAUNCH arithmetic ────────────────────────────────────────────────
// rental_charge − discount = the amount to COLLECT. ONE money item; overdue
// rental is not charged here (decisions.md 2026-07-27). There is no held balance
// at launch either, so none of the deposit-era refund/collect algebra applies.
// Display only; f_settle_rental_booking_return recomputes every figure from the
// booking row it locks, and its answer wins.
const launchDiscount = computed(() =>
  Math.max(0, Number(discountAmount.value) || 0),
);
const launchCollect = computed(() =>
  Math.max(0, Math.round((preview.value.rentalBase - launchDiscount.value) * 100) / 100),
);
const isLateReturn = computed(() => preview.value.lateDays > 0);
// [147] The overdue report is the sheet Admin bills from — it exists only once a
// LATE return has actually been SETTLED (before that there is no recorded
// overdue fact, and an on-time return has nothing to bill). The endpoint 404s on
// both cases, so this predicate mirrors the server rather than guessing.
const canPrintOverdueReport = computed(
  () => isLateReturn.value && !!existingSettlement.value,
);
/** The RPC refuses a late return with no memo; mirror it so staff see it first. */
const memoMissing = computed(
  () => isLateReturn.value && staffMemo.value.trim().length === 0,
);

const canSubmit = computed(() => {
  if (submitting.value || !returnChecklistComplete.value) return false;
  if (!customerSignature.value || !staffSignature.value) return false;
  if (memoMissing.value) return false;
  return depositsEnabled.value
    ? !invalidLines.value &&
        (discount.value === 0 ||
          specialDiscountNote.value.trim().length > 0) &&
        (!moneyMoves.value || !!slipFile.value) &&
        (outcome.value !== "refund" ||
          refundBankAccountRef.value.trim().length > 0)
    : launchDiscount.value === 0 || discountNote.value.trim().length > 0;
});

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
    // [146] The two regimes never share an input channel (the RPC refuses the
    // wrong one), so the launch discount travels only while deposits are off.
    if (!depositsEnabled.value && launchDiscount.value > 0) {
      body.append("discountAmount", String(launchDiscount.value));
      body.append("discountNote", discountNote.value.trim());
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
        <!-- [146] Regime-aware subtitle: at launch there are no penalties to
             enter, and saying otherwise contradicts the surface below it. -->
        <p class="text-xs text-muted">
          {{
            depositsEnabled
              ? "Enter penalties and discount — the system computes the outcome."
              : "ค่าเช่าคำนวณจากข้อมูลการจอง — เจ้าหน้าที่ระบุเฉพาะส่วนลดและหมายเหตุ"
          }}
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

      <!-- [147] OVERDUE REPORT — printable, NOT a document (no number, no series,
           no computed total). Opens in a new tab so the settle form is never
           lost behind a print view. -->
      <UButton
        v-if="canPrintOverdueReport"
        icon="bx:printer"
        color="neutral"
        variant="soft"
        size="sm"
        target="_blank"
        :to="`/admin/rental-bookings/overdue-report/${bookingId}`"
        label="พิมพ์รายงานการคืนล่าช้า"
      />

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
      <!-- [146] LAUNCH breakdown — the two charge types the web collects, both
           COMPUTED from the booking row. Shown when deposits are OFF. -->
      <div v-if="!depositsEnabled" class="space-y-1 rounded-xl border border-default p-3 text-sm">
        <div class="flex justify-between">
          <span>ค่าเช่า</span>
          <span class="font-semibold">{{ formatMoney(preview.baseRental) }}</span>
        </div>
        <!-- [147] OVERDUE IS A FACT HERE, NOT A CHARGE. No baht figure is shown
             or computed: overdue rental is billed externally from the printed
             report (decisions.md 2026-07-27). -->
        <div v-if="isLateReturn" class="flex justify-between text-warning">
          <span>คืนล่าช้า {{ preview.lateDays }} วัน</span>
          <span class="text-xs"
            >ค่าเช่าตามจอง {{ formatMoney(preview.dailyRate) }}/วัน — ออกบิลเรียกเก็บที่โปรแกรมบัญชี</span
          >
        </div>
        <div v-if="launchDiscount > 0" class="flex justify-between text-success">
          <span>ส่วนลด</span>
          <span class="font-semibold">−{{ formatMoney(launchDiscount) }}</span>
        </div>
      </div>

      <p v-if="depositsEnabled" class="text-sm">
        Held balance:
        <span class="font-semibold">{{ formatMoney(heldTotal) }}</span>
      </p>

      <div v-if="depositsEnabled" class="space-y-2">
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

      <div v-if="depositsEnabled" class="flex flex-wrap items-end gap-3">
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

      <!-- [146] LAUNCH discount on the rental base. Tier ceilings (staff ≤20%,
           super_admin ≤50%) are enforced by the RPC against the looked-up role;
           a refusal comes back as its own Thai message. -->
      <div v-if="!depositsEnabled" class="flex flex-wrap items-end gap-3">
        <UFormField label="ส่วนลด" hint="คิดจากค่าเช่าตามที่จอง">
          <UInput
            v-model.number="discountAmount"
            type="number"
            min="0"
            step="0.01"
            class="w-32"
          />
        </UFormField>
        <UFormField v-if="launchDiscount > 0" label="เหตุผลของส่วนลด (จำเป็น)">
          <UInput v-model="discountNote" class="w-72" />
        </UFormField>
      </div>

      <!-- [146] RECORD-BUT-NO-MONEY memo (decisions.md 2026-07-26 b).
           Text only: no amount, no charge line, no document, no effect on any
           total. The server REQUIRES it when the return is late. -->
      <UFormField
        :label="isLateReturn ? 'หมายเหตุการคืน (จำเป็น)' : 'หมายเหตุการคืน'"
        hint="บังคับเมื่อมีการคืนล่าช้า"
        :error="memoMissing ? 'กรุณาบันทึกหมายเหตุสำหรับการคืนล่าช้า' : undefined"
      >
        <UTextarea
          v-model="staffMemo"
          :rows="3"
          class="w-full"
          placeholder="เช่น คืนล่าช้า 1 วัน — ออกบิลเรียกเก็บที่โปรแกรมบัญชี"
        />
      </UFormField>

      <!-- [146] LAUNCH: the single computed instruction is always COLLECT —
           rental + extension − discount. No held balance, so no refund branch. -->
      <UAlert
        v-if="!depositsEnabled"
        :color="launchCollect > 0 ? 'warning' : 'info'"
        variant="soft"
        :title="
          launchCollect > 0
            ? `เรียกเก็บ ${formatMoney(launchCollect)}`
            : 'ไม่มียอดต้องเรียกเก็บ'
        "
        :description="`ค่าเช่า ${formatMoney(preview.baseRental)} · ส่วนลด ${formatMoney(launchDiscount)}`"
      />

      <!-- The single computed instruction (decision 3) — deposit era -->
      <UAlert
        v-if="depositsEnabled"
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
        v-if="depositsEnabled && outcome === 'refund'"
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
        v-if="depositsEnabled && moneyMoves"
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
