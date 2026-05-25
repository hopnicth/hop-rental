<script setup lang="ts">
import type { PartnerCard } from "~/types/partner";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";

const props = defineProps<{ partner: PartnerCard }>();
const { locale } = useI18n();

/**
 * Category label lookup — mirrors the locked admin ALL_CATEGORIES constant.
 * searchKeywords is intentionally absent: it is server-side filter-only metadata
 * and is never present in the PartnerCard type or any public API response.
 */
const CATEGORY_LABELS: Record<string, string> = {
  store_construction_materials: "ร้านวัสดุก่อสร้าง",
  store_hardware_tools: "ร้านฮาร์ดแวร์และเครื่องมือช่าง",
  store_electrical_lighting: "ร้านอุปกรณ์ไฟฟ้าและแสงสว่าง",
  store_plumbing: "ร้านอุปกรณ์ประปา",
  store_safety_ppe: "ร้านเซฟตี้และ PPE",
  store_paints_chemicals: "ร้านสีและเคมีภัณฑ์",
  store_signage_print: "ร้านป้ายและสิ่งพิมพ์",
  service_transport_logistics: "บริษัทขนส่งและรับจ้าง",
  service_heavy_machinery_rental: "เช่าเครื่องจักรหนัก",
  service_waste_disposal: "รับทิ้งขยะและเศษวัสดุ",
  service_site_facilities: "ที่พักและสิ่งอำนวยความสะดวก",
  service_design_consulting: "ออกแบบและที่ปรึกษา",
  service_safety_services: "บริการด้านความปลอดภัย",
  contractor_general: "ผู้รับเหมาหลัก",
  contractor_structural_masonry: "ช่างโครงสร้างและปูน",
  contractor_electrical_network: "ช่างไฟฟ้าและสื่อสาร",
  contractor_plumbing_sanitary: "ช่างประปาและสุขาภิบาล",
  contractor_roofing_steel_work: "ช่างหลังคาและโครงเหล็ก",
  contractor_finishing_work: "ช่างตกแต่งและเก็บงาน",
  contractor_general_labor: "คนงานทั่วไป",
};

const serviceAreaMap = new Map(
  SERVICE_AREA_OPTIONS.map((opt) => [opt.value, opt]),
);

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

function serviceAreaLabel(value: string): string {
  const opt = serviceAreaMap.get(value);
  if (!opt) return value;
  return locale.value === "en" ? opt.labelEn : opt.labelTh;
}

const displayName = computed(() =>
  locale.value === "en" && props.partner.nameEn
    ? props.partner.nameEn
    : props.partner.nameTh,
);

const directoryTypeLabel = computed(() => {
  const map: Record<string, string> = {
    store: "ร้านค้า",
    service: "บริการ",
    contractor: "ผู้รับเหมา",
  };
  return map[props.partner.directoryType] ?? props.partner.directoryType;
});

type BadgeColor = "primary" | "info" | "warning";
const directoryTypeColor = computed<BadgeColor>(() => {
  if (props.partner.directoryType === "store") return "primary";
  if (props.partner.directoryType === "service") return "info";
  return "warning";
});

// Main + secondary category keys in display order — no searchKeywords
const allCategoryKeys = computed(() => [
  ...(props.partner.mainCategoryKey ? [props.partner.mainCategoryKey] : []),
  ...props.partner.secondaryCategoryKeys,
]);

// Cap service area chips at 3 to keep the card compact
const visibleServiceAreas = computed(() => props.partner.serviceAreas.slice(0, 3));
const remainingAreaCount = computed(() =>
  Math.max(0, props.partner.serviceAreas.length - 3),
);
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-lg border border-default bg-default p-4 transition hover:shadow-sm"
  >
    <!-- Cover image (optional) -->
    <div
      v-if="partner.mainImageUrl"
      class="aspect-video overflow-hidden rounded-md bg-muted"
    >
      <img
        :src="partner.mainImageUrl"
        :alt="displayName"
        class="h-full w-full object-cover"
        loading="lazy"
      />
    </div>

    <!-- Type + status badges -->
    <div class="flex flex-wrap items-center gap-1.5">
      <UBadge :color="directoryTypeColor" variant="soft" size="xs">
        {{ directoryTypeLabel }}
      </UBadge>
      <UBadge v-if="partner.isVerified" color="success" variant="soft" size="xs">
        ✓ ยืนยันแล้ว
      </UBadge>
      <UBadge v-if="partner.isFeatured" color="warning" variant="soft" size="xs">
        ★ แนะนำ
      </UBadge>
    </div>

    <!-- Name + tagline -->
    <div class="space-y-0.5">
      <h3 class="text-sm font-semibold leading-snug text-highlighted">
        {{ displayName }}
      </h3>
      <p v-if="partner.taglineTh" class="line-clamp-2 text-xs text-muted">
        {{ partner.taglineTh }}
      </p>
    </div>

    <!-- Category chips (main + secondary, no searchKeywords) -->
    <div v-if="allCategoryKeys.length" class="flex flex-wrap gap-1">
      <UBadge
        v-for="key in allCategoryKeys"
        :key="key"
        color="neutral"
        variant="outline"
        size="xs"
      >
        {{ categoryLabel(key) }}
      </UBadge>
    </div>

    <!-- Service area chips (capped at 3) -->
    <div v-if="visibleServiceAreas.length" class="flex flex-wrap gap-1">
      <UBadge
        v-for="area in visibleServiceAreas"
        :key="area"
        color="neutral"
        variant="soft"
        size="xs"
      >
        {{ serviceAreaLabel(area) }}
      </UBadge>
      <UBadge
        v-if="remainingAreaCount > 0"
        color="neutral"
        variant="soft"
        size="xs"
      >
        +{{ remainingAreaCount }}
      </UBadge>
    </div>
  </div>
</template>
