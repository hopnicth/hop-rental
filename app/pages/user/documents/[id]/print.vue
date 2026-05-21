<script setup lang="ts">
import QrcodeVue from "qrcode.vue";
import OfficialDocumentHeader from "~/components/documents/OfficialDocumentHeader.vue";
import type { AdminOfficialDocumentDetail } from "~/types/admin-documents";

const NO_SHOW_RECEIPT_TITLE = "ใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า";
const NO_SHOW_NOTICE_TITLE = "หนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า";
const RECEIPT_NON_TAX_NOTE =
  "เอกสารฉบับนี้เป็นใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า ไม่ใช่ใบกำกับภาษี ไม่อยู่ในฐานภาษีมูลค่าเพิ่ม และไม่ใช่เอกสารหัก ณ ที่จ่าย";
const RECEIPT_PAID_EARLIER_NOTE =
  "เงินจำนวนนี้ได้รับชำระไว้แล้วในวันจอง และถูกริบตามเงื่อนไขการจอง ณ วันที่ระบุในเอกสารฉบับนี้";
const NOTICE_NON_TAX_NOTE =
  "เอกสารฉบับนี้เป็นหนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า ไม่ใช่ใบเสร็จรับเงิน และไม่ใช่ใบกำกับภาษี";

definePageMeta({ layout: false });

const route = useRoute();
const documentId = computed(() => String(route.params.id || ""));
const documentRow = ref<AdminOfficialDocumentDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const snapshot = computed(() => (documentRow.value?.snapshot ?? {}) as any);
const doc = computed(() => snapshot.value.document ?? {});
const booking = computed(() => snapshot.value.booking ?? {});
const customer = computed(() => snapshot.value.customer ?? {});
const money = computed(() => snapshot.value.money ?? {});
const payment = computed(() => snapshot.value.payment ?? {});
const cancellation = computed(() => snapshot.value.cancellation ?? {});
const refund = computed(() => snapshot.value.refund ?? {});
const financialRecognition = computed(
  () => snapshot.value.financial_recognition ?? {},
);
const depositDisposition = computed(
  () => snapshot.value.deposit_disposition ?? {},
);
const noShow = computed(() => snapshot.value.no_show ?? {});
const terms = computed(() => snapshot.value.terms ?? {});
const tax = computed(() => snapshot.value.tax ?? {});
const documentHeader = computed<Record<string, unknown>>(
  () => snapshot.value.header ?? {},
);
const isCancellationDoc = computed(
  () => doc.value.document_type === "rental_booking_cancellation_confirmation",
);
const isRefundDoc = computed(
  () =>
    doc.value.document_type === "rental_booking_deposit_refund_confirmation",
);
const isNoShowForfeitureReceipt = computed(
  () =>
    doc.value.document_type === "booking_deposit_forfeiture_ordinary_receipt",
);
const isNoShowForfeitureNotice = computed(
  () => doc.value.document_type === "rental_booking_no_show_forfeiture_notice",
);
const isNoShowForfeitureDocument = computed(
  () => isNoShowForfeitureReceipt.value || isNoShowForfeitureNotice.value,
);

function pick(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
const bookingReference = computed(
  () =>
    pick(booking.value, "reference", "id") ||
    documentRow.value?.sourceId ||
    "—",
);
const bookingItem = computed(
  () =>
    pick(booking.value, "itemName", "asset_name", "product_name", "id") || "—",
);
const bookingStartDate = computed(() =>
  pick(booking.value, "startDate", "start_date"),
);
const bookingEndDate = computed(() =>
  pick(booking.value, "endDate", "end_date"),
);
const bookingHubName = computed(
  () => pick(booking.value, "hubName", "hub_name") || "—",
);
const bookingBookerName = computed(
  () =>
    pick(customer.value, "display_name", "booker_name", "name") ||
    pick(booking.value, "bookerName", "booker_name") ||
    "—",
);
const bookingBookerPhone = computed(
  () =>
    pick(customer.value, "phone", "booker_phone") ||
    pick(booking.value, "bookerPhone", "booker_phone") ||
    "—",
);
const bookingDepositPaymentStatus = computed(
  () =>
    pick(
      booking.value,
      "bookingDepositPaymentStatus",
      "booking_deposit_payment_status",
    ) || "—",
);
const bookingDepositPaidAt = computed(
  () =>
    pick(payment.value, "paidAt", "paid_at") ||
    pick(booking.value, "bookingDepositPaidAt", "booking_deposit_paid_at"),
);
const bookingSourceLabel = computed<string | null>(() => {
  const source = clean(pick(booking.value, "bookingSource") as unknown);
  if (source === "pos") {
    // Use hub name for the inline label, e.g. "POS หน้านิคมลาดกระบัง"
    const hub = clean(pick(booking.value, "hubName", "hub_name") as unknown);
    return hub ? `POS ${hub}` : "POS Booking";
  }
  if (source === "online") return "Online Booking";
  // bookingSource absent in old snapshots — omit brackets entirely
  return null;
});
const cancellationCancelledAt = computed(() =>
  pick(cancellation.value, "cancelledAt", "cancelled_at"),
);
const cancellationPickupDate = computed(
  () =>
    pick(cancellation.value, "pickupDateSnapshot", "pickup_date_snapshot") ||
    bookingStartDate.value,
);
const cancellationRefundCutoff = computed(() =>
  pick(cancellation.value, "refundCutoffDate", "refund_cutoff_date_snapshot"),
);
const cancellationRefundEligible = computed(() =>
  pick(cancellation.value, "refundEligible", "refund_eligible"),
);
const refundStatus = computed(
  () => pick(refund.value, "status") || "pending_admin_review",
);
const refundCurrency = computed(() =>
  String(
    pick(refund.value, "currencyCode", "currency_code") ||
      money.value.currencyCode ||
      "THB",
  ),
);
const refundAmountDue = computed(
  () =>
    pick(refund.value, "amount", "refund_amount") ??
    pick(cancellation.value, "refundAmountDue", "refund_amount_due") ??
    0,
);
const refundRefundedAt = computed(() =>
  pick(refund.value, "refundedAt", "refunded_at"),
);
const refundManualReference = computed(
  () =>
    pick(
      refund.value,
      "manualTransferReference",
      "manual_transfer_reference",
    ) || "—",
);
const refundPaymentMethod = computed(
  () => pick(refund.value, "paymentMethod", "payment_method") || "—",
);
const refundAdminNote = computed(
  () => pick(refund.value, "adminNote", "admin_note") || "—",
);
const refundStatusText = computed(() =>
  refundStatus.value === "refunded"
    ? "คืนเงินแล้ว"
    : String(refundStatus.value),
);
const refundDestination = computed(
  () => (refund.value.destination ?? {}) as Record<string, string | null>,
);
const noShowCurrency = computed(() =>
  String(
    pick(financialRecognition.value, "currency_code", "currencyCode") ||
      pick(depositDisposition.value, "currency_code", "currencyCode") ||
      documentRow.value?.currencyCode ||
      "THB",
  ),
);
const forfeitedAmount = computed(
  () =>
    pick(financialRecognition.value, "recognized_amount", "recognizedAmount") ??
    pick(depositDisposition.value, "forfeited_amount", "forfeitedAmount") ??
    documentRow.value?.totalAmount ??
    null,
);
const noShowPickupDate = computed(
  () => pick(noShow.value, "pickup_date_snapshot") || bookingStartDate.value,
);
const noShowMarkedAt = computed(() => pick(noShow.value, "marked_at"));
const termsReference = computed(
  () =>
    pick(terms.value, "accepted_terms_version") ||
    pick(terms.value, "agreement_version_id") ||
    pick(terms.value, "booking_deposit_agreement_id") ||
    "—",
);
const noShowReason = computed(
  () =>
    clean(pick(noShow.value, "reason")) ||
    clean(pick(depositDisposition.value, "reason")) ||
    "ลูกค้าไม่มารับสินค้าตามวันและเวลาที่นัดหมาย",
);
const operationalDisclaimer =
  "เอกสารนี้เป็นเอกสารยืนยันรายการเพื่อการบริการเท่านั้น ไม่ใช่ใบเสร็จรับเงิน และไม่ใช่ใบกำกับภาษี";
const footerDisclaimer = computed(() => {
  const disclaimer = (snapshot.value.disclaimer ?? {}) as Record<
    string,
    unknown
  >;
  if (isNoShowForfeitureDocument.value) {
    return clean(disclaimer.th);
  }
  return operationalDisclaimer;
});

useHead(() => ({
  title: `${doc.value.document_number ?? "Document"} · Print`,
}));

function title(type: string) {
  if (type === "rental_booking_deposit_payment_confirmation")
    return "ใบยืนยันการชำระเงินมัดจำจอง";
  if (type === "rental_booking_cancellation_confirmation")
    return "ใบยืนยันการยกเลิกการจองเช่า";
  if (type === "rental_booking_deposit_refund_confirmation")
    return "ใบยืนยันการคืนเงินมัดจำจอง";
  if (type === "booking_deposit_forfeiture_ordinary_receipt")
    return NO_SHOW_RECEIPT_TITLE;
  if (type === "rental_booking_no_show_forfeiture_notice")
    return NO_SHOW_NOTICE_TITLE;
  return "ใบยืนยันการจองเช่า";
}
function moneyText(value: unknown, currency = "THB") {
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
      }).format(
        new Date(
          String(value).includes("T")
            ? String(value)
            : `${value}T00:00:00.000Z`,
        ),
      )
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
function optionalMoneyText(value: unknown, currency = "THB") {
  if (value === undefined || value === null || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? moneyText(amount, currency) : "—";
}
function thaiDepositOutcome(value: unknown): string {
  const code = clean(value);
  if (code === "booking_deposit_forfeited_no_refund") {
    return "ริบเงินมัดจำจอง และไม่มีเงินคืน";
  }
  if (code === "forfeited") return "ริบเงินมัดจำแล้ว";
  return code || "ริบเงินมัดจำแล้ว";
}
function thaiTaxTreatment(value: unknown): string {
  const code = clean(value);
  if (code === "non_vat_contractual_penalty") {
    return "ค่าปรับ/ค่าเสียหายตามเงื่อนไขการจอง ไม่อยู่ในฐานภาษีมูลค่าเพิ่ม";
  }
  return code || "ไม่อยู่ในฐานภาษีมูลค่าเพิ่ม";
}
function thaiWhtTreatment(value: unknown): string {
  const code = clean(value);
  if (code === "not_subject_to_wht") return "ไม่ใช่เอกสารหัก ณ ที่จ่าย";
  return code || "ไม่ใช่เอกสารหัก ณ ที่จ่าย";
}
function thaiRecognitionType(value: unknown): string {
  const code = clean(value);
  if (code === "booking_deposit_forfeiture_income") {
    return "รายได้ค่าปรับ/ค่าเสียหายจากการริบเงินมัดจำจอง";
  }
  return code || "รายได้ค่าปรับ/ค่าเสียหายจากการริบเงินมัดจำจอง";
}
function eligibilityText(value: unknown) {
  return value === true
    ? "มีสิทธิ์คืนเงิน"
    : value === false
      ? "ไม่มีสิทธิ์คืนเงิน"
      : "—";
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    documentRow.value = (
      await $fetch<{ document: AdminOfficialDocumentDetail }>(
        `/api/user/documents/${documentId.value}`,
      )
    ).document;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load document";
  } finally {
    loading.value = false;
  }
}
async function printDocument() {
  if (!import.meta.client || !documentRow.value) return;
  await nextTick();
  window.print();
}
onMounted(() => void load());
</script>

<template>
  <main class="print-page">
    <div class="no-print controls">
      <NuxtLink class="link" to="/user/rentals">← กลับไปหน้ารายการเช่า</NuxtLink
      ><button
        type="button"
        class="print-button"
        :disabled="!documentRow"
        @click="printDocument"
      >
        พิมพ์เอกสาร
      </button>
    </div>
    <section v-if="loading" class="screen-state no-print">
      กำลังโหลดเอกสาร…
    </section>
    <section v-else-if="error" class="screen-state no-print error">
      {{ error }}
    </section>
    <article v-else-if="documentRow" class="sheet">
      <OfficialDocumentHeader
        :header="documentHeader"
        :title="title(doc.document_type)"
        :document-number="doc.document_number"
        :issued-at-text="date(doc.issued_at)"
      />
      <section class="box">
        <h2>ข้อมูลการจองเช่า</h2>
        <dl>
          <dt>เลขที่การจอง</dt>
          <dd>{{ bookingReference }}</dd>
          <dt>รายการเช่า</dt>
          <dd>{{ bookingItem }}</dd>
          <dt>วันที่รับสินค้า / วันที่คืนสินค้า</dt>
          <dd>{{ date(bookingStartDate) }} → {{ date(bookingEndDate) }}</dd>
          <dt>จุดรับสินค้า</dt>
          <dd>{{ bookingHubName }}</dd>
          <dt>ข้อมูลผู้จอง</dt>
          <dd>{{ bookingBookerName }} · {{ bookingBookerPhone }}</dd>
        </dl>
      </section>
      <section v-if="isNoShowForfeitureReceipt" class="box">
        <h2>รายละเอียดใบรับเงินค่าริบเงินมัดจำจอง</h2>
        <dl>
          <dt>จำนวนเงินมัดจำจองที่ถูกริบ</dt>
          <dd>{{ optionalMoneyText(forfeitedAmount, noShowCurrency) }}</dd>
          <dt>วันที่บันทึกไม่มารับสินค้า</dt>
          <dd>{{ dateTime(noShowMarkedAt) }}</dd>
          <dt>วันที่รับรู้การริบเงินมัดจำ</dt>
          <dd>{{ dateTime(financialRecognition.recognized_at) }}</dd>
          <dt>เหตุผล</dt>
          <dd>{{ noShowReason }}</dd>
          <dt>ลักษณะรายการ</dt>
          <dd>
            {{ thaiRecognitionType(financialRecognition.recognition_type) }}
          </dd>
          <dt>สถานะภาษี</dt>
          <dd>
            {{
              thaiTaxTreatment(
                tax.tax_treatment || financialRecognition.tax_treatment,
              )
            }}
          </dd>
          <dt>การหัก ณ ที่จ่าย</dt>
          <dd>
            {{
              thaiWhtTreatment(
                tax.wht_treatment || financialRecognition.wht_treatment,
              )
            }}
          </dd>
          <dt>เงื่อนไขอ้างอิง</dt>
          <dd>{{ termsReference }}</dd>
        </dl>
        <p class="muted mt">
          {{ RECEIPT_NON_TAX_NOTE }}
        </p>
        <p class="muted mt">
          {{ RECEIPT_PAID_EARLIER_NOTE }}
        </p>
      </section>
      <section v-else-if="isNoShowForfeitureNotice" class="box">
        <h2>รายละเอียดหนังสือแจ้งการริบเงินมัดจำจอง</h2>
        <dl>
          <dt>วันที่นัดรับสินค้า</dt>
          <dd>{{ date(noShowPickupDate) }}</dd>
          <dt>วันที่บันทึกไม่มารับสินค้า</dt>
          <dd>{{ dateTime(noShowMarkedAt) }}</dd>
          <dt>จำนวนเงินมัดจำจองที่ถูกริบ</dt>
          <dd>{{ optionalMoneyText(forfeitedAmount, noShowCurrency) }}</dd>
          <dt>ยอดเงินคืน</dt>
          <dd>{{ moneyText(0, noShowCurrency) }}</dd>
          <dt>ผลการดำเนินการ</dt>
          <dd>
            {{
              thaiDepositOutcome(
                noShow.deposit_outcome || depositDisposition.disposition,
              )
            }}
          </dd>
          <dt>เหตุผล</dt>
          <dd>{{ noShowReason }}</dd>
          <dt>อ้างอิงเงื่อนไข</dt>
          <dd>{{ termsReference }}</dd>
        </dl>
        <p class="muted mt">
          {{ NOTICE_NON_TAX_NOTE }}
        </p>
        <p class="muted mt">
          ลูกค้าไม่มารับสินค้าตามวันที่นัดหมาย
          รายการจองจึงถูกบันทึกเป็นไม่มารับสินค้า และ HOPNIC
          ริบเงินมัดจำจองตามเงื่อนไขการจอง โดยไม่มีเงินคืน
        </p>
      </section>
      <section v-else-if="!isCancellationDoc && !isRefundDoc" class="box">
        <h2>สรุปการชำระเงินและการรับสินค้า</h2>
        <!-- Phase 2E-B1: Approved five-row deposit breakdown.
             Pickup total = remaining security deposit only; rental fee is deferred to return. -->
        <dl class="money-breakdown mt">
          <dt>เงินมัดจำประกันทั้งหมด</dt>
          <dd>
            {{ moneyText(money.securityDepositTotal, money.currencyCode) }}
          </dd>
          <dt>หักเงินมัดจำจองที่ชำระแล้ว</dt>
          <dd>
            {{
              moneyText(
                money.bookingDepositPaid ?? money.bookingDepositDueNow,
                money.currencyCode,
              )
            }}
          </dd>
          <dt>เงินมัดจำประกันคงเหลือที่ต้องชำระวันรับสินค้า</dt>
          <dd>
            {{
              moneyText(
                money.remainingRefundableSecurityDepositDueAtPickup,
                money.currencyCode,
              )
            }}
          </dd>
          <dt>
            ค่าเช่า <span class="muted">(ชำระวันคืนสินค้า / หลังจบงาน)</span>
          </dt>
          <dd>
            {{ moneyText(money.rentalFeeDueAtPickup, money.currencyCode) }}
          </dd>
          <dt><b>รวมยอดที่ต้องชำระวันรับสินค้า</b></dt>
          <dd>
            <b>{{
              moneyText(
                money.remainingRefundableSecurityDepositDueAtPickup,
                money.currencyCode,
              )
            }}</b>
          </dd>
        </dl>

        <dl class="mt payment-detail">
          <dt>สถานะเงินมัดจำจอง</dt>
          <dd>{{ bookingDepositPaymentStatus }}</dd>
          <dt>จำนวนเงินมัดจำจองที่ชำระแล้ว</dt>
          <dd>
            {{
              moneyText(
                money.bookingDepositPaid ?? money.bookingDepositDueNow,
                money.currencyCode,
              )
            }}
          </dd>
          <dt>วันชำระเงิน</dt>
          <dd>{{ dateTime(bookingDepositPaidAt) }}</dd>
        </dl>
        <p class="muted mt">
          เงินมัดจำจองนี้เป็นส่วนหนึ่งของเงินมัดจำประกัน
          และจะนำไปหักจากเงินมัดจำประกันคงเหลือในวันรับสินค้า
        </p>
      </section>
      <section v-else-if="isCancellationDoc" class="box">
        <h2>การยกเลิกและคำขอคืนเงิน</h2>
        <dl>
          <dt>วันเวลาที่ยกเลิก</dt>
          <dd>{{ dateTime(cancellationCancelledAt) }}</dd>
          <dt>วันที่รับสินค้าเดิม</dt>
          <dd>{{ date(cancellationPickupDate) }}</dd>
          <dt>วันสุดท้ายที่ยกเลิกผ่านเว็บไซต์ได้</dt>
          <dd>{{ date(cancellationRefundCutoff) }}</dd>
          <dt>สถานะสิทธิ์คืนเงิน</dt>
          <dd>{{ eligibilityText(cancellationRefundEligible) }}</dd>
          <dt>สถานะคำขอคืนเงิน</dt>
          <dd>{{ refundStatus }}</dd>
          <dt>จำนวนเงินที่เข้าข่ายคืน</dt>
          <dd>{{ moneyText(refundAmountDue, refundCurrency) }}</dd>
        </dl>
        <p class="muted">
          สร้างคำขอคืนเงินแล้ว HOPNIC
          จะตรวจสอบและดำเนินการคืนเงินด้วยเจ้าหน้าที่
        </p>
      </section>
      <section v-else class="box">
        <h2>การคืนเงินมัดจำจอง</h2>
        <dl>
          <dt>สถานะคำขอคืนเงิน</dt>
          <dd>{{ refundStatusText }}</dd>
          <dt>วันที่ยกเลิกการจอง</dt>
          <dd>{{ dateTime(cancellationCancelledAt) }}</dd>
          <dt>วันเวลาที่คืนเงิน</dt>
          <dd>{{ dateTime(refundRefundedAt) }}</dd>
          <dt>จำนวนเงินที่คืน</dt>
          <dd>{{ moneyText(refundAmountDue, refundCurrency) }}</dd>
          <dt>ช่องทางการคืนเงิน</dt>
          <dd>{{ refundPaymentMethod }}</dd>
          <dt>เลขอ้างอิงการคืนเงิน</dt>
          <dd>{{ refundManualReference }}</dd>
          <dt>ผู้รับเงินคืน</dt>
          <dd>
            {{ refundDestination.bank_account_name || "—" }} ·
            {{ refundDestination.bank_name || "—" }} ·
            {{ refundDestination.bank_account_number_masked || "—" }}
          </dd>
          <dt>หมายเหตุ</dt>
          <dd>{{ refundAdminNote }}</dd>
        </dl>
        <p class="muted">
          เอกสารนี้ยืนยันสถานะการคืนเงินมัดจำจองเพื่อการบริการเท่านั้น
        </p>
      </section>
      <section v-if="booking.qrValue" class="box qr">
        <div>
          <h2>
            QR การจอง<template v-if="bookingSourceLabel">
              [{{ bookingSourceLabel }}]</template
            >
          </h2>
          <p class="muted">
            ใช้เป็นข้อมูลอ้างอิงการจองเท่านั้น ไม่ใช่หลักฐานการส่งมอบสินค้า
          </p>
          <p class="mono">{{ booking.qrValue }}</p>
        </div>
        <QrcodeVue :value="booking.qrValue" :size="96" level="H" />
      </section>
      <footer>
        <p>{{ footerDisclaimer }}</p>
      </footer>
    </article>
  </main>
</template>

<style>
@page {
  size: A4;
  margin: 12mm;
}
body {
  background: #f1f5f9;
}
.print-page {
  color: #111827;
  font-family: Arial, "Noto Sans Thai", sans-serif;
  font-size: 10pt;
}
.controls {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px;
}
.link {
  color: #2563eb;
  text-decoration: none;
}
.print-button {
  background: #111827;
  border: 0;
  border-radius: 8px;
  color: white;
  padding: 8px 14px;
}
.screen-state {
  margin: 24px auto;
  max-width: 190mm;
}
.error {
  color: #b91c1c;
}
.sheet {
  background: white;
  box-shadow: 0 12px 40px rgb(15 23 42 / 14%);
  margin: 0 auto 24px;
  min-height: 270mm;
  padding: 12mm;
  width: 190mm;
}
.header {
  border-bottom: 1px solid #111827;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 12px;
}
.brand-block {
  align-items: center;
  display: flex;
  gap: 12px;
}
.logo {
  height: 18mm;
  object-fit: contain;
  width: 18mm;
}
.brand {
  font-size: 18pt;
  font-weight: 700;
}
.brand-en {
  font-size: 11pt;
  font-weight: 700;
  margin-top: 2px;
}
.right {
  text-align: right;
}
h1 {
  font-size: 18pt;
  margin: 0 0 4px;
}
h2 {
  font-size: 12pt;
  margin: 0 0 8px;
}
p {
  margin: 0;
}
.muted {
  color: #64748b;
}
.mt {
  margin-top: 10px;
}
.box {
  border: 1px solid #cbd5e1;
  margin-top: 12px;
  padding: 12px;
}
dl {
  display: grid;
  grid-template-columns: 36mm 1fr;
  margin: 0;
  row-gap: 6px;
}
dt {
  color: #64748b;
}
dd {
  margin: 0;
}
.money-breakdown {
  /* Accounting layout: label fills remaining space, amount column is right-aligned and auto-sized. */
  grid-template-columns: minmax(0, 1fr) max-content;
  column-gap: 16px;
  row-gap: 8px;
  align-items: baseline;
}
.money-breakdown dd {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.payment-detail {
  /* Same accounting layout as .money-breakdown for the lower deposit detail rows. */
  grid-template-columns: minmax(0, 1fr) max-content;
  column-gap: 16px;
  align-items: baseline;
}
.payment-detail dd {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.qr {
  align-items: center;
  display: flex;
  justify-content: space-between;
}
.mono {
  font-family: monospace;
  word-break: break-all;
}
footer {
  border-top: 1px solid #cbd5e1;
  color: #64748b;
  margin-top: 16px;
  padding-top: 10px;
}
@media print {
  body {
    background: white;
  }
  .no-print {
    display: none !important;
  }
  .sheet {
    box-shadow: none;
    margin: 0;
    min-height: auto;
    padding: 0;
    width: auto;
  }
}
</style>
