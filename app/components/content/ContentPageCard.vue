<script setup lang="ts">
import type { ContentPage } from "~/types/content";
import type { LocaleCode } from "~/types/locale";

const props = defineProps<{ page: ContentPage }>();
const { locale } = useI18n();
const { pathForContent } = useContentPages();
const lang = computed(() => locale.value as LocaleCode);
const to = computed(() => pathForContent(props.page.contentType, props.page.slug));
</script>

<template>
  <NuxtLink :to="to" class="block h-full">
    <UCard class="h-full overflow-hidden transition hover:-translate-y-0.5 hover:ring-2 hover:ring-primary">
      <NuxtImg
        v-if="page.coverImageUrl"
        :src="page.coverImageUrl"
        :alt="page.title[lang]"
        class="aspect-video w-full object-cover"
        loading="lazy"
      />
      <div class="space-y-3 pt-4">
        <h3 class="line-clamp-2 text-lg font-semibold text-highlighted">
          {{ page.title[lang] }}
        </h3>
        <p class="line-clamp-3 text-sm leading-6 text-muted">
          {{ page.excerpt[lang] }}
        </p>
        <div class="inline-flex items-center gap-1 text-sm font-medium text-primary">
          Read more <UIcon name="bx:right-arrow-alt" class="size-5" />
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>