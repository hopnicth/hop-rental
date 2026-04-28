<script setup lang="ts">
import {
  SERVICE_AREA_OPTIONS,
  type ServiceAreaOption,
} from "~/data/thaiServiceAreas";
import type { ContentType } from "~/types/content";
import type { LocaleCode } from "~/types/locale";

const props = defineProps<{
  contentType: ContentType;
  backTo: string;
  backLabel: string;
  badge: string;
}>();

const route = useRoute();
const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);
const slug = computed(() => String(route.params.slug ?? ""));
const { fetchContentPage } = useContentPages();

const { data: page } = await useAsyncData(
  `content-detail:${props.contentType}:${slug.value}`,
  () => fetchContentPage(props.contentType, slug.value),
);

if (!page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Content page not found",
  });
}

useSeoMeta({
  title: computed(() => page.value?.title[lang.value] ?? props.badge),
  description: computed(() => page.value?.excerpt[lang.value] ?? props.badge),
});

const serviceAreaMap: Record<string, ServiceAreaOption> = Object.fromEntries(
  SERVICE_AREA_OPTIONS.map((option) => [option.value, option]),
);

function serviceAreaLabel(slugValue: string) {
  const option = serviceAreaMap[slugValue];
  if (!option) return slugValue;
  return lang.value === "th" ? option.labelTh : option.labelEn;
}

const serviceAreas = computed(() => {
  if (props.contentType !== "service") return [];
  return page.value?.serviceAreas ?? [];
});
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <article v-if="page" class="mx-auto max-w-4xl space-y-8">
      <UButton
        :to="backTo"
        variant="ghost"
        color="neutral"
        icon="bx:left-arrow-alt"
      >
        {{ backLabel }}
      </UButton>

      <header class="space-y-5">
        <UBadge color="primary" variant="soft" size="lg">{{ badge }}</UBadge>
        <div class="space-y-3">
          <h1 class="text-3xl font-semibold text-highlighted sm:text-5xl">
            {{ page.title[lang] }}
          </h1>
          <p class="text-lg leading-8 text-muted">
            {{ page.excerpt[lang] }}
          </p>
        </div>
        <NuxtImg
          v-if="page.coverImageUrl"
          :src="page.coverImageUrl"
          :alt="page.title[lang]"
          class="aspect-video w-full rounded-xl object-cover"
        />
      </header>

      <section
        v-if="serviceAreas.length > 0"
        class="rounded-xl border border-default bg-elevated/40 p-5"
      >
        <h2 class="mb-3 text-base font-semibold text-highlighted">
          {{ t("home.serviceAreasTitle") }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="area in serviceAreas"
            :key="area"
            color="primary"
            variant="soft"
            size="md"
          >
            {{ serviceAreaLabel(area) }}
          </UBadge>
        </div>
      </section>

      <ContentRenderer :body="page.body" />
    </article>
  </UContainer>
</template>
