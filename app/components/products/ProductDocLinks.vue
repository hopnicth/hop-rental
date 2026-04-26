<script setup lang="ts">
import type { ProductDocumentLink, ProductMediaLink } from "~/types/product";

/**
 * ProductDocLinks — Displays structured product document + media links.
 */

const props = defineProps<{
  documents?: ProductDocumentLink[];
  mediaLinks?: ProductMediaLink[];
}>();

const hasDocs = computed(
  () =>
    (props.documents?.length ?? 0) > 0 || (props.mediaLinks?.length ?? 0) > 0,
);
</script>

<template>
  <template v-if="hasDocs">
    <UButton
      v-for="item in mediaLinks ?? []"
      :key="item.id"
      icon="bx:play-circle"
      :label="item.title"
      variant="outline"
      color="primary"
      :to="item.url"
      target="_blank"
      block
    />
    <UButton
      v-for="item in documents ?? []"
      :key="item.id"
      icon="bx:file"
      :label="item.title"
      variant="outline"
      color="neutral"
      :to="item.url"
      target="_blank"
      block
    />
  </template>
  <p v-else class="text-gray-400">—</p>
</template>
