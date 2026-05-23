<script setup lang="ts">
import QrcodeVue from "qrcode.vue";
import OfficialDocumentHeader from "~/components/documents/OfficialDocumentHeader.vue";
import type {
  AdminDocumentEventType,
  AdminOfficialDocumentDetail,
  AdminOperationalRentalDocumentSnapshot,
} from "~/types/admin-documents";

const NO_SHOW_RECEIPT_TITLE = "ใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า";
const NO_SHOW_NOTICE_TITLE = "หนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า";
const RECEIPT_NON_TAX_NOTE =
  "เอกสารฉบับนี้เป็นใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า ไม่ใช่ใบกำกับภาษี ไม่อยู่ในฐานภาษีมูลค่าเพิ่ม และไม่ใช่เอกสารหัก ณ ที่จ่าย";
const RECEIPT_PAID_EARLIER_NOTE =
  "เงินจำนวนนี้ได้รับชำระไว้แล้วในวันจอง และถูกริบตามเงื่อนไขการจอง ณ วันที่ระบุในเอกสารฉบับนี้";
const NOTICE_NON_TAX_NOTE =
  "เอกสารฉบับนี้เป็นหนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า ไม่ใช่ใบเสร็จรับเงิน และไม่ใช่ใบกำกับภาษี";

definePageMeta({
  layout: false,
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

const route = useRoute();
const documentId = computed(() => String(route.params.id ?? ""));
const documentRow = ref<AdminOfficialDocumentDetail | null>(null);
const loading = ref(false);
const printing = ref(false);
const error = ref<string | null>(null);
const reprintReason = ref("");

const snapshot = computed(
  () =>
    documentRow.value?.snapshot as AdminOperationalRentalDocumentSnapshot | any,
);
const payload = computed(() => snapshot.value?.payload ?? null);
const booking = computed(() => snapshot.value?.booking ?? {});
const customer = computed(() => snapshot.value?.customer ?? {});
const financialRecognition = computed(
  () => snapshot.value?.financial_recognition ?? {},
);
const depositDisposition = computed(
  () => snapshot.value?.deposit_disposition ?? {},
);
const noShow = computed(() => snapshot.value?.no_show ?? {});
const terms = computed(() => snapshot.value?.terms ?? {});
const tax = computed(() => snapshot.value?.tax ?? {});
const documentHeader = computed<Record<string, unknown>>(
  () => snapshot.value?.header ?? {},
);
const isReprint = computed(() => (documentRow.value?.printCount ?? 0) > 0);
const isNoShowForfeitureReceipt = computed(
  () =>
    snapshot.value?.document?.document_type ===
    "booking_deposit_forfeiture_ordinary_receipt",
);
const isNoShowForfeitureNotice = computed(
  () =>
    snapshot.value?.document?.document_type ===
    "rental_booking_no_show_forfeiture_notice",
);
const isNoShowForfeitureDocument = computed(
  () => isNoShowForfeitureReceipt.value || isNoShowForfeitureNotice.value,
);
const isBdcDocument = computed(
  () =>
    snapshot.value?.document?.template_key ===
    "rental_booking_deposit_confirmation_v1",
);
const bookedItem = computed(() => snapshot.value?.booked_item ?? {});
const title = computed(() => {
  if (isBdcDocument.value) {
    return "เอกสารยืนยันการรับเงินมัดจำการจอง";
  }
  if (isNoShowForfeitureReceipt.value) {
    return NO_SHOW_RECEIPT_TITLE;
  }
  if (isNoShowForfeitureNotice.value) {
    return NO_SHOW_NOTICE_TITLE;
  }
  if (snapshot.value?.document.document_type === "rental_return_form") {
    return "Rental Return Form";
  }
  return "Rental Pickup / Handover Form";
});
const bookingDetailId = computed(
  () => payload.value?.booking?.id || booking.value?.id || null,
);

useHead(() => ({
  title: `${snapshot.value?.document.document_number ?? "Document"} · Print`,
}));

function formatCurrency(value: unknown, currency = "THB") {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function formatDateTime(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(String(value)));
}

function formatDate(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

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

function formatOptionalCurrency(value: unknown, currency = "THB") {
  if (value === undefined || value === null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return formatCurrency(amount, currency);
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
const noShowReason = computed(
  () =>
    clean(pick(noShow.value, "reason")) ||
    clean(pick(depositDisposition.value, "reason")) ||
    "ลูกค้าไม่มารับสินค้าตามวันและเวลาที่นัดหมาย",
);
const termsReference = computed(
  () =>
    pick(terms.value, "accepted_terms_version") ||
    pick(terms.value, "agreement_version_id") ||
    pick(terms.value, "booking_deposit_agreement_id") ||
    "—",
);

async function load() {
  if (!documentId.value) return;
  loading.value = true;
  error.value = null;
  try {
    const response = await $fetch<{ document: AdminOfficialDocumentDetail }>(
      `/api/admin/documents/${documentId.value}`,
    );
    documentRow.value = response.document;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load document";
  } finally {
    loading.value = false;
  }
}

async function recordAndPrint() {
  if (!documentRow.value) return;
  if (isReprint.value && reprintReason.value.trim().length === 0) {
    error.value = "Reprint reason is required";
    return;
  }
  printing.value = true;
  error.value = null;
  try {
    const eventType: AdminDocumentEventType = isReprint.value
      ? "reprinted"
      : "printed";
    const response = await $fetch<{ document: AdminOfficialDocumentDetail }>(
      `/api/admin/documents/${documentRow.value.id}/events`,
      {
        method: "POST",
        body: {
          eventType,
          reason: isReprint.value ? reprintReason.value.trim() : null,
          metadata: { copyMode: "browser_print" },
        },
      },
    );
    documentRow.value = response.document;
    await nextTick();
    window.print();
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : "Failed to record print event";
  } finally {
    printing.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <main class="print-page">
    <div class="print-controls no-print">
      <NuxtLink
        v-if="bookingDetailId"
        class="link"
        :to="`/admin/rental-bookings/${bookingDetailId}`"
      >
        ← Booking detail
      </NuxtLink>
      <input
        v-if="isReprint"
        v-model="reprintReason"
        class="reason-input"
        placeholder="Reprint reason"
      />
      <button
        class="print-button"
        :disabled="!documentRow || printing"
        @click="recordAndPrint"
      >
        {{ isReprint ? "Record Reprint & Print" : "Record Print & Print" }}
      </button>
    </div>

    <section v-if="loading" class="screen-state no-print">
      Loading document…
    </section>
    <section v-else-if="error" class="screen-state no-print error">
      <p>{{ error }}</p>
      <button class="print-button" @click="load">Retry</button>
    </section>

    <!-- BDC: เอกสารยืนยันการรับเงินมัดจำการจอง -->
    <article v-else-if="snapshot && isBdcDocument" class="sheet">
      <OfficialDocumentHeader
        :header="documentHeader"
        :title="title"
        :document-number="snapshot.document.document_number"
        :issued-at-text="formatDateTime(snapshot.document.issued_at)"
        :booking-reference="booking.reference || booking.id || '—'"
        :qr-value="booking.qr_value || null"
        show-booking-reference
      />

      <section class="compact-section">
        <p>
          เอกสารนี้ยืนยันว่าได้รับเงินมัดจำการจองเรียบร้อยแล้ว
          เงินมัดจำดังกล่าวจะถูกนำมาหักกับยอดชำระเมื่อคืนสินค้า
        </p>
      </section>

      <section class="compact-section">
        <h2>รายการของที่จอง</h2>
        <dl>
          <dt>สินค้า</dt>
          <dd>{{ bookedItem.asset_name || "—" }}</dd>
        </dl>
      </section>

      <section class="two-col compact-section">
        <div>
          <h2>ข้อมูลเงินมัดจำ</h2>
          <dl>
            <dt>จำนวนเงินมัดจำ</dt>
            <dd>
              {{
                formatOptionalCurrency(
                  snapshot.held_balance_event?.amount,
                  snapshot.held_balance_event?.currency_code || "THB",
                )
              }}
            </dd>
            <dt>วิธีชำระ</dt>
            <dd>{{ snapshot.held_balance_event?.payment_method || "—" }}</dd>
            <dt>วันที่รับเงิน</dt>
            <dd>
              {{ formatDateTime(snapshot.held_balance_event?.occurred_at) }}
            </dd>
          </dl>
        </div>
        <div>
          <h2>ข้อมูลการจอง</h2>
          <dl>
            <dt>เลขที่การจอง</dt>
            <dd>{{ booking.reference || booking.id || "—" }}</dd>
            <dt>วันที่เริ่มเช่า</dt>
            <dd>{{ formatDate(booking.start_date) }}</dd>
            <dt>วันที่สิ้นสุด</dt>
            <dd>{{ formatDate(booking.end_date) }}</dd>
            <dt>จำนวนวัน</dt>
            <dd>{{ booking.rental_days || "—" }}</dd>
          </dl>
        </div>
      </section>

      <section class="compact-section">
        <h2>ข้อมูลลูกค้า</h2>
        <dl>
          <dt>ชื่อผู้จอง</dt>
          <dd>{{ customer.display_name || "—" }}</dd>
          <dt>เบอร์โทรศัพท์</dt>
          <dd>{{ customer.walk_in_phone || "—" }}</dd>
        </dl>
      </section>

      <footer class="disclaimer">
        <p>{{ snapshot.disclaimer?.th }}</p>
        <p class="muted">
          จำนวนครั้งที่พิมพ์: {{ documentRow?.printCount ?? 0 }}
        </p>
      </footer>
    </article>

    <article
      v-else-if="snapshot && payload && !isNoShowForfeitureDocument"
      class="sheet"
    >
      <OfficialDocumentHeader
        :header="documentHeader"
        :title="title"
        :document-number="snapshot.document.document_number"
        :issued-at-text="formatDateTime(snapshot.document.issued_at)"
        :booking-reference="payload.booking.code"
        :qr-value="payload.booking.qrValue"
        show-booking-reference
      />

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
        <h2>Checklist / รายการตรวจสอบ</h2>
        <div v-if="payload.checklist">
          <p class="checklist-meta">
            {{ payload.checklist.name }} ·
            {{
              payload.checklist.completedAt
                ? formatDateTime(payload.checklist.completedAt)
                : payload.checklist.status
            }}
          </p>
          <table class="mini-table checklist-table">
            <tbody>
              <tr v-for="item in payload.checklist.items" :key="item.label">
                <td class="check-mark" :class="`status-${item.resultStatus}`">
                  {{
                    item.resultStatus === "passed"
                      ? "✓"
                      : item.resultStatus === "failed"
                        ? "✗"
                        : item.resultStatus === "not_applicable"
                          ? "N/A"
                          : "—"
                  }}
                </td>
                <td class="check-label">
                  <span>{{ item.label }}</span>
                  <span v-if="item.instruction" class="check-instruction">{{
                    item.instruction
                  }}</span>
                  <span v-if="item.remark" class="check-remark-inline">{{
                    item.remark
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted">No checklist available.</p>
      </section>

      <!-- Pickup: simple deposit summary -->
      <section v-if="payload.type === 'pickup'" class="compact-section">
        <h2>Deposit Summary / ยอดมัดจำประกันที่รับรวม</h2>
        <table class="deposit-table">
          <tbody>
            <tr v-if="payload.money.bookingDepositDueNow > 0">
              <td>Online Booking Deposit / มัดจำจองออนไลน์</td>
              <td class="right">
                {{
                  formatCurrency(
                    payload.money.bookingDepositDueNow,
                    payload.money.currencyCode,
                  )
                }}
              </td>
            </tr>
            <tr v-if="payload.money.remainingSecurityDepositDueAtPickup > 0">
              <td>
                Deposit at Pickup ·
                {{ payload.branch.name || payload.branch.id || "—" }}
              </td>
              <td class="right">
                {{
                  formatCurrency(
                    payload.money.remainingSecurityDepositDueAtPickup,
                    payload.money.currencyCode,
                  )
                }}
              </td>
            </tr>
            <tr class="deposit-total">
              <td><b>Total / รวมมัดจำประกัน</b></td>
              <td class="right">
                <b>{{
                  formatCurrency(
                    (payload.money.bookingDepositDueNow || 0) +
                      (payload.money.remainingSecurityDepositDueAtPickup || 0),
                    payload.money.currencyCode,
                  )
                }}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Return: money summary -->
      <section v-if="payload.type === 'return'" class="compact-section">
        <h2>Deposit / Refund Summary</h2>
        <table class="deposit-table">
          <tbody>
            <tr>
              <td>Deposit Recorded</td>
              <td class="right">
                {{
                  formatCurrency(
                    payload.money.depositPaid,
                    payload.money.currencyCode,
                  )
                }}
              </td>
            </tr>
            <tr v-if="payload.money.totalDeductions > 0">
              <td>Deductions</td>
              <td class="right">
                {{
                  formatCurrency(
                    payload.money.totalDeductions,
                    payload.money.currencyCode,
                  )
                }}
              </td>
            </tr>
            <tr class="deposit-total">
              <td><b>Refund Amount</b></td>
              <td class="right">
                <b>{{
                  formatCurrency(
                    payload.money.refundAmount,
                    payload.money.currencyCode,
                  )
                }}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Customer signature only -->
      <section class="compact-section">
        <h2>
          {{
            payload.type === "pickup"
              ? "Customer Signature / ลายเซ็นผู้รับสินค้า"
              : "Return Signature / ลายเซ็นผู้คืนสินค้า"
          }}
        </h2>
        <div class="signature-box-full">
          <img
            v-if="payload.event.signatureUrl"
            :src="payload.event.signatureUrl"
            alt="Customer signature"
          />
          <p v-else class="muted">—</p>
        </div>
      </section>

      <footer class="disclaimer">
        <p>{{ snapshot.disclaimer.th }}</p>
        <p>{{ snapshot.disclaimer.en }}</p>
        <p class="muted">Print count: {{ documentRow?.printCount ?? 0 }}</p>
      </footer>
    </article>

    <article
      v-else-if="snapshot && isNoShowForfeitureDocument"
      class="sheet no-show-sheet"
    >
      <OfficialDocumentHeader
        :header="documentHeader"
        :title="title"
        :document-number="snapshot.document.document_number"
        :issued-at-text="formatDateTime(snapshot.document.issued_at)"
        :booking-reference="booking.reference || booking.id || '—'"
        show-booking-reference
      />

      <section class="two-col compact-section">
        <div>
          <h2>ข้อมูลลูกค้า</h2>
          <dl>
            <dt>ชื่อลูกค้า</dt>
            <dd>{{ customer.display_name || customer.booker_name || "—" }}</dd>
            <dt>เบอร์โทรศัพท์</dt>
            <dd>{{ customer.phone || "—" }}</dd>
            <dt>อีเมล</dt>
            <dd>{{ customer.email || "—" }}</dd>
          </dl>
        </div>
        <div>
          <h2>รายละเอียดการจอง</h2>
          <dl>
            <dt>เลขที่การจอง</dt>
            <dd>{{ booking.reference || booking.id || "—" }}</dd>
            <dt>รายการเช่า</dt>
            <dd>{{ booking.item_name || "—" }}</dd>
            <dt>วันที่นัดรับสินค้า</dt>
            <dd>
              {{
                formatDate(
                  noShow.pickup_date_snapshot || booking.scheduled_pickup_date,
                )
              }}
            </dd>
            <dt>สาขา/จุดรับสินค้า</dt>
            <dd>{{ booking.hub_name || booking.hub_id || "—" }}</dd>
          </dl>
        </div>
      </section>

      <section v-if="isNoShowForfeitureReceipt" class="compact-section">
        <h2>รายละเอียดใบรับเงินค่าริบเงินมัดจำจอง</h2>
        <dl>
          <dt>จำนวนเงินมัดจำจองที่ถูกริบ</dt>
          <dd>{{ formatOptionalCurrency(forfeitedAmount, noShowCurrency) }}</dd>
          <dt>วันที่บันทึกไม่มารับสินค้า</dt>
          <dd>{{ formatDateTime(noShow.marked_at) }}</dd>
          <dt>วันที่รับรู้การริบเงินมัดจำ</dt>
          <dd>{{ formatDateTime(financialRecognition.recognized_at) }}</dd>
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
        <p class="muted mt-2">{{ RECEIPT_NON_TAX_NOTE }}</p>
        <p class="muted mt-2">{{ RECEIPT_PAID_EARLIER_NOTE }}</p>
      </section>

      <section v-else class="compact-section">
        <h2>รายละเอียดหนังสือแจ้งการริบเงินมัดจำจอง</h2>
        <dl>
          <dt>วันที่นัดรับสินค้า</dt>
          <dd>
            {{
              formatDate(
                noShow.pickup_date_snapshot || booking.scheduled_pickup_date,
              )
            }}
          </dd>
          <dt>วันที่บันทึกไม่มารับสินค้า</dt>
          <dd>{{ formatDateTime(noShow.marked_at) }}</dd>
          <dt>จำนวนเงินมัดจำจองที่ถูกริบ</dt>
          <dd>{{ formatOptionalCurrency(forfeitedAmount, noShowCurrency) }}</dd>
          <dt>ยอดเงินคืน</dt>
          <dd>{{ formatCurrency(0, noShowCurrency) }}</dd>
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
          <dt>เงื่อนไขอ้างอิง</dt>
          <dd>{{ termsReference }}</dd>
        </dl>
        <p class="muted mt-2">{{ NOTICE_NON_TAX_NOTE }}</p>
        <p class="muted mt-2">
          ลูกค้าไม่มารับสินค้าตามวันที่นัดหมาย
          รายการจองจึงถูกบันทึกเป็นไม่มารับสินค้า และ HOPNIC
          ริบเงินมัดจำจองตามเงื่อนไขการจอง โดยไม่มีเงินคืน
        </p>
      </section>

      <footer class="disclaimer">
        <p>{{ snapshot.disclaimer?.th }}</p>
        <p class="muted">
          จำนวนครั้งที่พิมพ์: {{ documentRow?.printCount ?? 0 }}
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
.reason-input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  min-width: 220px;
  padding: 8px;
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
.form-header {
  align-items: start;
  border-bottom: 0.25mm solid #111827;
  display: grid;
  gap: 4mm;
  grid-template-columns: 1fr 1fr;
  padding-bottom: 3mm;
}
.brand-block {
  align-items: center;
  display: flex;
  gap: 4mm;
}
.logo,
.logo-fallback {
  height: 12mm;
  width: 12mm;
}
.logo {
  object-fit: contain;
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
.two-col,
.signatures {
  display: grid;
  gap: 4mm;
  grid-template-columns: 1fr 1fr;
}
dl {
  display: grid;
  grid-template-columns: 23mm 1fr;
  margin: 0;
  row-gap: 0.7mm;
}
dt,
.muted,
.sig-label {
  color: #64748b;
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
.money-grid {
  display: grid;
  gap: 2mm;
  grid-template-columns: 1fr 1fr 1fr;
}
.qr-section {
  align-items: start;
  display: flex;
  justify-content: space-between;
}
.qr-box {
  align-items: center;
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
/* ── OfficialDocumentHeader: scale for A5 ──────────────────────────────── */
.official-document-header {
  gap: 10px !important;
  padding-bottom: 8px !important;
}
.official-document-header .company-logo {
  height: 13mm !important;
  width: 13mm !important;
}
.official-document-header .brand-name {
  font-size: 13pt !important;
}
.official-document-header .document-block h1 {
  font-size: 13pt !important;
  margin-bottom: 3px !important;
}
.official-document-header .document-block p,
.official-document-header .muted {
  font-size: 8pt !important;
}
.official-document-header .company-block {
  gap: 6px !important;
}

/* ── Checklist ─────────────────────────────────────────────────────────── */
.checklist-meta {
  color: #475569;
  font-size: 8pt;
  margin-bottom: 1.5mm;
}
.checklist-table td {
  vertical-align: top;
}
.check-mark {
  font-size: 9pt;
  text-align: center;
  white-space: nowrap;
  width: 6mm;
}
.status-passed {
  color: #15803d;
}
.status-failed {
  color: #b91c1c;
}
.status-not_applicable {
  color: #64748b;
}
.check-label {
  display: flex;
  flex-direction: column;
  gap: 0.3mm;
}
.check-instruction {
  color: #64748b;
  font-size: 7.5pt;
}
.check-remark-inline {
  color: #94a3b8;
  font-size: 7pt;
  font-style: italic;
}

/* ── Deposit Summary ────────────────────────────────────────────────────── */
.deposit-table td {
  border: none;
  padding: 0.8mm 1mm;
}
.deposit-total td {
  border-top: 0.2mm solid #111827;
  font-weight: 700;
  padding-top: 1mm;
}

/* ── Customer signature (single full-width box) ─────────────────────────── */
.signature-box-full {
  border: 0.25mm solid #111827;
  height: 24mm;
  margin-top: 1.5mm;
  padding: 1.5mm;
}
.signature-box-full img {
  display: block;
  height: 18mm;
  margin: 0 auto;
  max-width: 100%;
  object-fit: contain;
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
