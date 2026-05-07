<script setup lang="ts">
/**
 * Global search input with typeahead suggestions.
 *
 * Submit (Enter or click suggestion) navigates to `/search?q=...` in the
 * current tab via Nuxt router.
 */
import type { LocaleCode } from "~/types/locale";
import type {
  GlobalSearchResultScope,
  GlobalSearchScope,
  GlobalSearchSuggestion,
} from "~/composables/useGlobalSearch";

const props = withDefaults(
  defineProps<{
    autofocus?: boolean;
    fullWidth?: boolean;
    modelValue?: string;
    navigateOnSubmit?: boolean;
    scope?: GlobalSearchScope;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
  }>(),
  {
    autofocus: false,
    fullWidth: false,
    modelValue: "",
    navigateOnSubmit: true,
    scope: "all",
    size: "md",
  },
);

const emit = defineEmits<{
  submit: [value: string];
  "update:modelValue": [value: string];
  "update:scope": [value: GlobalSearchScope];
}>();

const { t, locale } = useI18n();
const { searchGlobalSuggestions } = useGlobalSearch();

const lang = computed(() => locale.value as LocaleCode);

const scopes: GlobalSearchScope[] = [
  "all",
  "product",
  "rental",
  "service",
  "review",
  "blog",
  "promotion",
];

const query = ref(props.modelValue);
const suggestions = ref<GlobalSearchSuggestion[]>([]);
const activeScope = ref<GlobalSearchScope>(props.scope);
const loading = ref(false);
const open = ref(false);
const highlighted = ref(-1);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestRequestId = 0;

watch(
  () => props.modelValue,
  (value) => {
    if (value !== query.value) query.value = value;
  },
);

watch(query, (value) => emit("update:modelValue", value));

watch(
  () => props.scope,
  (scope) => {
    if (scope !== activeScope.value) activeScope.value = scope;
  },
);

watch(activeScope, (scope) => emit("update:scope", scope));

function isResultScope(
  scope: GlobalSearchScope,
): scope is GlobalSearchResultScope {
  return scope !== "all";
}

const visibleSuggestions = computed(() => {
  const scope = activeScope.value;
  const filtered =
    scope === "all"
      ? suggestions.value
      : suggestions.value.filter(
          (suggestion) =>
            isResultScope(scope) && suggestion.scopes.includes(scope),
        );

  return filtered.slice(0, scope === "all" ? 10 : 6);
});

function scopeCount(scope: GlobalSearchScope) {
  if (scope === "all") return suggestions.value.length;
  return suggestions.value.filter((suggestion) =>
    suggestion.scopes.includes(scope),
  ).length;
}

function scopeLabelKey(scope: GlobalSearchScope) {
  return `search.scope.${scope}`;
}

function scopeIcon(scope: GlobalSearchResultScope) {
  const icons: Record<GlobalSearchResultScope, string> = {
    product: "bx:package",
    rental: "bx:calendar-check",
    service: "bx:briefcase-alt-2",
    review: "bx:star",
    blog: "bx:news",
    promotion: "bx:purchase-tag",
  };
  return icons[scope];
}

function scopeColor(scope: GlobalSearchResultScope) {
  const colors = {
    product: "primary",
    rental: "info",
    service: "success",
    review: "warning",
    blog: "neutral",
    promotion: "error",
  } as const satisfies Record<GlobalSearchResultScope, string>;
  return colors[scope];
}

function suggestionScope(suggestion: GlobalSearchSuggestion) {
  if (
    activeScope.value !== "all" &&
    isResultScope(activeScope.value) &&
    suggestion.scopes.includes(activeScope.value)
  ) {
    return activeScope.value;
  }
  return suggestion.scope;
}

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
    const results = await searchGlobalSuggestions(value);
    if (requestId !== latestRequestId) return;
    suggestions.value = results;
    highlighted.value = -1;
    open.value = true;
    loading.value = false;
  }, 180);
}

function searchUrl(q: string) {
  const params = new URLSearchParams({ q });
  if (activeScope.value !== "all") params.set("scope", activeScope.value);
  return `/search?${params.toString()}`;
}

function submitQuery() {
  const value = query.value.trim();
  if (value.length === 0) return;
  open.value = false;
  emit("submit", value);
  if (props.navigateOnSubmit) void navigateTo(searchUrl(value));
}

function suggestionUrl(suggestion: GlobalSearchSuggestion) {
  if (activeScope.value === "rental" && suggestion.rentalUrl) {
    return suggestion.rentalUrl;
  }
  return suggestion.url;
}

function chooseSuggestion(s: GlobalSearchSuggestion) {
  open.value = false;
  void navigateTo(suggestionUrl(s));
}

function setScope(scope: GlobalSearchScope) {
  activeScope.value = scope;
  highlighted.value = -1;
  open.value = true;
}

function onKeydown(event: KeyboardEvent) {
  const items = visibleSuggestions.value;
  if (event.key === "ArrowDown") {
    if (items.length === 0) return;
    event.preventDefault();
    highlighted.value = (highlighted.value + 1) % items.length;
    open.value = true;
  } else if (event.key === "ArrowUp") {
    if (items.length === 0) return;
    event.preventDefault();
    highlighted.value =
      highlighted.value <= 0 ? items.length - 1 : highlighted.value - 1;
    open.value = true;
  } else if (event.key === "Enter") {
    event.preventDefault();
    const chosen = items[highlighted.value];
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
  if (query.value.trim().length > 0) {
    open.value = true;
    if (suggestions.value.length === 0) scheduleSuggest();
  }
}
</script>

<template>
  <div
    class="relative w-full"
    :class="props.fullWidth ? 'max-w-none' : 'max-w-sm'"
  >
    <UInput
      v-model="query"
      :placeholder="t('search.placeholder')"
      :autofocus="props.autofocus"
      icon="bx:search"
      :size="props.size"
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
      v-if="open && query.trim()"
      class="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-default bg-default shadow-lg"
      :class="
        props.fullWidth
          ? 'right-0 w-full'
          : 'w-[min(92vw,34rem)] max-w-[calc(100vw-2rem)]'
      "
    >
      <div class="border-b border-default px-3 py-2">
        <p class="mb-1 text-[11px] font-medium text-muted">
          {{ t("search.searchIn") }}
        </p>
        <div class="flex gap-1 overflow-x-auto pb-0.5">
          <button
            v-for="scope in scopes"
            :key="scope"
            type="button"
            class="shrink-0 rounded-full px-2.5 py-1 text-xs transition"
            :class="
              activeScope === scope
                ? 'bg-primary text-inverted'
                : 'bg-elevated text-muted hover:text-highlighted'
            "
            @mousedown.prevent="setScope(scope)"
          >
            {{ t(scopeLabelKey(scope)) }}
            <span v-if="scopeCount(scope) > 0" class="ml-1 opacity-75">
              {{ scopeCount(scope) }}
            </span>
          </button>
        </div>
      </div>

      <ul
        v-if="visibleSuggestions.length > 0"
        class="max-h-80 overflow-y-auto py-1"
      >
        <li
          v-for="(s, i) in visibleSuggestions"
          :key="s.key"
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
          <div
            v-else
            class="flex size-8 shrink-0 items-center justify-center rounded bg-elevated text-muted"
          >
            <UIcon :name="scopeIcon(suggestionScope(s))" class="text-base" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">
                {{ s.title[lang] || s.title.en }}
              </span>
              <UBadge
                :label="t(scopeLabelKey(suggestionScope(s)))"
                :color="scopeColor(suggestionScope(s))"
                size="xs"
                variant="subtle"
                class="shrink-0"
              />
            </div>
            <p v-if="s.excerpt" class="truncate text-xs text-muted">
              {{ s.excerpt[lang] || s.excerpt.en }}
            </p>
          </div>
          <UBadge
            v-if="
              s.productType === 'hybrid' && suggestionScope(s) === 'product'
            "
            :label="t('search.rentalBadge')"
            color="info"
            size="xs"
            variant="subtle"
            class="shrink-0"
          />
        </li>
      </ul>

      <div v-else class="px-3 py-6 text-center text-sm text-muted">
        {{ loading ? t("search.searching") : t("search.noQuickResults") }}
      </div>

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
