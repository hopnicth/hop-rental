<script setup lang="ts">
/**
 * OVERDUE & ADJUSTMENTS REPORT — print view (CHiP-ratified layout, 2026-07-27).
 *
 * The sheet Admin bills from, now that the web collects only the booked rental.
 * It is deliberately NOT a document: no OfficialDocumentHeader (that shared
 * theme is the visual signature of an ISSUED document — template principle 2),
 * no document number, no series, no sequence consumed, and NO COMPUTED TOTAL.
 * The accounting program does the arithmetic; this page only carries the facts.
 *
 * Any deviation from the ratified six fields goes back to CHiP.
 *
 * ROUTE SHAPE — deliberately NOT nested under `rental-bookings/[id]/`. That
 * directory sits beside `[id].vue`, which makes its children NESTED routes that
 * only render if the parent contains <NuxtPage/> — and it does not. The existing
 * `[id]/print.vue` is dead for exactly that reason (recorded in BACKLOG). A flat
 * `/admin/rental-bookings/overdue-report/:id` avoids the trap without touching
 * that shared page.
 */
definePageMeta({
  layout: false,
  middleware: ["role"],
  platformRoles: ["staff", "super_admin"],
});

interface OverdueReport {
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  bookedStartDate: string;
  bookedEndDate: string;
  actualReturnDate: string;
  lateDays: number;
  dailyRateAsBooked: number;
  currencyCode: string;
  staffMemo: string;
  customerSignature: { url: string; signedAt: string } | null;
  recordedByStaffName: string;
  recordedAt: string;
}

const route = useRoute();
const bookingId = computed(() => String(route.params.id ?? ""));
const report = ref<OverdueReport | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

useHead(() => ({ title: `รายงานการคืนเกินกำหนด · ${bookingId.value}` }));

function date(value: unknown) {
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "long",
        timeZone: "Asia/Bangkok",
      }).format(new Date(String(value).length <= 10 ? `${value}T00:00:00.000Z` : String(value)))
    : "—";
}
function dateTime(value: unknown) {
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(String(value)))
    : "—";
}
function rate(value: number, currency: string) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: currency || "THB",
    minimumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

/** `window` is not in template scope in Vue — the print action needs a method. */
function printPage() {
  if (import.meta.client) window.print();
}

onMounted(async () => {
  try {
    report.value = await $fetch<OverdueReport>(
      `/api/admin/rental-bookings/${bookingId.value}/overdue-report`,
    );
  } catch (e) {
    const err = e as { data?: { statusMessage?: string } };
    error.value = err?.data?.statusMessage ?? "ไม่พบข้อมูลการคืนล่าช้าของการจองนี้";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="page">
    <div v-if="loading" class="state">กำลังโหลด…</div>
    <div v-else-if="error" class="state">{{ error }}</div>

    <template v-else-if="report">
      <div class="no-print actions">
        <button type="button" @click="printPage">พิมพ์</button>
      </div>

      <div class="sheet">
        <!-- PLAIN header. Deliberately NOT OfficialDocumentHeader. -->
        <header class="head">
          <p class="company">บริษัท ฮอปนิค จำกัด</p>
          <h1 class="title">
            รายงานการคืนเกินกำหนด และรายการเรียกเก็บเพิ่มเติม
          </h1>
          <p class="disclaimer">
            เอกสารภายในสำหรับการออกบิล — ไม่ใช่ใบกำกับภาษี/ใบเสร็จรับเงิน
          </p>
        </header>

        <dl class="fields">
          <div class="row">
            <dt>เลขที่การจอง</dt>
            <dd>{{ report.bookingNumber }}</dd>
          </div>
          <div class="row">
            <dt>ลูกค้า</dt>
            <dd>{{ report.customerName || "—" }} · {{ report.customerPhone || "—" }}</dd>
          </div>
          <div class="row">
            <dt>ช่วงเช่าตามจอง</dt>
            <dd>{{ date(report.bookedStartDate) }} — {{ date(report.bookedEndDate) }}</dd>
          </div>
          <div class="row">
            <dt>วันที่คืนจริง</dt>
            <dd>{{ date(report.actualReturnDate) }}</dd>
          </div>
          <div class="row">
            <dt>จำนวนวันที่เกิน</dt>
            <dd>{{ report.lateDays }} วัน</dd>
          </div>
          <div class="row">
            <dt>ค่าเช่าตามจอง</dt>
            <dd>{{ rate(report.dailyRateAsBooked, report.currencyCode) }} / วัน</dd>
          </div>
        </dl>

        <!-- [AMENDED] Full-width block of its own — heading line, then the
             memo body on its own lines with the staff's line breaks intact. -->
        <section class="memo">
          <h2 class="memo-head">หมายเหตุจากเจ้าหน้าที่</h2>
          <p class="memo-body">{{ report.staffMemo }}</p>
        </section>

        <!-- [AMENDED, ruling ก] SIGNATURE BLOCK — reuses the digital signature
             captured when the customer CONFIRMED THE RETURN. No blank signature
             line is ever printed: the customer must not sign twice, and must not
             appear to have signed this sheet, which they have not seen. The
             caption therefore attributes the signature to the return
             confirmation and its own timestamp. -->
        <section class="signatures">
          <!-- Both columns share ONE geometry — a fixed zone whose content sits
               on the same baseline, then rule, name, caption at identical
               heights. Every rule has text directly above it, so neither column
               ever offers an empty space to sign. -->
          <div class="sig">
            <div class="sig-zone">
              <img
                v-if="report.customerSignature"
                class="sig-image"
                :src="report.customerSignature.url"
                alt="ลายเซ็นผู้เช่าจากการยืนยันการคืนสินค้า"
              />
              <p v-else class="sig-missing">ไม่มีลายเซ็นบันทึกในระบบ</p>
            </div>
            <p class="sig-name">{{ report.customerName || "—" }}</p>
            <p v-if="report.customerSignature" class="sig-caption">
              ลายเซ็นผู้เช่าจากการยืนยันการคืนสินค้า เมื่อ
              {{ dateTime(report.customerSignature.signedAt) }}
            </p>
          </div>

          <div class="sig">
            <div class="sig-zone">
              <p class="sig-role">เจ้าหน้าที่ผู้บันทึก</p>
            </div>
            <p class="sig-name">{{ report.recordedByStaffName || "—" }}</p>
            <p class="sig-caption">{{ dateTime(report.recordedAt) }}</p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* A4 — a report, not a document. The A5 format in printing-document-standard.md
   governs ISSUED DOCUMENTS; this sheet must not read as one, and the different
   paper size reinforces that. */
@page {
  size: A4 portrait;
  margin: 18mm 16mm;
}

.page {
  background: #f4f4f5;
  min-height: 100vh;
  padding: 16px;
}
.state {
  font-family: "Sarabun", "Noto Sans Thai", sans-serif;
  padding: 24px;
}
.actions {
  margin: 0 auto 12px;
  max-width: 178mm;
}
.actions button {
  background: #111;
  border: 0;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  padding: 8px 16px;
}

.sheet {
  background: #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 15%);
  color: #111;
  font-family: "Sarabun", "Noto Sans Thai", sans-serif;
  /* Thai has no inter-word spaces: never hyphenate or break inside a word. */
  hyphens: none;
  line-height: 1.6;
  margin: 0 auto;
  max-width: 178mm;
  padding: 18mm 16mm;
  word-break: normal;
  overflow-wrap: break-word;
}

/* ── Header: breathing room so the company line never crowds the title ── */
.head {
  border-bottom: 1pt solid #111;
  margin-bottom: 9mm;
  padding-bottom: 4mm;
}
.company {
  font-size: 12pt;
  font-weight: 600;
  letter-spacing: 0.01em;
  margin: 0 0 3mm;
}
.title {
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.35;
  margin: 0 0 2.5mm;
  /* Long Thai title: wrap between words, never mid-word. */
  word-break: keep-all;
}
.disclaimer {
  color: #555;
  font-size: 9pt;
  font-weight: 500;
  margin: 0;
}

/* ── Five short fields: light rules, fixed label column so values align ── */
.fields {
  margin: 0 0 9mm;
}
.row {
  border-bottom: 0.5pt solid #e2e2e2;
  display: flex;
  gap: 6mm;
  padding: 2.6mm 0;
}
.row:last-child {
  border-bottom: 0;
}
dt {
  color: #444;
  flex: 0 0 42mm;
  font-size: 10.5pt;
  /* Labels are short Thai phrases — keep each one on one line. */
  white-space: nowrap;
  word-break: keep-all;
}
dd {
  flex: 1;
  font-size: 10.5pt;
  font-weight: 600;
  margin: 0;
  word-break: normal;
}

/* ── Memo: full-width block, staff line breaks preserved ── */
.memo {
  margin-bottom: 9mm;
}
.memo-head {
  font-size: 10.5pt;
  font-weight: 600;
  margin: 0 0 2mm;
}
.memo-body {
  border: 0.5pt solid #ddd;
  font-size: 10.5pt;
  margin: 0;
  min-height: 20mm;
  padding: 4mm;
  white-space: pre-line;
  word-break: normal;
  overflow-wrap: break-word;
}

/* ── Signatures: stays with the memo's last page, never orphaned ── */
.signatures {
  break-inside: avoid;
  display: flex;
  gap: 12mm;
  margin-top: 4mm;
  page-break-inside: avoid;
}
.sig {
  flex: 1 1 0;
  min-width: 0;
}
/* Fixed zone, content bottom-aligned — this is what puts the two columns'
   rules, names and captions on exactly the same lines. */
.sig-zone {
  align-items: flex-end;
  display: flex;
  height: 24mm;
}
.sig-image {
  display: block;
  height: 22mm;
  max-width: 100%;
  object-fit: contain;
  object-position: left bottom;
}
.sig-missing {
  color: #666;
  font-size: 10pt;
  margin: 0;
}
.sig-role {
  color: #444;
  font-size: 10pt;
  font-weight: 600;
  margin: 0;
}
/* The rule belongs to the NAME in both columns, so it always carries text
   directly above it and never reads as a line waiting for a signature. */
.sig-name {
  border-top: 0.5pt solid #bbb;
  font-size: 10.5pt;
  font-weight: 600;
  margin: 0;
  padding-top: 1.5mm;
}
.sig-caption {
  color: #555;
  font-size: 8.5pt;
  margin: 1mm 0 0;
  word-break: keep-all;
}

@media print {
  .page {
    background: #fff;
    min-height: auto;
    padding: 0;
  }
  .no-print {
    display: none !important;
  }
  .sheet {
    box-shadow: none;
    margin: 0;
    max-width: none;
    padding: 0;
  }
  /* A long memo flows onto a second page; the header is NOT repeated. */
  .head {
    break-after: avoid;
  }
  .memo-body {
    break-inside: auto;
  }
}
</style>
