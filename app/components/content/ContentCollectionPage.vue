<script setup lang="ts">
import type { ContentType } from "~/types/content";

const props = defineProps<{
  contentType: ContentType;
  title: string;
  description: string;
}>();

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

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        title="Failed to load content"
        :description="String(error?.message || 'Unknown error')"
      />

      <div v-else-if="pending" class="space-y-4">
        <CommonLoadingCat />
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <USkeleton v-for="index in 6" :key="index" class="h-72 rounded-lg" />
        </div>
      </div>

      <div
        v-else-if="pages.length"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <ContentPageCard v-for="page in pages" :key="page.id" :page="page" />
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
