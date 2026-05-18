<script setup lang="ts">
import hopnicLogoUrl from "~/assets/hopnic-logo.svg";

const HOPNIC_TAX_ID = "0105564155415";

const props = defineProps<{
  header?: Record<string, unknown> | null;
  title: string;
  documentNumber?: unknown;
  issuedAtText?: string;
  bookingReference?: unknown;
  showBookingReference?: boolean;
}>();

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function browserRenderableLogo(value: unknown): string | null {
  const src = clean(value);
  if (!src) return null;
  return /^(https?:\/\/|data:image\/|blob:|\/)/.test(src) ? src : null;
}

const headerData = computed(() => props.header ?? {});
const logoSrc = computed(
  () => browserRenderableLogo(headerData.value.logoPath) ?? hopnicLogoUrl,
);
const companyNameTh = computed(() => clean(headerData.value.companyNameTh));
const companyNameEn = computed(
  () => clean(headerData.value.companyNameEn) || "HOPNIC Co., Ltd.",
);
const taxId = computed(() => clean(headerData.value.taxId) || HOPNIC_TAX_ID);
const branchText = computed(() => {
  const code = clean(headerData.value.branchTaxCode) || "00000";
  return code === "00000" ? `${code} (สำนักงานใหญ่)` : code;
});
const addressTh = computed(
  () =>
    clean(headerData.value.addressTh) ||
    "888/8 ม.1 ต.พนมสารคาม อ.พนมสารคาม จ.ฉะเชิงเทรา 24120",
);
const contactLine = computed(() => {
  const phone = clean(headerData.value.phone) || "095-479-2333";
  const email = clean(headerData.value.email) || "info@hopnic.co.th";
  return [`โทร ${phone}`, email].filter(Boolean).join(" · ");
});
const footerNote = computed(() => clean(headerData.value.footerNote));
const documentNumberText = computed(() => clean(props.documentNumber) || "—");
const bookingReferenceText = computed(() => clean(props.bookingReference) || "—");
</script>

<template>
  <header class="official-document-header">
    <div class="company-block">
      <img :src="logoSrc" alt="HOPNIC" class="company-logo" />
      <div>
        <p class="brand-name">HOPNIC</p>
        <p v-if="companyNameTh && companyNameTh !== 'HOPNIC'" class="muted">
          {{ companyNameTh }}
        </p>
        <p class="muted">{{ companyNameEn }}</p>
        <p class="muted">เลขประจำตัวผู้เสียภาษี {{ taxId }}</p>
        <p class="muted">รหัสสาขา {{ branchText }}</p>
        <p class="muted">{{ addressTh }}</p>
        <p class="muted">{{ contactLine }}</p>
        <p v-if="footerNote" class="muted">{{ footerNote }}</p>
      </div>
    </div>
    <div class="document-block">
      <h1>{{ title }}</h1>
      <p>เลขที่เอกสาร: {{ documentNumberText }}</p>
      <p>วันที่ออกเอกสาร: {{ issuedAtText || "—" }}</p>
      <p v-if="showBookingReference">
        เลขที่การจอง: {{ bookingReferenceText }}
      </p>
    </div>
  </header>
</template>

<style scoped>
.official-document-header {
  border-bottom: 1px solid #111827;
  display: flex;
  gap: 24px;
  justify-content: space-between;
  padding-bottom: 12px;
}
.company-block {
  align-items: center;
  display: flex;
  gap: 12px;
}
.company-logo {
  height: 18mm;
  object-fit: contain;
  width: 18mm;
}
.brand-name {
  font-size: 18pt;
  font-weight: 700;
  margin: 0;
}
.document-block {
  max-width: 42%;
  text-align: right;
}
.document-block h1 {
  font-size: 18pt;
  margin: 0 0 8px;
}
.document-block p,
.muted {
  color: #4b5563;
  font-size: 10pt;
  margin: 2px 0;
}
@media print {
  .official-document-header {
    break-inside: avoid;
  }
}
</style>