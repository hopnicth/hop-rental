<script setup lang="ts">
import QrcodeVue from "qrcode.vue";
import type {
  AdminRentalPrintFormPayload,
  AdminRentalPrintFormType,
} from "~/types/admin-rental-print-form";

definePageMeta({
  layout: false,
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const route = useRoute();
const bookingId = computed(() => String(route.params.id ?? ""));
const formType = computed<AdminRentalPrintFormType>(() =>
  route.query.type === "return" ? "return" : "pickup",
);
const payload = ref<AdminRentalPrintFormPayload | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const title = computed(() =>
  formType.value === "pickup"
    ? "Rental Pickup / Handover Form"
    : "Rental Return Form",
);
const alternateType = computed<AdminRentalPrintFormType>(() =>
  formType.value === "pickup" ? "return" : "pickup",
);

useHead(() => ({ title: `${title.value} · ${bookingId.value}` }));

function formatCurrency(value: number | null | undefined, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatPercent(value: number | null | undefined) {
  const amount = Number(value ?? 0) * 100;
  return `${Number(amount.toFixed(2))}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function printNow() {
  if (import.meta.client) window.print();
}

async function load() {
  if (!bookingId.value) return;
  loading.value = true;
  error.value = null;
  try {
    payload.value = await $fetch<AdminRentalPrintFormPayload>(
      `/api/admin/rental-bookings/${bookingId.value}/print-form`,
      { query: { type: formType.value } },
    );
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load print form";
  } finally {
    loading.value = false;
  }
}

watch(formType, () => void load());
onMounted(() => void load());
</script>

<template>
  <main class="print-page">
    <div class="print-controls no-print">
      <NuxtLink class="link" :to="`/admin/rental-bookings/${bookingId}`">
        ← Booking detail
      </NuxtLink>
      <NuxtLink
        class="link"
        :to="`/admin/rental-bookings/${bookingId}/print?type=${alternateType}`"
      >
        Open {{ alternateType }} form
      </NuxtLink>
      <button class="print-button" :disabled="!payload" @click="printNow">
        Print A5 Form
      </button>
    </div>

    <section v-if="loading" class="screen-state no-print">
      Loading form…
    </section>
    <section v-else-if="error" class="screen-state no-print error">
      <p>{{ error }}</p>
      <button class="print-button" @click="load">Retry</button>
    </section>

    <article v-else-if="payload" class="sheet">
      <header class="form-header">
        <div class="brand-block">
          <img
            v-if="payload.company.logoUrl"
            :src="payload.company.logoUrl"
            alt="Company logo"
            class="logo"
          />
          <div v-else class="logo-fallback">H</div>
          <div>
            <p class="company-name">{{ payload.company.name }}</p>
            <p class="muted">Operational rental evidence form</p>
          </div>
        </div>
        <div class="doc-meta">
          <h1>{{ title }}</h1>
          <p>Booking: {{ payload.booking.code }}</p>
          <p>ID: {{ payload.booking.id }}</p>
        </div>
      </header>

      <section class="two-col compact-section">
        <div>
          <h2>Customer</h2>
          <dl>
            <dt>Name</dt>
            <dd>{{ payload.customer.name }}</dd>
            <dt>Phone</dt>
            <dd>{{ payload.customer.phone || "—" }}</dd>
            <dt>Type</dt>
            <dd>{{ payload.customer.type }}</dd>
            <dt>KYC / ID</dt>
            <dd>
              {{
                payload.customer.kycStatus ||
                payload.customer.idEvidenceRef ||
                "—"
              }}
            </dd>
            <dt>Company</dt>
            <dd>{{ payload.customer.companyName || "—" }}</dd>
            <dt>Tax ID</dt>
            <dd>{{ payload.customer.companyTaxId || "—" }}</dd>
          </dl>
        </div>
        <div>
          <h2>{{ payload.event.label }}</h2>
          <dl>
            <dt>Branch</dt>
            <dd>{{ payload.branch.name || payload.branch.id || "—" }}</dd>
            <dt>Event time</dt>
            <dd>{{ formatDateTime(payload.event.at) }}</dd>
            <dt>Rental start</dt>
            <dd>{{ formatDate(payload.booking.startDate) }}</dd>
            <dt>Rental end</dt>
            <dd>{{ formatDate(payload.booking.endDate) }}</dd>
            <dt>Days</dt>
            <dd>{{ payload.booking.rentalDays }}</dd>
            <dt>Status</dt>
            <dd>{{ payload.booking.status }}</dd>
          </dl>
        </div>
      </section>

      <section class="compact-section">
        <h2>Rental Items</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Asset / SKU</th>
              <th class="right">Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in payload.items"
              :key="`${item.assetCode}-${item.skuId}`"
            >
              <td>{{ item.name }}</td>
              <td>{{ item.assetCode || "—" }} / {{ item.skuId || "—" }}</td>
              <td class="right">{{ item.quantity }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="compact-section">
        <h2>Checklist Summary</h2>
        <div v-if="payload.checklist" class="summary-grid">
          <p>
            <b>{{ payload.checklist.name }}</b>
          </p>
          <p>Status: {{ payload.checklist.status }}</p>
          <p>
            Required: {{ payload.checklist.requiredAnswered }}/{{
              payload.checklist.requiredItems
            }}
          </p>
          <p>
            Passed/Failed: {{ payload.checklist.passedItems }}/{{
              payload.checklist.failedItems
            }}
          </p>
        </div>
        <table v-if="payload.checklist?.items.length" class="mini-table">
          <tbody>
            <tr v-for="item in payload.checklist.items" :key="item.label">
              <td>{{ item.label }}</td>
              <td>{{ item.resultStatus }}</td>
              <td>{{ item.remark || "—" }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">No checklist summary available.</p>
      </section>

      <section class="compact-section">
        <div class="section-heading-row">
          <h2>Payment Model / โครงสร้างการชำระ</h2>
          <p v-if="!payload.money.hasStoredPaymentLines" class="legacy-chip">
            Legacy totals fallback
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Line / รายการ</th>
              <th>Tax / ภาษี</th>
              <th class="right">Gross</th>
              <th class="right">WHT rate</th>
              <th class="right">WHT amount</th>
              <th class="right">Net</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(line, index) in payload.money.paymentLines"
              :key="`${line.lineType}-${index}`"
            >
              <td>
                <div class="line-title">{{ line.descriptionEn }}</div>
                <div class="line-subtitle">{{ line.descriptionTh }}</div>
              </td>
              <td>
                <div>{{ line.taxCategory }}</div>
                <div v-if="line.isLegacyFallback" class="line-subtitle">
                  legacy fallback
                </div>
              </td>
              <td class="right">
                {{
                  formatCurrency(line.grossAmount, payload.money.currencyCode)
                }}
              </td>
              <td class="right">{{ formatPercent(line.whtRate) }}</td>
              <td class="right">
                {{ formatCurrency(line.whtAmount, payload.money.currencyCode) }}
              </td>
              <td class="right">
                {{
                  formatCurrency(
                    line.netPayableAmount,
                    payload.money.currencyCode,
                  )
                }}
              </td>
            </tr>
          </tbody>
        </table>

        <div class="money-summary-grid">
          <div class="money-summary-item">
            <p class="money-summary-label">
              Rental Fee (due at return) / ค่าเช่า (ชำระวันคืนสินค้า)
            </p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.rentalFeeDue,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">Booking Deposit / เงินมัดจำจอง</p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.bookingDepositDueNow,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">
              Full Refundable Security Deposit required /
              เงินมัดจำประกันเต็มจำนวน
            </p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.securityDepositRequired,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">
              Remaining Security Deposit due at pickup /
              เงินมัดจำประกันคงเหลือที่ต้องชำระวันรับสินค้า
            </p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.remainingSecurityDepositDueAtPickup,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">WHT rate / อัตราหักภาษี ณ ที่จ่าย</p>
            <p class="money-summary-value">
              {{ payload.money.whtRateDisplay }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">
              WHT amount / จำนวนภาษีหัก ณ ที่จ่าย
            </p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.whtTotal,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">Net payable now / ชำระสุทธิขณะนี้</p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.netPayableNow,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
          <div class="money-summary-item">
            <p class="money-summary-label">
              Deposit due at pickup / รวมยอดมัดจำวันที่รับสินค้า
            </p>
            <p class="money-summary-value">
              {{
                formatCurrency(
                  payload.money.netPayableAtPickup,
                  payload.money.currencyCode,
                )
              }}
            </p>
          </div>
        </div>

        <div class="money-notices">
          <p v-if="payload.money.bookingDepositDueNow > 0">
            <b>{{ payload.money.notices.bookingDeposit.label }}</b> —
            {{ payload.money.notices.bookingDeposit.en }}
          </p>
          <p v-if="payload.money.bookingDepositDueNow > 0" class="thai-copy">
            {{ payload.money.notices.bookingDeposit.th }}
          </p>
          <p v-if="payload.money.securityDepositRequired > 0">
            <b>{{ payload.money.notices.refundableSecurityDeposit.label }}</b> —
            {{ payload.money.notices.refundableSecurityDeposit.en }}
          </p>
          <p v-if="payload.money.securityDepositRequired > 0" class="thai-copy">
            {{ payload.money.notices.refundableSecurityDeposit.th }}
          </p>
        </div>
      </section>

      <section class="two-col compact-section">
        <div>
          <h2>Payment Status</h2>
          <dl>
            <dt>Deposit recorded</dt>
            <dd>
              {{
                formatCurrency(
                  payload.money.depositPaid,
                  payload.money.currencyCode,
                )
              }}
            </dd>
            <dt>Payment</dt>
            <dd>
              {{ payload.money.paymentMethod || "—" }} /
              {{ payload.money.paymentStatus }}
            </dd>
            <dt>Gross total</dt>
            <dd>
              {{
                formatCurrency(
                  payload.money.grossTotal,
                  payload.money.currencyCode,
                )
              }}
            </dd>
            <dt>Net payable total</dt>
            <dd>
              {{
                formatCurrency(
                  payload.money.netPayableTotal,
                  payload.money.currencyCode,
                )
              }}
            </dd>
          </dl>
        </div>
        <div>
          <h2>Return / Refund</h2>
          <dl>
            <dt>Deductions</dt>
            <dd>
              {{
                formatCurrency(
                  payload.money.totalDeductions,
                  payload.money.currencyCode,
                )
              }}
            </dd>
            <dt>Refund</dt>
            <dd>
              {{
                formatCurrency(
                  payload.money.refundAmount,
                  payload.money.currencyCode,
                )
              }}
            </dd>
            <dt>Extra charge</dt>
            <dd>
              {{
                formatCurrency(
                  payload.money.additionalChargeAmount,
                  payload.money.currencyCode,
                )
              }}
            </dd>
            <dt>Refund status</dt>
            <dd>{{ payload.money.refundStatus }}</dd>
            <dt>Refund method</dt>
            <dd>{{ payload.money.refundMethod || "—" }}</dd>
          </dl>
        </div>
      </section>

      <section v-if="payload.type === 'return'" class="compact-section">
        <h2>Return Condition / Deductions</h2>
        <table v-if="payload.deductions.length">
          <tbody>
            <tr v-for="row in payload.deductions" :key="row.label">
              <td>{{ row.label }}</td>
              <td>{{ row.notes || "—" }}</td>
              <td class="right">
                {{ formatCurrency(row.amount, payload.money.currencyCode) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else>
          {{ payload.returnConditionNotes || "No return deductions recorded." }}
        </p>
      </section>

      <section class="compact-section notes-section">
        <h2>Notes</h2>
        <p>{{ payload.event.notes || payload.checklist?.notes || "—" }}</p>
      </section>

      <section class="compact-section qr-section">
        <div>
          <h2>Booking QR / QR การจอง</h2>
          <p class="muted">
            Scan booking QR only. No receipt/tax invoice verification.
          </p>
          <p class="mono">{{ payload.booking.qrValue }}</p>
        </div>
        <div class="qr-box">
          <QrcodeVue :value="payload.booking.qrValue" :size="92" level="H" />
        </div>
      </section>

      <section class="signatures">
        <div class="signature-box">
          <p class="sig-label">
            {{
              payload.type === "pickup"
                ? "Pickup signature"
                : "Return acknowledgment signature"
            }}
          </p>
          <img
            v-if="payload.event.signatureUrl"
            :src="payload.event.signatureUrl"
            alt="Customer signature"
          />
        </div>
        <div class="signature-box">
          <p class="sig-label">Staff name / signature</p>
          <p class="staff-name">{{ payload.event.staffName || "—" }}</p>
        </div>
      </section>

      <footer class="disclaimer">
        <p>{{ payload.disclaimer.th }}</p>
        <p>{{ payload.disclaimer.en }}</p>
        <p class="muted">
          Generated: {{ formatDateTime(payload.generatedAt) }}
        </p>
      </footer>
    </article>
  </main>
</template>

<style>
@page {
  size: A5 portrait;
  margin: 8mm;
}

html,
body {
  background: #f1f5f9;
}

.print-page {
  color: #111827;
  font-family: Arial, "Noto Sans Thai", sans-serif;
  font-size: 8.5pt;
  line-height: 1.25;
}

.print-controls {
  align-items: center;
  display: flex;
  gap: 10px;
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
  cursor: pointer;
  padding: 8px 12px;
}

.screen-state {
  margin: 24px auto;
  max-width: 148mm;
  padding: 16px;
}

.screen-state.error {
  color: #b91c1c;
}

.sheet {
  background: white;
  box-shadow: 0 12px 40px rgb(15 23 42 / 14%);
  margin: 0 auto 24px;
  min-height: 210mm;
  padding: 8mm;
  width: 148mm;
}

.form-header,
.brand-block,
.two-col,
.signatures {
  display: grid;
  gap: 4mm;
}

.form-header {
  align-items: start;
  border-bottom: 0.25mm solid #111827;
  grid-template-columns: 1fr 1fr;
  padding-bottom: 3mm;
}

.brand-block {
  align-items: center;
  display: flex;
}

.logo,
.logo-fallback {
  height: 12mm;
  width: 12mm;
}

.logo-fallback {
  align-items: center;
  border: 0.25mm solid #111827;
  display: flex;
  font-size: 12pt;
  font-weight: 700;
  justify-content: center;
}

.company-name {
  font-size: 12pt;
  font-weight: 700;
}

h1 {
  font-size: 15pt;
  line-height: 1.1;
  margin: 0 0 1mm;
}

h2 {
  font-size: 9.5pt;
  margin: 0 0 1.5mm;
}

p {
  margin: 0;
}

.doc-meta {
  text-align: right;
}

.compact-section {
  border: 0.2mm solid #cbd5e1;
  margin-top: 2.5mm;
  padding: 2mm;
}

.section-heading-row,
.qr-section {
  align-items: start;
  display: flex;
  gap: 3mm;
  justify-content: space-between;
}

.two-col {
  grid-template-columns: 1fr 1fr;
}

dl {
  display: grid;
  grid-template-columns: 23mm 1fr;
  margin: 0;
  row-gap: 0.7mm;
}

dt {
  color: #475569;
}

dd {
  margin: 0;
}

table {
  border-collapse: collapse;
  font-size: 8pt;
  width: 100%;
}

th,
td {
  border: 0.2mm solid #cbd5e1;
  padding: 1mm 1.2mm;
  vertical-align: top;
}

th {
  background: #f8fafc;
  font-weight: 700;
}

.right {
  text-align: right;
}

.summary-grid {
  display: grid;
  gap: 1mm;
  grid-template-columns: 1.2fr 0.8fr 0.8fr 0.8fr;
}

.money-summary-grid {
  display: grid;
  gap: 1.5mm 3mm;
  grid-template-columns: 1fr 1fr;
  margin-top: 2mm;
}

.money-summary-label {
  color: #475569;
}

.money-summary-value {
  font-weight: 700;
  margin-top: 0.3mm;
}

.money-notices {
  border-top: 0.2mm solid #cbd5e1;
  display: grid;
  gap: 1mm;
  margin-top: 2mm;
  padding-top: 1.5mm;
}

.line-title {
  font-weight: 700;
}

.line-subtitle,
.thai-copy,
.legacy-chip {
  color: #64748b;
}

.legacy-chip {
  border: 0.2mm solid #cbd5e1;
  border-radius: 999px;
  padding: 0.8mm 2mm;
}

.mini-table {
  margin-top: 1.5mm;
}

.notes-section {
  min-height: 10mm;
}

.qr-box {
  align-items: center;
  background: white;
  border: 0.2mm solid #cbd5e1;
  display: flex;
  justify-content: center;
  min-height: 28mm;
  min-width: 28mm;
  padding: 2mm;
}

.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 7pt;
  word-break: break-all;
}

.signatures {
  grid-template-columns: 1fr 1fr;
  margin-top: 3mm;
}

.signature-box {
  border: 0.25mm solid #111827;
  height: 22mm;
  padding: 1.5mm;
}

.signature-box img {
  display: block;
  height: 16mm;
  margin: 0 auto;
  max-width: 100%;
  object-fit: contain;
}

.sig-label,
.muted {
  color: #64748b;
}

.staff-name {
  margin-top: 8mm;
  text-align: center;
}

.disclaimer {
  border-top: 0.2mm solid #cbd5e1;
  font-size: 6.8pt;
  margin-top: 2.5mm;
  padding-top: 1.5mm;
}

@media print {
  html,
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
