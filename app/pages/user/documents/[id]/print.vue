<script setup lang="ts">
import QrcodeVue from "qrcode.vue";
import type { AdminOfficialDocumentDetail } from "~/types/admin-documents";

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
    0,
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
const operationalDisclaimer =
  "เอกสารนี้เป็นเอกสารยืนยันรายการเพื่อการบริการเท่านั้น ไม่ใช่ใบเสร็จรับเงิน และไม่ใช่ใบกำกับภาษี";
const hopnicHeader = {
  companyNameTh: "บริษัท ฮอปนิค จำกัด",
  companyNameEn: "HOPNIC Co., Ltd.",
  branch: "สำนักงานใหญ่",
  addressTh: "888/8 ม.1 ต.พนมสารคาม อ.พนมสารคาม จ.ฉะเชิงเทรา 24120",
  phone: "095-479-2333",
  email: "info@hopnic.co.th",
};
const footerDisclaimer = computed(() => {
  const disclaimer = (snapshot.value.disclaimer ?? {}) as Record<
    string,
    unknown
  >;
  if (isNoShowForfeitureDocument.value) {
    return [disclaimer.th, disclaimer.en].filter(Boolean).join(" / ");
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
    return "ใบรับเงินธรรมดา — Booking Deposit ที่ถูกริบ";
  if (type === "rental_booking_no_show_forfeiture_notice")
    return "หนังสือแจ้งการไม่มารับสินค้าและการดำเนินการ Booking Deposit";
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
      <header class="header">
        <div>
          <p class="brand">{{ hopnicHeader.companyNameTh }}</p>
          <p class="brand-en">{{ hopnicHeader.companyNameEn }}</p>
          <p class="muted">{{ hopnicHeader.branch }}</p>
          <p class="muted">{{ hopnicHeader.addressTh }}</p>
          <p class="muted">
            โทร {{ hopnicHeader.phone }} · {{ hopnicHeader.email }}
          </p>
        </div>
        <div class="right">
          <h1>{{ title(doc.document_type) }}</h1>
          <p>เลขที่เอกสาร: {{ doc.document_number }}</p>
          <p>วันที่ออกเอกสาร: {{ date(doc.issued_at) }}</p>
        </div>
      </header>
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
        <h2>รายละเอียดใบรับเงินธรรมดา Booking Deposit ที่ถูกริบ</h2>
        <dl>
          <dt>จำนวนเงินที่รับรู้ / ถูกริบ</dt>
          <dd>{{ moneyText(forfeitedAmount, noShowCurrency) }}</dd>
          <dt>วันที่รับรู้รายการ</dt>
          <dd>{{ dateTime(financialRecognition.recognized_at) }}</dd>
          <dt>สถานะภาษี</dt>
          <dd>ไม่ใช่ใบกำกับภาษี · VAT 0 · ไม่อยู่ในบังคับหัก ณ ที่จ่าย</dd>
          <dt>Tax treatment</dt>
          <dd>
            {{
              tax.tax_treatment ||
              financialRecognition.tax_treatment ||
              "non_vat_contractual_penalty"
            }}
          </dd>
          <dt>WHT treatment</dt>
          <dd>
            {{
              tax.wht_treatment ||
              financialRecognition.wht_treatment ||
              "not_subject_to_wht"
            }}
          </dd>
        </dl>
        <p class="muted mt">
          ใบรับเงินธรรมดานี้ออกสำหรับ Booking Deposit ที่ถูกริบจากเหตุ No-show
          เท่านั้น ไม่ใช่ใบกำกับภาษี และไม่มีปุ่มหรือสิทธิ์แปลงเป็นใบกำกับภาษี
        </p>
      </section>
      <section v-else-if="isNoShowForfeitureNotice" class="box">
        <h2>รายละเอียดหนังสือแจ้ง No-show</h2>
        <dl>
          <dt>วันที่นัดรับสินค้า</dt>
          <dd>{{ date(noShowPickupDate) }}</dd>
          <dt>วันที่บันทึก No-show</dt>
          <dd>{{ dateTime(noShowMarkedAt) }}</dd>
          <dt>จำนวน Booking Deposit ที่ถูกริบ</dt>
          <dd>{{ moneyText(forfeitedAmount, noShowCurrency) }}</dd>
          <dt>ผลการดำเนินการ</dt>
          <dd>
            {{
              depositDisposition.disposition ||
              noShow.deposit_outcome ||
              "forfeited"
            }}
          </dd>
          <dt>อ้างอิงเงื่อนไข</dt>
          <dd>{{ termsReference }}</dd>
        </dl>
        <p class="muted mt">
          เอกสารนี้เป็นหนังสือแจ้งการไม่มารับสินค้าตามกำหนดและการดำเนินการกับ
          Booking Deposit ตามเงื่อนไขที่เกี่ยวข้อง ไม่ใช่ใบเสร็จรับเงิน
          และไม่ใช่ใบกำกับภาษี
        </p>
      </section>
      <section v-else-if="!isCancellationDoc && !isRefundDoc" class="box">
        <h2>สรุปการชำระเงินและการรับสินค้า</h2>
        <div class="money">
          <p>
            เงินมัดจำจอง<br /><b>{{
              moneyText(
                money.bookingDepositPaid ?? money.bookingDepositDueNow,
                money.currencyCode,
              )
            }}</b>
          </p>
          <p>
            ค่าเช่าที่ชำระวันรับสินค้า<br /><b>{{
              moneyText(money.rentalFeeDueAtPickup, money.currencyCode)
            }}</b>
          </p>
          <p>
            เงินมัดจำประกันคงเหลือ<br /><b>{{
              moneyText(
                money.remainingRefundableSecurityDepositDueAtPickup,
                money.currencyCode,
              )
            }}</b>
          </p>
          <p>
            รวมยอดชำระวันรับสินค้า<br /><b>{{
              moneyText(money.totalDueAtPickup, money.currencyCode)
            }}</b>
          </p>
        </div>
        <p class="muted">
          วิธีชำระเงิน / เลขอ้างอิง: {{ payment.method || "—" }} /
          {{ payment.reference || "—" }}
        </p>
        <dl class="mt">
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
          <dt>วันเวลาที่ชำระ</dt>
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
          <h2>QR การจอง</h2>
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
.money {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, 1fr);
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
