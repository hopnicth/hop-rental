<script setup lang="ts">
import type { ProductDetailBlocks } from "~/types/product";
import type { LocaleCode } from "~/types/locale";

/**
 * ProductDetailBlocks — renders top-level keys of `products.detail_blocks`
 * as stacked sub-sections. Each block may have a title, body, bullet items,
 * and link buttons.
 */

const props = defineProps<{
  blocks?: ProductDetailBlocks;
}>();

const { locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const sections = computed(() => {
  const source = props.blocks;
  if (!source) return [];
  return Object.entries(source).map(([key, block]) => ({ key, block }));
});
</script>

<template>
  <div v-if="sections.length" class="space-y-6">
    <section
      v-for="{ key, block } in sections"
      :key="key"
      class="border-t border-default pt-6 first:border-t-0 first:pt-0"
    >
      <h3 v-if="block.title" class="mb-3 text-lg font-semibold">
        {{ block.title[lang] }}
      </h3>

      <p
        v-if="block.body"
        class="whitespace-pre-line text-sm leading-relaxed text-default"
      >
        {{ block.body[lang] }}
      </p>

      <ul
        v-if="block.items?.length"
        class="mt-3 list-disc space-y-1 pl-5 text-sm text-default"
      >
        <li v-for="(item, idx) in block.items" :key="idx">{{ item }}</li>
      </ul>

      <div
        v-if="block.buttons?.length"
        class="mt-4 flex flex-wrap gap-2"
      >
        <UButton
          v-for="btn in block.buttons"
          :key="btn.id ?? btn.url"
          :to="btn.url"
          target="_blank"
          rel="noopener noreferrer"
          :icon="btn.icon ?? 'bx:link-external'"
          color="primary"
          variant="outline"
        >
          {{ btn.label[lang] }}
        </UButton>
      </div>
    </section>
  </div>
</template>
