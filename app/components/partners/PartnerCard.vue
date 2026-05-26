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

// Cap service area chips at 2 + overflow count for compact display
const visibleServiceAreas = computed(() =>
  props.partner.serviceAreas.slice(0, 2),
);
const remainingAreaCount = computed(() =>
  Math.max(0, props.partner.serviceAreas.length - 2),
);
</script>

<template>
  <UCard
    class="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-primary"
  >
    <!-- Header: type badge row + partner name — min-h-14 mirrors CatalogCardShell -->
    <template #header>
      <div class="flex min-h-14 flex-col justify-start gap-1">
        <div class="flex flex-wrap items-center gap-1">
          <UBadge :color="directoryTypeColor" variant="soft" size="xs">
            {{ directoryTypeLabel }}
          </UBadge>
          <UBadge
            v-if="partner.isVerified"
            color="success"
            variant="soft"
            size="xs"
          >
            ✓ ยืนยัน
          </UBadge>
          <UBadge
            v-if="partner.isFeatured"
            color="warning"
            variant="soft"
            size="xs"
          >
            ★ แนะนำ
          </UBadge>
        </div>
        <h3 class="line-clamp-2 text-sm font-semibold">
          {{ displayName }}
        </h3>
      </div>
    </template>

    <!-- Image — aspect-square always rendered; placeholder when no image -->
    <div class="relative overflow-hidden rounded-lg bg-muted">
      <NuxtImg
        v-if="partner.mainImageUrl"
        :src="partner.mainImageUrl"
        :alt="displayName"
        loading="lazy"
        class="block aspect-square w-full object-cover"
      />
      <div v-else class="flex aspect-square w-full items-center justify-center">
        <UIcon name="bx:store-alt" class="size-10 text-muted opacity-30" />
      </div>
    </div>

    <!-- Content zone with min-height anchors for grid-row alignment -->
    <div class="mt-3 flex min-h-32 flex-col gap-2">
      <!-- Tagline -->
      <div class="min-h-8">
        <p v-if="partner.taglineTh" class="line-clamp-2 text-xs text-muted">
          {{ partner.taglineTh }}
        </p>
      </div>

      <!-- Category chips (main + secondary, no searchKeywords) -->
      <div class="min-h-10">
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
      </div>

      <!-- Service area chips -->
      <div>
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

      <!-- Detail link — pinned to bottom -->
      <div class="mt-auto pt-3">
        <UButton
          :to="`/partners/${partner.slug}`"
          color="neutral"
          variant="outline"
          size="xs"
          icon="bx:right-arrow-alt"
          trailing
          block
        >
          ดูรายละเอียด
        </UButton>
      </div>
    </div>
  </UCard>
</template>
