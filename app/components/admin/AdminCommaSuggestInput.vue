<script setup lang="ts">
type SuggestionItem = {
  value: string;
  label: string;
  source: string;
  sourceLabel: string;
  description?: string | null;
};

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    suggestions: SuggestionItem[];
    placeholder?: string;
    helperText?: string;
    mode?: "tag" | "keyword";
    excludedValues?: string[];
  }>(),
  {
    placeholder: "",
    helperText: "",
    mode: "tag",
    excludedValues: () => [],
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const draftText = ref("");
const open = ref(false);
const highlighted = ref(-1);
const isComposing = ref(false);

function normalizeTagValue(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{Letter}\p{Number}\p{Mark}_-]/gu, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeKeywordValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDisplayValue(value: string) {
  return props.mode === "tag"
    ? normalizeTagValue(value)
    : normalizeKeywordValue(value);
}

function normalizeDraftValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = normalizeDisplayValue(value);
  return normalized || trimmed;
}

function normalizeCompareValue(value: string) {
  const normalized = normalizeDisplayValue(value);
  return props.mode === "tag" ? normalized : normalized.toLowerCase();
}

function parseInput(value: string, options: { finalizeDraft?: boolean } = {}) {
  const normalized = value.replace(/\r\n/g, "\n");
  const endsWithDelimiter = /[,\n]\s*$/.test(normalized);
  const rawParts = normalized.split(/[\n,]+/);

  let draft = "";

  if (!options.finalizeDraft && !endsWithDelimiter && rawParts.length > 0) {
    draft = normalizeDraftValue(rawParts.pop() ?? "");
  }

  const seen = new Set<string>([
    ...normalizedModelValue.value.map(normalizeCompareValue),
    ...props.excludedValues
      .map((item) => normalizeCompareValue(item))
      .filter((item) => item.length > 0),
  ]);
  const items: string[] = [];

  for (const rawItem of rawParts) {
    const item = normalizeDisplayValue(rawItem);
    const key = normalizeCompareValue(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return { items, draft };
}

function sameValues(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const parsedInput = computed(() => parseInput(draftText.value));
const pendingDraft = computed(() => parsedInput.value.draft);

const normalizedModelValue = computed(() => {
  const nextValues = props.modelValue
    .map((item) => normalizeDisplayValue(item))
    .filter((item) => item.length > 0);

  return Array.from(new Set(nextValues.map(normalizeCompareValue))).map(
    (key) =>
      nextValues.find((item) => normalizeCompareValue(item) === key) ?? "",
  );
});

const normalizedSuggestions = computed(() => {
  const seen = new Set<string>();
  const items: SuggestionItem[] = [];

  for (const suggestion of props.suggestions) {
    const value = normalizeDisplayValue(suggestion.value);
    const key = normalizeCompareValue(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      ...suggestion,
      value,
      label: suggestion.label?.trim() || value,
    });
  }

  return items;
});

const suggestionMap = computed(
  () =>
    new Map(
      normalizedSuggestions.value.map((item) => [
        normalizeCompareValue(item.value),
        item,
      ]),
    ),
);

const selectedEntries = computed(() =>
  normalizedModelValue.value.map((value) => ({
    value,
    suggestion: suggestionMap.value.get(normalizeCompareValue(value)),
  })),
);

const availableSuggestions = computed(() => {
  const selected = new Set(
    normalizedModelValue.value.map(normalizeCompareValue),
  );
  const excluded = new Set(props.excludedValues.map(normalizeCompareValue));

  return normalizedSuggestions.value.filter((item) => {
    const key = normalizeCompareValue(item.value);
    if (selected.has(key) || excluded.has(key)) return false;
    return true;
  });
});

const filteredSuggestions = computed(() => {
  const query = pendingDraft.value.trim().toLowerCase();
  if (!query) return [];

  return availableSuggestions.value.filter((item) => {
    const value = normalizeDisplayValue(item.value).toLowerCase();
    return (
      item.label.toLowerCase().includes(query) ||
      value.includes(query) ||
      item.description?.toLowerCase().includes(query)
    );
  });
});

function appendValues(values: string[]) {
  if (values.length === 0) return;

  const nextValues = [...normalizedModelValue.value];
  const seen = new Set(nextValues.map(normalizeCompareValue));
  const excluded = new Set(
    props.excludedValues
      .map((item) => normalizeCompareValue(item))
      .filter((item) => item.length > 0),
  );

  for (const value of values) {
    const key = normalizeCompareValue(value);
    if (!key || seen.has(key) || excluded.has(key)) continue;
    seen.add(key);
    nextValues.push(value);
  }

  if (!sameValues(nextValues, normalizedModelValue.value)) {
    emit("update:modelValue", nextValues);
  }
}

watch(draftText, (value) => {
  if (!/[\n,]/.test(value)) return;

  const { items, draft } = parseInput(value);
  appendValues(items);

  if (draft !== value) {
    draftText.value = draft;
  }
});

watch(filteredSuggestions, () => {
  highlighted.value = filteredSuggestions.value.length > 0 ? 0 : -1;
  open.value = !isComposing.value && pendingDraft.value.length > 0;
});

function sourceColor(source: string) {
  if (source === "category") return "primary";
  if (source === "existing_keyword") return "info";
  return "neutral";
}

function isKnownSuggestion(value: string) {
  return suggestionMap.value.has(normalizeCompareValue(value));
}

function applySuggestion(value: string) {
  appendValues([normalizeDisplayValue(value)]);
  draftText.value = "";
  open.value = false;
}

function onFocus() {
  open.value = !isComposing.value && pendingDraft.value.length > 0;
}

function onBlur() {
  setTimeout(() => {
    open.value = false;
    commitInput();
  }, 120);
}

function onCompositionStart() {
  isComposing.value = true;
  open.value = false;
}

function onCompositionEnd() {
  isComposing.value = false;
  highlighted.value = filteredSuggestions.value.length > 0 ? 0 : -1;
  open.value = pendingDraft.value.length > 0;
}

function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || isComposing.value) {
    return;
  }

  if (event.key === "ArrowDown") {
    if (filteredSuggestions.value.length === 0) return;
    event.preventDefault();
    highlighted.value =
      (highlighted.value + 1) % filteredSuggestions.value.length;
    open.value = true;
    return;
  }

  if (event.key === "ArrowUp") {
    if (filteredSuggestions.value.length === 0) return;
    event.preventDefault();
    highlighted.value =
      highlighted.value <= 0
        ? filteredSuggestions.value.length - 1
        : highlighted.value - 1;
    open.value = true;
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const choice = filteredSuggestions.value[highlighted.value];
    if (choice) {
      applySuggestion(choice.value);
    } else {
      open.value = false;
      commitInput();
    }
    return;
  }

  if (event.key === "Escape") {
    open.value = false;
  }
}

function commitInput() {
  const { items } = parseInput(draftText.value, { finalizeDraft: true });
  appendValues(items);
  draftText.value = "";
}

function removeValue(value: string) {
  const nextValues = normalizedModelValue.value.filter(
    (item) => normalizeCompareValue(item) !== normalizeCompareValue(value),
  );

  emit("update:modelValue", nextValues);
}
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <UInput
        v-model="draftText"
        :placeholder="placeholder"
        @focus="onFocus"
        @blur="onBlur"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @keydown="onKeydown"
      />

      <div
        v-if="!isComposing && open && filteredSuggestions.length > 0"
        class="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-default bg-default shadow-xl"
      >
        <div class="border-b border-default px-4 py-3 text-xs text-muted">
          Suggestions for:
          <span class="font-medium text-default">{{ pendingDraft }}</span>
        </div>
        <ul class="max-h-72 overflow-y-auto p-2">
          <li
            v-for="(item, index) in filteredSuggestions"
            :key="`${item.source}:${item.value}`"
            class="cursor-pointer rounded-xl px-3 py-3 transition-colors"
            :class="index === highlighted ? 'bg-elevated' : 'hover:bg-elevated'"
            @mousedown.prevent="applySuggestion(item.value)"
            @mouseenter="highlighted = index"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <p class="truncate text-sm font-medium text-default">
                  {{ item.label }}
                </p>
                <p
                  v-if="item.value !== item.label || item.description"
                  class="text-xs text-muted"
                >
                  {{
                    item.value !== item.label ? item.value : item.description
                  }}
                </p>
              </div>
              <UBadge
                :color="sourceColor(item.source)"
                variant="soft"
                size="xs"
                class="shrink-0"
              >
                {{ item.sourceLabel }}
              </UBadge>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="helperText" class="text-xs text-muted">
      {{ helperText }}
    </p>

    <div
      v-if="selectedEntries.length > 0"
      class="rounded-2xl border border-default bg-default p-3"
    >
      <p
        class="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted"
      >
        Selected
      </p>

      <div class="flex flex-wrap gap-2">
        <div
          v-for="entry in selectedEntries"
          :key="entry.value"
          class="flex items-center gap-1.5 rounded-full border border-default bg-elevated px-3 py-1.5 shadow-sm"
        >
          <span class="text-xs font-medium text-default">{{
            entry.value
          }}</span>
          <UBadge
            v-if="entry.suggestion"
            :color="sourceColor(entry.suggestion?.source ?? 'manual')"
            variant="soft"
            size="xs"
          >
            {{ entry.suggestion?.sourceLabel ?? "Known" }}
          </UBadge>
          <UBadge
            v-else-if="!isKnownSuggestion(entry.value)"
            color="success"
            variant="soft"
            size="xs"
          >
            new
          </UBadge>
          <button
            type="button"
            class="text-xs text-muted transition hover:text-default"
            @click="removeValue(entry.value)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="pendingDraft"
      class="rounded-xl border border-dashed border-default bg-elevated px-3 py-2 text-xs text-muted"
    >
      Preview:
      <span class="font-medium text-default">{{ pendingDraft }}</span>
    </div>
  </div>
</template>
