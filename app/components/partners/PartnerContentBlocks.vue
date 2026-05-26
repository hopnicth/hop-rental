<script setup lang="ts">
import type { PartnerContentBlock } from "~/types/partner";

const props = defineProps<{
  blocks: PartnerContentBlock[];
}>();

// API already filters to isVisible=true, but guard defensively client-side.
const visibleBlocks = computed(() =>
  props.blocks.filter((b) => b.isVisible),
);
</script>

<template>
  <div v-if="visibleBlocks.length" class="space-y-4">
    <div v-for="block in visibleBlocks" :key="block.id">
      <!-- ── Text block ──────────────────────────────────────────────── -->
      <UCard v-if="block.type === 'text'">
        <template v-if="block.title" #header>
          <h2 class="text-base font-semibold">{{ block.title }}</h2>
        </template>
        <p class="whitespace-pre-line text-sm leading-relaxed text-muted">
          {{ block.body }}
        </p>
      </UCard>

      <!-- ── Google Drive Doc block ─────────────────────────────────── -->
      <UCard v-else-if="block.type === 'drive_doc'">
        <div class="flex items-center gap-3">
          <UIcon
            name="bx:file-blank"
            class="size-8 shrink-0 text-primary"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ block.title }}</p>
            <p class="text-xs text-muted">Google Drive</p>
          </div>
          <UButton
            :to="block.url"
            external
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            variant="soft"
            color="neutral"
            icon="bx:link-external"
            trailing
          >
            เปิดไฟล์
          </UButton>
        </div>
      </UCard>

      <!-- ── YouTube block ──────────────────────────────────────────── -->
      <UCard v-else-if="block.type === 'youtube'">
        <template v-if="block.title" #header>
          <h2 class="text-base font-semibold">{{ block.title }}</h2>
        </template>
        <!-- aspect-video = 16:9; overflow-hidden clips the iframe corners -->
        <div class="aspect-video overflow-hidden rounded-lg">
          <iframe
            class="h-full w-full"
            :src="`https://www.youtube-nocookie.com/embed/${block.videoId}`"
            loading="lazy"
            allowfullscreen
            frameborder="0"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          />
        </div>
      </UCard>

      <!-- Unknown block type: render nothing (safety guard) -->
    </div>
  </div>
</template>
