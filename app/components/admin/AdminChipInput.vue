<script setup lang="ts">
type ChipOption = {
  value: string;
  label: string;
  description?: string;
};

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    options?: ChipOption[];
    placeholder?: string;
    hint?: string;
    allowCustom?: boolean;
    maxItems?: number;
    disabled?: boolean;
    emptyText?: string;
    /** Max options rendered in the dropdown at once. Search narrows beyond this. */
    maxVisibleOptions?: number;
  }>(),
  {
    options: () => [],
    placeholder: "Type and press Enter",
    hint: "",
    allowCustom: false,
    disabled: false,
    emptyText: "No matching options",
    maxVisibleOptions: 8,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const query = ref("");
const open = ref(false);

const selectedValues = computed(() => props.modelValue ?? []);
const reachedLimit = computed(
  () => typeof props.maxItems === "number" && selectedValues.value.length >= props.maxItems,
);

const optionMap = computed(
  () => new Map(props.options.map((option) => [option.value, option])),
);

const filteredOptions = computed(() => {
  const used = new Set(selectedValues.value);
  const keyword = query.value.trim().toLowerCase();

  return props.options.filter((option) => {
    if (used.has(option.value)) return false;
    if (keyword.length === 0) return true;

    const haystack = [option.value, option.label, option.description ?? ""]
      .join(" ")
      .toLowerCase();

    return haystack.includes(keyword);
  });
});

function labelFor(value: string) {
  return optionMap.value.get(value)?.label ?? value;
}

function updateValues(nextValues: string[]) {
  emit("update:modelValue", nextValues);
}

function addValue(rawValue: string) {
  const value = rawValue.trim();
  if (!value || props.disabled) return;
  if (selectedValues.value.includes(value)) {
    query.value = "";
    open.value = false;
    return;
  }

  if (typeof props.maxItems === "number" && props.maxItems <= 1) {
    updateValues([value]);
  } else {
    updateValues([...selectedValues.value, value]);
  }

  query.value = "";
  open.value = false;
}

function removeValue(value: string) {
  updateValues(selectedValues.value.filter((item) => item !== value));
}

function handleSubmit() {
  if (reachedLimit.value || props.disabled) return;

  if (filteredOptions.value.length > 0) {
    addValue(filteredOptions.value[0].value);
    return;
  }

  if (props.allowCustom && query.value.trim().length > 0) {
    addValue(query.value);
  }
}

function handleFocus() {
  open.value = true;
}

function handleBlur() {
  window.setTimeout(() => {
    open.value = false;
  }, 120);
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="selectedValues.length > 0" class="flex flex-wrap gap-2">
      <span
        v-for="value in selectedValues"
        :key="value"
        class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary"
      >
        <span class="truncate">{{ labelFor(value) }}</span>
        <button
          type="button"
          class="text-primary/80 transition hover:text-primary"
          :disabled="disabled"
          @click="removeValue(value)"
        >
          ×
        </button>
      </span>
    </div>

    <div class="relative">
      <UInput
        v-model="query"
        :placeholder="reachedLimit ? 'Selection limit reached' : placeholder"
        :disabled="disabled || reachedLimit"
        icon="bx:search"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown.enter.prevent="handleSubmit"
      />

      <div
        v-if="open && filteredOptions.length > 0 && !reachedLimit"
        class="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-default bg-default p-2 shadow-lg"
      >
        <button
          v-for="option in filteredOptions.slice(0, props.maxVisibleOptions)"
          :key="option.value"
          type="button"
          class="flex w-full flex-col rounded-lg px-3 py-2 text-left transition hover:bg-elevated"
          @mousedown.prevent="addValue(option.value)"
        >
          <span class="text-sm font-medium">{{ option.label }}</span>
          <span v-if="option.description" class="text-xs text-muted">
            {{ option.description }}
          </span>
        </button>
      </div>

      <div
        v-else-if="open && query.trim().length > 0 && !allowCustom"
        class="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-default bg-default px-3 py-2 text-xs text-muted shadow-lg"
      >
        {{ emptyText }}
      </div>
    </div>

    <p v-if="hint" class="text-xs text-muted">
      {{ hint }}
    </p>
  </div>
</template>