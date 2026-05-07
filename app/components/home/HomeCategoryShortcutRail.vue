<script setup lang="ts">
import type { HomeCategoryCardGroup } from "~/types/category";

const { t } = useI18n();
const { categoryGroups, pending, error } = useCategories();

const visibleGroups = computed(() =>
  categoryGroups.value.filter(
    (group) => group.isActive && group.options.length > 0,
  ),
);

const skeletonItems = computed(() =>
  Array.from({ length: 5 }, (_, index) => index),
);

function categorySearchPath(group: HomeCategoryCardGroup): string {
  const params = new URLSearchParams({ category: group.mainCategoryKey });
  return `/search?${params.toString()}`;
}
</script>

<template>
  <section class="lg:hidden">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-default">
          {{ t("categories.title") }}
        </p>
        <p class="text-xs text-muted">
          {{ t("categories.selectPlaceholder") }}
        </p>
      </div>
      <UIcon name="bx:category" class="size-5 text-primary" />
    </div>

    <p v-if="error" class="mb-2 text-xs text-warning">
      Using fallback categories.
    </p>

    <div
      class="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div class="flex snap-x gap-3">
        <template v-if="pending && visibleGroups.length === 0">
          <USkeleton
            v-for="item in skeletonItems"
            :key="item"
            class="aspect-square w-28 shrink-0 rounded-2xl"
          />
        </template>

        <NuxtLink
          v-for="group in visibleGroups"
          v-else
          :key="group.id"
          :to="categorySearchPath(group)"
          class="group flex aspect-square w-28 shrink-0 snap-start flex-col justify-between rounded-2xl border border-default bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:bg-gray-900"
        >
          <div class="flex items-start justify-between gap-2">
            <span
              class="inline-flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white"
            >
              <UIcon :name="group.icon || 'bx:category'" class="size-5" />
            </span>
            <UIcon name="bx:search" class="size-4 text-muted" />
          </div>

          <div class="space-y-1">
            <p
              class="line-clamp-2 text-sm font-semibold leading-snug text-default"
            >
              {{ group.label }}
            </p>
            <p class="text-[11px] text-muted">{{ group.options.length }} set</p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>
