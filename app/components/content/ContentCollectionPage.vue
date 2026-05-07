<script setup lang="ts">
import type { ContentType } from "~/types/content";
import type {
  MainCategoryEntityType,
  StorefrontMainCategory,
} from "~/types/category";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";
import { queryObjectsEqual, readQueryString } from "~/utils/filter-query";

const SERVICE_FILTER_ALL_VALUE = "__all__";

const props = defineProps<{
  contentType: ContentType;
  title: string;
  description: string;
}>();

const serviceAreaMap = new Map(
  SERVICE_AREA_OPTIONS.map((option) => [option.value, option] as const),
);
const bangkokMetroAreaValues = [
  "bangkok",
  "nonthaburi",
  "pathum-thani",
  "samut-prakan",
  "samut-sakhon",
  "nakhon-pathom",
];

const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();
const selectedCategory = ref(readCategoryQuery(route.query.category));
const selectedServiceArea = ref(readServiceAreaQuery(route.query.area));
const mainCategoryEntityType = computed<MainCategoryEntityType>(
  () => props.contentType,
);
const { categories } = useMainCategories(mainCategoryEntityType);
const { fetchContentPages } = useContentPages();
const {
  data: pages,
  pending,
  error,
} = await useAsyncData(
  `content-list:${props.contentType}`,
  () => fetchContentPages(props.contentType),
  { default: () => [] },
);

useSeoMeta({
  title: props.title,
  description: props.description,
});

function categoryLabel(item: StorefrontMainCategory): string {
  if (locale.value === "th") return item.labelTh || item.labelEn || item.key;
  return item.labelEn || item.labelTh || item.key;
}

const categoryOptions = computed(() =>
  categories.value.map((item) => ({
    value: item.key,
    label: categoryLabel(item),
  })),
);

const categorySelectItems = computed(() => [
  { value: SERVICE_FILTER_ALL_VALUE, label: "ทุกประเภทบริการ" },
  ...categoryOptions.value,
]);

const serviceAreaSelectItems = computed(() => [
  { value: SERVICE_FILTER_ALL_VALUE, label: "ทุกพื้นที่ให้บริการ" },
  ...SERVICE_AREA_OPTIONS.map((option) => ({
    value: option.value,
    label: locale.value === "th" ? option.labelTh : option.labelEn,
  })),
]);

const selectedCategoryInput = computed({
  get: () => selectedCategory.value || SERVICE_FILTER_ALL_VALUE,
  set: (value: string) => {
    selectedCategory.value = value === SERVICE_FILTER_ALL_VALUE ? "" : value;
  },
});

const selectedServiceAreaInput = computed({
  get: () => selectedServiceArea.value || SERVICE_FILTER_ALL_VALUE,
  set: (value: string) => {
    selectedServiceArea.value = value === SERVICE_FILTER_ALL_VALUE ? "" : value;
  },
});

function readCategoryQuery(value: unknown): string {
  const raw = readQueryString(value);
  return raw === SERVICE_FILTER_ALL_VALUE ? "" : raw;
}

function readServiceAreaQuery(value: unknown): string {
  const raw = readQueryString(value);
  return serviceAreaMap.has(raw) ? raw : "";
}

function pageMatchesServiceArea(pageAreas: string[]) {
  const selected = selectedServiceArea.value;
  if (props.contentType !== "service" || !selected) return true;
  if (pageAreas.includes("nationwide") || pageAreas.includes(selected))
    return true;

  const selectedOption = serviceAreaMap.get(selected);
  if (!selectedOption) return false;

  if (selectedOption.group === "region") {
    const group = selected.replace(/^region-/, "");
    const provinceValues = SERVICE_AREA_OPTIONS.filter(
      (option) => option.group === group,
    ).map((option) => option.value);
    return provinceValues.some((value) => pageAreas.includes(value));
  }

  if (selected === "bangkok-metro") {
    return bangkokMetroAreaValues.some((value) => pageAreas.includes(value));
  }

  if (bangkokMetroAreaValues.includes(selected)) {
    return pageAreas.includes("bangkok-metro");
  }

  return pageAreas.includes(`region-${selectedOption.group}`);
}

const selectedCategoryLabel = computed(() => {
  if (!selectedCategory.value) return t("search.categoryAll");
  return (
    categoryOptions.value.find((item) => item.value === selectedCategory.value)
      ?.label ?? selectedCategory.value
  );
});

const selectedServiceAreaLabel = computed(() => {
  if (!selectedServiceArea.value) return "ทุกพื้นที่ให้บริการ";
  const option = serviceAreaMap.get(selectedServiceArea.value);
  if (!option) return selectedServiceArea.value;
  return locale.value === "th" ? option.labelTh : option.labelEn;
});

const activeServiceFilterCount = computed(
  () =>
    Number(Boolean(selectedCategory.value)) +
    Number(Boolean(selectedServiceArea.value)),
);

function clearServiceFilters() {
  selectedCategory.value = "";
  selectedServiceArea.value = "";
}

const filteredPages = computed(() => {
  return pages.value.filter(
    (page) =>
      (!selectedCategory.value ||
        page.mainCategoryKey === selectedCategory.value) &&
      pageMatchesServiceArea(page.serviceAreas ?? []),
  );
});

watch(
  () => route.query.category,
  (value) => {
    selectedCategory.value = readCategoryQuery(value);
  },
);

watch(
  () => route.query.area,
  (value) => {
    selectedServiceArea.value = readServiceAreaQuery(value);
  },
);

watch([selectedCategory, selectedServiceArea], ([category, area]) => {
  if (!import.meta.client) return;
  const next = { ...route.query };
  category ? (next.category = category) : delete next.category;
  area ? (next.area = area) : delete next.area;
  if (!queryObjectsEqual(route.query, next)) {
    void router.replace({ query: next });
  }
});
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <div class="space-y-8">
      <div class="max-w-3xl space-y-3">
        <UBadge color="primary" variant="soft" size="lg">HOP Content</UBadge>
        <h1 class="text-3xl font-semibold text-highlighted sm:text-4xl">
          {{ title }}
        </h1>
        <p class="text-base leading-7 text-muted">
          {{ description }}
        </p>
      </div>

      <UCard v-if="contentType === 'service'" :ui="{ body: 'space-y-4' }">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <h2 class="text-sm font-semibold">{{ t("search.filters") }}</h2>
              <UBadge v-if="activeServiceFilterCount > 0" color="primary" variant="soft" size="sm">
                {{ activeServiceFilterCount }}
              </UBadge>
            </div>
            <UButton v-if="activeServiceFilterCount > 0" variant="ghost" color="neutral" size="xs" :label="t('search.clearAll')" @click="clearServiceFilters" />
          </div>
        </template>

        <div v-if="activeServiceFilterCount > 0" class="flex flex-wrap gap-1.5">
          <UButton v-if="selectedCategory" :label="'ประเภทบริการ: ' + selectedCategoryLabel" icon="i-lucide-x" variant="soft" color="primary" size="xs" @click="selectedCategory = ''" />
          <UButton v-if="selectedServiceArea" :label="'พื้นที่ให้บริการ: ' + selectedServiceAreaLabel" icon="i-lucide-x" variant="soft" color="primary" size="xs" @click="selectedServiceArea = ''" />
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <p class="mb-1 text-xs font-medium text-muted">ประเภทบริการ</p>
            <USelect v-model="selectedCategoryInput" :items="categorySelectItems" value-key="value" class="w-full" />
          </div>

          <div>
            <p class="mb-1 text-xs font-medium text-muted">พื้นที่ให้บริการ</p>
            <USelect v-model="selectedServiceAreaInput" :items="serviceAreaSelectItems" value-key="value" class="w-full" />
          </div>
        </div>
      </UCard>

      <div v-else-if="categoryOptions.length" class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-medium text-muted">
          <UIcon name="bx:filter-alt" class="size-4" />
          <span>{{ t("search.category") }}: {{ selectedCategoryLabel }}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            :variant="!selectedCategory ? 'solid' : 'soft'"
            size="sm"
            @click="selectedCategory = ''"
          >
            {{ t("search.categoryAll") }}
          </UButton>
          <UButton
            v-for="option in categoryOptions"
            :key="option.value"
            :variant="selectedCategory === option.value ? 'solid' : 'soft'"
            size="sm"
            @click="selectedCategory = option.value"
          >
            {{ option.label }}
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        title="Failed to load content"
        :description="String(error?.message || 'Unknown error')"
      />

      <div v-else-if="pending" class="space-y-4">
        <CommonLoadingCat />
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <USkeleton v-for="index in 6" :key="index" class="h-72 rounded-lg" />
        </div>
      </div>

      <div
        v-else-if="filteredPages.length"
        class="grid grid-cols-2 gap-4 sm:grid-cols-3"
      >
        <ContentPageCard
          v-for="page in filteredPages"
          :key="page.id"
          :page="page"
        />
      </div>

      <UAlert
        v-else
        color="neutral"
        variant="soft"
        title="No content yet"
        description="Please check back later."
      />
    </div>
  </UContainer>
</template>
