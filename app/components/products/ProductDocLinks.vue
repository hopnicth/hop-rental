<script setup lang="ts">
import type { ProductDoc } from "~/types/product";
import type { LocaleCode } from "~/types/locale";

/**
 * ProductDocLinks — Displays document download buttons (manual, catalog, datasheet).
 */

const props = defineProps<{
  doc: ProductDoc;
}>();

const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const hasDocs = computed(
  () => props.doc.manual || props.doc.catalog || props.doc.datasheet,
);
</script>

<template>
  <template v-if="hasDocs">
    <UButton
      v-if="doc.manual"
      icon="bx:file"
      :label="`${t('productDetail.manual')} — ${doc.manual.name[lang]}`"
      variant="outline"
      color="neutral"
      :to="doc.manual.url"
      target="_blank"
      block
    />
    <UButton
      v-if="doc.catalog"
      icon="bx:book-open"
      :label="`${t('productDetail.catalog')} — ${doc.catalog.name[lang]}`"
      variant="outline"
      color="neutral"
      :to="doc.catalog.url"
      target="_blank"
      block
    />
    <UButton
      v-if="doc.datasheet"
      icon="bx:spreadsheet"
      :label="`${t('productDetail.datasheet')} — ${doc.datasheet.name[lang]}`"
      variant="outline"
      color="neutral"
      :to="doc.datasheet.url"
      target="_blank"
      block
    />
  </template>
  <p v-else class="text-gray-400">—</p>
</template>
