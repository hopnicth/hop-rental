<script setup lang="ts">
const { t } = useI18n();
const { mainCategories, getSubCategories } = useCategories();
const emit = defineEmits<{ selected: [subId: string] }>();
const router = useRouter();

// Track selected sub-category per main category (single active selection at a time)
const selectedValues = ref<Record<string, string | undefined>>({});

/**
 * Picking a sub-category clears sibling selections and jumps straight to
 * `/search` with synced query/category params.
 */
async function onSelect(mainKey: string, subId: unknown) {
  const id = typeof subId === "string" && subId.length > 0 ? subId : null;
  if (!id) return;

  selectedValues.value = { [mainKey]: id };

  const sub = getSubCategories(mainKey).value.find((s) => s.id === id);
  if (!sub) return;

  emit("selected", id);

  const params = new URLSearchParams({
    q: t(sub.labelKey),
    category: id,
  });

  await router.push(`/search?${params.toString()}`);
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="bx:category" class="size-5" />
        <span class="text-lg font-semibold">{{ t("categories.title") }}</span>
      </div>
    </template>

    <div class="space-y-4">
      <div v-for="main in mainCategories" :key="main.key" class="space-y-1.5">
        <!-- Main category label -->
        <div class="flex items-center gap-2">
          <UIcon v-if="main.icon" :name="main.icon" class="size-4 text-muted" />
          <span class="text-sm font-medium">{{ t(main.labelKey) }}</span>
        </div>

        <select
          :value="selectedValues[main.key] ?? ''"
          class="w-full rounded-xl border border-default bg-white px-3 py-2 text-sm text-default outline-none transition focus:border-primary"
          @change="
            onSelect(main.key, ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="" disabled>
            {{ t("categories.selectPlaceholder") }}
          </option>
          <option
            v-for="sub in getSubCategories(main.key).value"
            :key="sub.id"
            :value="sub.id"
          >
            {{ t(sub.labelKey) }}
          </option>
        </select>
      </div>
    </div>
  </UCard>
</template>
