<script setup lang="ts">
import type { PartnerDetail } from "~/types/partner";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";

const route = useRoute();
const { t, locale } = useI18n();
const slug = computed(() => String(route.params.slug ?? ""));

const { data, pending, error } = await useAsyncData(
  `partner-detail:${slug.value}`,
  () => $fetch<{ item: PartnerDetail }>(`/api/partners/${slug.value}`),
);

const partner = computed(() => data.value?.item ?? null);

useSeoMeta({
  title: computed(() =>
    partner.value
      ? `${partner.value.nameTh} — HOPNIC`
      : t("partners.detail.notFound"),
  ),
  description: computed(() => partner.value?.taglineTh ?? ""),
});

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

const serviceAreaMap = new Map(SERVICE_AREA_OPTIONS.map((o) => [o.value, o]));

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}
function serviceAreaLabel(value: string): string {
  const opt = serviceAreaMap.get(value);
  if (!opt) return value;
  return locale.value === "en" ? opt.labelEn : opt.labelTh;
}

const displayName = computed(() =>
  locale.value === "en" && partner.value?.nameEn
    ? partner.value.nameEn
    : (partner.value?.nameTh ?? ""),
);

const directoryTypeLabel = computed(() => {
  const map: Record<string, string> = {
    store: "ร้านค้า",
    service: "บริการ",
    contractor: "ผู้รับเหมา",
  };
  return partner.value
    ? (map[partner.value.directoryType] ?? partner.value.directoryType)
    : "";
});

type BadgeColor = "primary" | "info" | "warning";
const directoryTypeColor = computed<BadgeColor>(() => {
  if (partner.value?.directoryType === "store") return "primary";
  if (partner.value?.directoryType === "service") return "info";
  return "warning";
});

const allCategoryKeys = computed(() => [
  ...(partner.value?.mainCategoryKey ? [partner.value.mainCategoryKey] : []),
  ...(partner.value?.secondaryCategoryKeys ?? []),
]);

const hasContact = computed(() =>
  Boolean(
    partner.value?.contactPhone ||
    partner.value?.contactEmail ||
    partner.value?.lineUrl ||
    partner.value?.lineId ||
    partner.value?.mapsUrl,
  ),
);

const lineHref = computed(() => {
  const p = partner.value;
  if (!p) return "";
  if (p.lineUrl) return p.lineUrl;
  if (p.lineId) {
    const id = p.lineId.trim();
    if (id.startsWith("@")) return `https://line.me/R/ti/p/${id}`;
    return `https://line.me/ti/p/~${encodeURIComponent(id)}`;
  }
  return "";
});

const lineDisplay = computed(
  () => partner.value?.lineId || lineHref.value || "",
);

// Priority fallback: cover → thumbnail → main → placeholder
const heroImageUrl = computed(
  () =>
    partner.value?.coverImageUrl ||
    partner.value?.thumbnailImageUrl ||
    partner.value?.mainImageUrl ||
    null,
);
</script>

<template>
  <UContainer class="py-6 sm:py-10">
    <UButton
      to="/partners"
      variant="ghost"
      color="neutral"
      icon="bx:left-arrow-alt"
      class="mb-6"
    >
      {{ t("partners.detail.backToList") }}
    </UButton>
    <!-- Loading skeleton -->
    <div v-if="pending" class="space-y-6">
      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-12 lg:col-span-5">
          <USkeleton class="aspect-square w-full rounded-xl" />
        </div>
        <div class="col-span-12 space-y-4 lg:col-span-7">
          <USkeleton class="h-6 w-32 rounded" />
          <USkeleton class="h-10 w-3/4 rounded" />
          <USkeleton class="h-5 w-1/2 rounded" />
          <USkeleton class="h-24 w-full rounded" />
        </div>
      </div>
    </div>

    <!-- Not found / error -->
    <div v-else-if="error || !partner" class="py-20 text-center">
      <UIcon name="bx:error-circle" class="mb-4 size-16 text-muted" />
      <p class="text-lg font-semibold text-highlighted">
        {{ t("partners.detail.notFound") }}
      </p>
      <p class="mt-2 text-sm text-muted">
        {{ t("partners.detail.notFoundDescription") }}
      </p>
      <UButton
        class="mt-6"
        color="neutral"
        variant="outline"
        icon="bx:left-arrow-alt"
        :label="t('partners.detail.backToList')"
        to="/partners"
      />
    </div>

    <!-- Detail content -->
    <template v-else>
      <!-- Hero: image + header info -->
      <div class="grid grid-cols-12 gap-6 lg:gap-8">
        <!-- Image -->
        <div class="col-span-12 lg:col-span-5">
          <div class="relative overflow-hidden rounded-xl bg-muted">
            <NuxtImg
              v-if="heroImageUrl"
              :src="heroImageUrl"
              :alt="displayName"
              class="aspect-video w-full object-cover lg:aspect-square"
              loading="eager"
            />
            <div
              v-else
              class="flex aspect-video w-full items-center justify-center lg:aspect-square"
            >
              <UIcon
                name="bx:store-alt"
                class="size-16 text-muted opacity-30"
              />
            </div>
          </div>
        </div>

        <!-- Header info -->
        <div class="col-span-12 space-y-4 lg:col-span-7">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="directoryTypeColor" variant="soft" size="sm">
              {{ directoryTypeLabel }}
            </UBadge>
            <UBadge
              v-if="partner.isVerified"
              color="success"
              variant="soft"
              size="sm"
            >
              ✓ ยืนยัน
            </UBadge>
            <UBadge
              v-if="partner.isFeatured"
              color="warning"
              variant="soft"
              size="sm"
            >
              ★ แนะนำ
            </UBadge>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-highlighted sm:text-3xl">
              {{ displayName }}
            </h1>
            <p v-if="partner.taglineTh" class="mt-2 text-base text-muted">
              {{ partner.taglineTh }}
            </p>
          </div>
          <p
            v-if="partner.descriptionTh"
            class="whitespace-pre-line text-sm text-muted"
          >
            {{ partner.descriptionTh }}
          </p>
        </div>
      </div>

      <!-- Content blocks (visible only; ordered as saved in admin) -->
      <PartnersPartnerContentBlocks
        v-if="partner.contentBlocks.length"
        :blocks="partner.contentBlocks"
        class="mt-8"
      />

      <!-- Info cards grid -->
      <div class="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- Categories -->
        <UCard v-if="allCategoryKeys.length">
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t("partners.detail.categories") }}
            </h2>
          </template>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="key in allCategoryKeys"
              :key="key"
              color="neutral"
              variant="outline"
              size="sm"
            >
              {{ categoryLabel(key) }}
            </UBadge>
          </div>
        </UCard>

        <!-- Service areas -->
        <UCard v-if="partner.serviceAreas.length">
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t("partners.detail.serviceAreas") }}
            </h2>
          </template>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="area in partner.serviceAreas"
              :key="area"
              color="primary"
              variant="soft"
              size="sm"
            >
              {{ serviceAreaLabel(area) }}
            </UBadge>
          </div>
        </UCard>

        <!-- Business hours -->
        <UCard v-if="partner.businessHoursText">
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t("partners.detail.businessHours") }}
            </h2>
          </template>
          <p class="whitespace-pre-line text-sm text-muted">
            {{ partner.businessHoursText }}
          </p>
        </UCard>

        <!-- Contact -->
        <UCard v-if="hasContact">
          <template #header>
            <h2 class="text-base font-semibold">
              {{ t("partners.detail.contact") }}
            </h2>
          </template>
          <div class="space-y-3 text-sm">
            <div v-if="partner.contactPhone" class="flex items-center gap-2">
              <UIcon name="bx:phone" class="size-4 shrink-0 text-muted" />
              <a
                :href="`tel:${partner.contactPhone.replace(/[^\d+]/g, '')}`"
                class="text-primary hover:underline"
              >
                {{ partner.contactPhone }}
              </a>
            </div>
            <div v-if="partner.contactEmail" class="flex items-center gap-2">
              <UIcon name="bx:envelope" class="size-4 shrink-0 text-muted" />
              <a
                :href="`mailto:${partner.contactEmail}`"
                class="text-primary hover:underline"
              >
                {{ partner.contactEmail }}
              </a>
            </div>
            <div v-if="lineHref" class="flex items-center gap-2">
              <UIcon name="ri:line-fill" class="size-4 shrink-0 text-success" />
              <a
                :href="lineHref"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary hover:underline"
              >
                {{ t("partners.detail.contactLine") }}
                <span v-if="lineDisplay" class="text-muted">
                  — {{ lineDisplay }}</span
                >
              </a>
            </div>
            <div v-if="partner.mapsUrl" class="flex items-center gap-2">
              <UIcon name="bx:map" class="size-4 shrink-0 text-muted" />
              <a
                :href="partner.mapsUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary hover:underline"
              >
                {{ t("partners.detail.openInMaps") }}
              </a>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UContainer>

  <!-- Quick-contact FAB stack — fixed bottom-right.
       Chat FAB is fixed bottom-LEFT (bottom-4 left-4) so no overlap.
       Each button renders only if the corresponding field is non-null. -->
  <div
    v-if="!pending && !error && partner && hasContact"
    class="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-3 sm:right-6"
  >
    <UButton
      v-if="partner.contactPhone"
      :to="`tel:${partner.contactPhone.replace(/[^\d+]/g, '')}`"
      color="primary"
      variant="solid"
      icon="bx:phone"
      size="xl"
      class="rounded-full shadow-lg"
      :aria-label="partner.contactPhone"
      :title="partner.contactPhone"
    />
    <UButton
      v-if="partner.contactEmail"
      :to="`mailto:${partner.contactEmail}`"
      color="neutral"
      variant="solid"
      icon="bx:envelope"
      size="xl"
      class="rounded-full shadow-lg"
      :aria-label="partner.contactEmail"
      :title="partner.contactEmail"
    />
    <UButton
      v-if="lineHref"
      :to="lineHref"
      target="_blank"
      rel="noopener noreferrer"
      external
      color="success"
      variant="solid"
      icon="ri:line-fill"
      size="xl"
      class="rounded-full shadow-lg"
      :aria-label="t('partners.detail.contactLine')"
      :title="t('partners.detail.contactLine')"
    />
    <UButton
      v-if="partner.mapsUrl"
      :to="partner.mapsUrl"
      target="_blank"
      rel="noopener noreferrer"
      external
      color="warning"
      variant="solid"
      icon="bx:map-pin"
      size="xl"
      class="rounded-full shadow-lg"
      :aria-label="t('partners.detail.openInMaps')"
      :title="t('partners.detail.openInMaps')"
    />
  </div>
</template>
