<script setup lang="ts">
import type { AssetDetailBlock } from "~/types/asset";
import type { LocaleCode } from "~/types/locale";

/**
 * AssetDetailBlocks — renders essay-style content sections from
 * `assets.detail_blocks`. Each block may contain title, body paragraphs,
 * bullet items, an inline image grid, and a list of attached documents.
 */

defineProps<{ blocks?: AssetDetailBlock[] }>();

const { locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const DOCUMENT_ICON: Record<string, string> = {
  manual: "bx:book-open",
  catalog: "bx:book",
  datasheet: "bx:file",
  guide: "bx:bookmark",
  report: "bx:file-doc",
  other: "bx:link-external",
};

function imageUrl(image: { url: string; variants?: Record<string, string | undefined> }) {
  return image.variants?.large || image.variants?.card || image.url;
}

function thumbUrl(image: {
  url: string;
  variants?: Record<string, string | undefined>;
}) {
  return image.variants?.card || image.variants?.thumbnail || image.url;
}

function formatSize(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes)) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
</script>

<template>
  <div v-if="blocks?.length" class="space-y-8">
    <section
      v-for="block in blocks"
      :key="block.key"
      class="border-t border-default pt-6 first:border-t-0 first:pt-0"
    >
      <h3 v-if="block.title" class="mb-3 text-xl font-semibold">
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
        v-if="block.images?.length"
        class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <figure
          v-for="image in block.images"
          :key="image.id"
          class="overflow-hidden rounded-lg border border-default bg-muted"
        >
          <a
            :href="imageUrl(image)"
            target="_blank"
            rel="noopener noreferrer"
            class="block"
          >
            <img
              :src="thumbUrl(image)"
              :alt="image.altText || image.caption || ''"
              class="aspect-video w-full object-cover"
              loading="lazy"
            />
          </a>
          <figcaption
            v-if="image.caption"
            class="px-3 py-2 text-xs text-muted"
          >
            {{ image.caption }}
          </figcaption>
        </figure>
      </div>

      <div v-if="block.documents?.length" class="mt-4 flex flex-wrap gap-2">
        <UButton
          v-for="doc in block.documents"
          :key="doc.id"
          :to="doc.url"
          target="_blank"
          rel="noopener noreferrer"
          :icon="DOCUMENT_ICON[doc.kind] ?? 'bx:link-external'"
          color="primary"
          variant="outline"
          size="sm"
        >
          {{ doc.title }}
          <span v-if="doc.sizeBytes" class="ml-1 text-xs opacity-70">
            ({{ formatSize(doc.sizeBytes) }})
          </span>
        </UButton>
      </div>
    </section>
  </div>
</template>
