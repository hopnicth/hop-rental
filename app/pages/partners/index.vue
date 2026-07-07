<script setup lang="ts">
import { readQueryString, queryObjectsEqual } from "~/utils/filter-query";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";
import type { PublicPartnerDirectoryTypeFilter } from "~/composables/usePublicPartners";

const FILTER_ALL = "__all__";

const DIRECTORY_TYPE_TABS: {
  value: PublicPartnerDirectoryTypeFilter;
  label: string;
}[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "store", label: "ร้านค้า" },
  { value: "service", label: "บริการ" },
  { value: "contractor", label: "ผู้รับเหมา" },
];

type SelectOpt = { value: string; label: string };
const ALL_PARTNER_CATEGORIES: SelectOpt[] = [
  { value: "store_construction_materials", label: "ร้านวัสดุก่อสร้าง" },
  { value: "store_hardware_tools", label: "ร้านฮาร์ดแวร์และเครื่องมือช่าง" },
  { value: "store_electrical_lighting", label: "ร้านอุปกรณ์ไฟฟ้าและแสงสว่าง" },
  { value: "store_plumbing", label: "ร้านอุปกรณ์ประปา" },
  { value: "store_safety_ppe", label: "ร้านเซฟตี้และ PPE" },
  { value: "store_paints_chemicals", label: "ร้านสีและเคมีภัณฑ์" },
  { value: "store_signage_print", label: "ร้านป้ายและสิ่งพิมพ์" },
  { value: "service_transport_logistics", label: "บริษัทขนส่งและรับจ้าง" },
  { value: "service_heavy_machinery_rental", label: "เช่าเครื่องจักรหนัก" },
  { value: "service_waste_disposal", label: "รับทิ้งขยะและเศษวัสดุ" },
  { value: "service_site_facilities", label: "ที่พักและสิ่งอำนวยความสะดวก" },
  { value: "service_design_consulting", label: "ออกแบบและที่ปรึกษา" },
  { value: "service_safety_services", label: "บริการด้านความปลอดภัย" },
  { value: "contractor_general", label: "ผู้รับเหมาหลัก" },
  { value: "contractor_structural_masonry", label: "ช่างโครงสร้างและปูน" },
  { value: "contractor_electrical_network", label: "ช่างไฟฟ้าและสื่อสาร" },
  { value: "contractor_plumbing_sanitary", label: "ช่างประปาและสุขาภิบาล" },
  { value: "contractor_roofing_steel_work", label: "ช่างหลังคาและโครงเหล็ก" },
  { value: "contractor_finishing_work", label: "ช่างตกแต่งและเก็บงาน" },
  { value: "contractor_general_labor", label: "คนงานทั่วไป" },
];

const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();

function readDirectoryTypeQuery(v: unknown): PublicPartnerDirectoryTypeFilter {
  const s = readQueryString(v);
  return (["store", "service", "contractor"] as const).includes(
    s as "store" | "service" | "contractor",
  )
    ? (s as PublicPartnerDirectoryTypeFilter)
    : "";
}

// Initialise from URL before useFetch runs so SSR gets the correct params.
const {
  q,
  directoryType,
  category,
  taxCategory,
  taxSubcategory,
  serviceArea,
  page,
  items,
  total,
  pending,
  error,
  refresh,
} = usePublicPartners({
  q: readQueryString(route.query.q),
  directoryType: readDirectoryTypeQuery(route.query.directoryType),
  category: readQueryString(route.query.category),
  taxCategory: readQueryString(route.query.taxCategory),
  taxSubcategory: readQueryString(route.query.taxSubcategory),
  serviceArea: readQueryString(route.query.area),
});

useSeoMeta({
  title: "ร้านค้าและพาร์ทเนอร์ของเรา — HOPNIC",
  description:
    "ค้นหาร้านค้า บริการ และผู้รับเหมาในเครือข่ายพาร์ทเนอร์ของ HOPNIC",
});

const activeFilterCount = computed(
  () =>
    Number(!!q.value) +
    Number(!!directoryType.value) +
    Number(!!category.value) +
    Number(!!taxCategory.value) +
    Number(!!serviceArea.value),
);

// Category options filtered by active directoryType prefix
const categorySelectOptions = computed<SelectOpt[]>(() => [
  { value: FILTER_ALL, label: "ทุกหมวดหมู่" },
  ...(directoryType.value
    ? ALL_PARTNER_CATEGORIES.filter((c) =>
        c.value.startsWith(`${directoryType.value}_`),
      )
    : ALL_PARTNER_CATEGORIES),
]);

// Service area select — top-level options only (special / region / metro) for manageability
const serviceAreaSelectOptions = computed<SelectOpt[]>(() => [
  { value: FILTER_ALL, label: "ทุกพื้นที่" },
  ...SERVICE_AREA_OPTIONS.filter((opt) =>
    (["special", "region", "metro"] as string[]).includes(opt.group),
  ).map((opt) => ({
    value: opt.value,
    label: locale.value === "en" ? opt.labelEn : opt.labelTh,
  })),
]);

// Computed models with FILTER_ALL sentinel for USelect
const categoryInput = computed({
  get: () => category.value || FILTER_ALL,
  set: (v: string) => {
    category.value = v === FILTER_ALL ? "" : v;
  },
});
const serviceAreaInput = computed({
  get: () => serviceArea.value || FILTER_ALL,
  set: (v: string) => {
    serviceArea.value = v === FILTER_ALL ? "" : v;
  },
});

// Label lookups for active filter chips
const categoryLabelMap = computed(
  () => new Map(ALL_PARTNER_CATEGORIES.map((c) => [c.value, c.label])),
);
const serviceAreaLabelMap = computed(
  () => new Map(SERVICE_AREA_OPTIONS.map((opt) => [opt.value, opt.labelTh])),
);

function onDirectoryTypeChange(value: PublicPartnerDirectoryTypeFilter) {
  directoryType.value = value;
  category.value = ""; // reset category when type changes
  page.value = 0;
}

// Level-0 taxonomy rail select. null = "All" (clear the tax filter).
// The rail is level-0 only this slice, so any category change clears the sub.
function onSelectTaxCategory(slug: string | null) {
  taxCategory.value = slug ?? "";
  taxSubcategory.value = "";
  page.value = 0;
}

function clearFilters() {
  q.value = "";
  directoryType.value = "";
  category.value = "";
  taxCategory.value = "";
  taxSubcategory.value = "";
  serviceArea.value = "";
  page.value = 0;
}

// Filter state → URL (client only)
watch([q, directoryType, category, taxCategory, taxSubcategory, serviceArea], () => {
  if (!import.meta.client) return;
  const next: Record<string, string> = {};
  if (q.value.trim()) next.q = q.value.trim();
  if (directoryType.value) next.directoryType = directoryType.value;
  if (category.value) next.category = category.value;
  if (taxCategory.value) next.taxCategory = taxCategory.value;
  // taxSubcategory only rides along when a taxCategory is set.
  if (taxCategory.value && taxSubcategory.value)
    next.taxSubcategory = taxSubcategory.value;
  if (serviceArea.value) next.area = serviceArea.value;
  if (!queryObjectsEqual(route.query, next))
    void router.replace({ query: next });
});

// URL → filter state (browser navigation / back-forward)
watch(
  () => route.query.q,
  (v) => {
    q.value = readQueryString(v);
  },
);
watch(
  () => route.query.directoryType,
  (v) => {
    directoryType.value = readDirectoryTypeQuery(v);
  },
);
watch(
  () => route.query.category,
  (v) => {
    category.value = readQueryString(v);
  },
);
watch(
  () => route.query.taxCategory,
  (v) => {
    taxCategory.value = readQueryString(v);
  },
);
watch(
  () => route.query.taxSubcategory,
  (v) => {
    taxSubcategory.value = readQueryString(v);
  },
);
watch(
  () => route.query.area,
  (v) => {
    serviceArea.value = readQueryString(v);
  },
);
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <div class="space-y-8">
      <!-- Page heading -->
      <div class="max-w-3xl space-y-2">
        <UBadge color="primary" variant="soft" size="lg"
          >Partner Network</UBadge
        >
        <h1 class="text-3xl font-semibold text-highlighted sm:text-4xl">
          ร้านค้าและพาร์ทเนอร์ของเรา
        </h1>
        <p class="text-base text-muted">Our Partner Network</p>
      </div>

      <!-- Taxonomy category rail (level-0) -->
      <PartnersPartnerCategoryRail
        :active-category="taxCategory || null"
        @select="onSelectTaxCategory"
      />

      <!-- Filter card -->
      <UCard :ui="{ body: 'space-y-4' }">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <h2 class="text-sm font-semibold">ตัวกรอง</h2>
              <UBadge
                v-if="activeFilterCount > 0"
                color="primary"
                variant="soft"
                size="sm"
              >
                {{ activeFilterCount }}
              </UBadge>
            </div>
            <UButton
              v-if="activeFilterCount > 0"
              variant="ghost"
              color="neutral"
              size="xs"
              label="ล้างทั้งหมด"
              @click="clearFilters"
            />
          </div>
        </template>

        <!-- Active filter chips -->
        <div v-if="activeFilterCount > 0" class="flex flex-wrap gap-1.5">
          <UButton
            v-if="q"
            :label="`ค้นหา: ${q}`"
            trailing-icon="i-lucide-x"
            variant="soft"
            color="primary"
            size="xs"
            @click="q = ''"
          />
          <UButton
            v-if="category"
            :label="`หมวดหมู่: ${categoryLabelMap.get(category) ?? category}`"
            trailing-icon="i-lucide-x"
            variant="soft"
            color="primary"
            size="xs"
            @click="category = ''"
          />
          <UButton
            v-if="serviceArea"
            :label="`พื้นที่: ${serviceAreaLabelMap.get(serviceArea) ?? serviceArea}`"
            trailing-icon="i-lucide-x"
            variant="soft"
            color="primary"
            size="xs"
            @click="serviceArea = ''"
          />
        </div>

        <!-- Text search input -->
        <div>
          <p class="mb-1 text-xs font-medium text-muted">ค้นหา</p>
          <UInput
            v-model="q"
            placeholder="ชื่อร้านค้า บริการ หรือประเภทงาน..."
            icon="i-lucide-search"
            class="w-full"
          />
        </div>

        <!-- Directory type tabs -->
        <div>
          <p class="mb-2 text-xs font-medium text-muted">ประเภทพาร์ทเนอร์</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="tab in DIRECTORY_TYPE_TABS"
              :key="tab.value"
              :variant="directoryType === tab.value ? 'solid' : 'soft'"
              size="sm"
              @click="onDirectoryTypeChange(tab.value)"
            >
              {{ tab.label }}
            </UButton>
          </div>
        </div>

        <!-- Category + service area selects -->
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <p class="mb-1 text-xs font-medium text-muted">หมวดหมู่</p>
            <USelect
              v-model="categoryInput"
              :items="categorySelectOptions"
              value-key="value"
              class="w-full"
            />
          </div>
          <div>
            <p class="mb-1 text-xs font-medium text-muted">พื้นที่ให้บริการ</p>
            <USelect
              v-model="serviceAreaInput"
              :items="serviceAreaSelectOptions"
              value-key="value"
              class="w-full"
            />
          </div>
        </div>
      </UCard>

      <!-- Error state -->
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        title="เกิดข้อผิดพลาดในการโหลดข้อมูล"
        :description="
          String((error as { message?: string })?.message ?? 'Unknown error')
        "
      >
        <template #actions>
          <UButton
            size="xs"
            variant="soft"
            color="error"
            label="ลองใหม่"
            @click="refresh()"
          />
        </template>
      </UAlert>

      <!-- Loading state -->
      <div v-else-if="pending" class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <PartnersPartnerCardSkeleton v-for="i in 6" :key="i" />
      </div>

      <!-- Results grid -->
      <div v-else-if="items.length" class="space-y-4">
        <p class="text-sm text-muted">พบ {{ total }} รายการ</p>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <PartnersPartnerCard
            v-for="partner in items"
            :key="partner.id"
            :partner="partner"
          />
        </div>
      </div>

      <!-- Empty state (category-specific copy when a taxonomy filter is active) -->
      <UAlert
        v-else
        color="neutral"
        variant="soft"
        :title="
          taxCategory
            ? t('partners.rail.emptyCategory')
            : 'ยังไม่มีพาร์ทเนอร์ที่ตรงกับการค้นหา'
        "
        description="ลองเปลี่ยนตัวกรอง หรือตรวจสอบใหม่อีกครั้งในภายหลัง"
      />
    </div>
  </UContainer>
</template>
