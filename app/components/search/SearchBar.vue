<script setup lang="ts">
/**
 * Global search input with typeahead suggestions.
 *
 * Submit (Enter or click suggestion) navigates to `/search?q=...` in the
 * current tab via Nuxt router.
 */
import type { LocaleCode } from "~/types/locale";
import type { AutocompleteSuggestion } from "~/composables/useProductSearch";

withDefaults(
  defineProps<{
    autofocus?: boolean;
  }>(),
  {
    autofocus: false,
  },
);

const { t, locale } = useI18n();
const { autocomplete } = useProductSearch();

const lang = computed(() => locale.value as LocaleCode);

const query = ref("");
const suggestions = ref<AutocompleteSuggestion[]>([]);
const loading = ref(false);
const open = ref(false);
const highlighted = ref(-1);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestRequestId = 0;

function scheduleSuggest() {
  if (debounceTimer) clearTimeout(debounceTimer);

  const value = query.value.trim();
  if (value.length === 0) {
    suggestions.value = [];
    open.value = false;
    loading.value = false;
    return;
  }

  debounceTimer = setTimeout(async () => {
    const requestId = ++latestRequestId;
    loading.value = true;
    const results = await autocomplete(value, 8);
    if (requestId !== latestRequestId) return;
    suggestions.value = results;
    highlighted.value = -1;
    open.value = true;
    loading.value = false;
  }, 180);
}

function searchUrl(q: string) {
  const params = new URLSearchParams({ q });
  return `/search?${params.toString()}`;
}

function productUrl(s: AutocompleteSuggestion) {
  const group = s.categoryKeys[0] ?? "all";
  return `/product-${group}/${s.slug}`;
}

function submitQuery() {
  const value = query.value.trim();
  if (value.length === 0) return;
  open.value = false;
  void navigateTo(searchUrl(value));
}

function chooseSuggestion(s: AutocompleteSuggestion) {
  open.value = false;
  void navigateTo(productUrl(s));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    if (suggestions.value.length === 0) return;
    event.preventDefault();
    highlighted.value = (highlighted.value + 1) % suggestions.value.length;
    open.value = true;
  } else if (event.key === "ArrowUp") {
    if (suggestions.value.length === 0) return;
    event.preventDefault();
    highlighted.value =
      highlighted.value <= 0
        ? suggestions.value.length - 1
        : highlighted.value - 1;
    open.value = true;
  } else if (event.key === "Enter") {
    event.preventDefault();
    const chosen = suggestions.value[highlighted.value];
    if (chosen) {
      chooseSuggestion(chosen);
    } else {
      submitQuery();
    }
  } else if (event.key === "Escape") {
    open.value = false;
  }
}

function onBlur() {
  // Delay so click on suggestion fires first
  setTimeout(() => {
    open.value = false;
  }, 120);
}

function onFocus() {
  if (suggestions.value.length > 0) open.value = true;
}
</script>

<template>
  <div class="relative w-full max-w-sm">
    <UInput
      v-model="query"
      :placeholder="t('search.placeholder')"
      :autofocus="autofocus"
      icon="bx:search"
      size="md"
      variant="outline"
      :loading="loading"
      :trailing="false"
      class="w-full"
      @input="scheduleSuggest"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />

    <div
      v-if="open && (suggestions.length > 0 || loading)"
      class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-default bg-default shadow-lg"
    >
      <ul class="max-h-80 overflow-y-auto py-1">
        <li
          v-for="(s, i) in suggestions"
          :key="s.id"
          class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
          :class="{ 'bg-elevated': i === highlighted }"
          @mousedown.prevent="chooseSuggestion(s)"
          @mouseenter="highlighted = i"
        >
          <img
            v-if="s.thumbnailUrl"
            :src="s.thumbnailUrl"
            alt=""
            class="size-8 shrink-0 rounded object-cover"
            loading="lazy"
          />
          <span class="truncate">{{ s.name[lang] || s.name.en }}</span>
          <UBadge
            v-if="s.type === 'rental' || s.type === 'hybrid'"
            :label="t('search.rentalBadge')"
            color="info"
            size="xs"
            variant="subtle"
            class="ml-auto"
          />
        </li>
      </ul>

      <div
        v-if="query.trim()"
        class="cursor-pointer border-t border-default px-3 py-2 text-xs text-muted hover:bg-elevated"
        @mousedown.prevent="submitQuery"
      >
        {{ t("search.seeAllResults", { q: query.trim() }) }} →
      </div>
    </div>
  </div>
</template>
