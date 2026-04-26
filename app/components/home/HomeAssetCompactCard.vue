<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";
import type { Asset } from "~/types/asset";

const props = defineProps<{
  access: Asset;
}>();

const { locale, t } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const detailUrl = computed(() => `/asset/${props.access.slug}`);
</script>

<template>
  <NuxtLink :to="detailUrl" class="block h-full">
    <UCard
      class="h-88 overflow-hidden transition-shadow duration-200 hover:shadow-lg"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <div class="flex h-full flex-col">
        <NuxtImg
          :src="props.access.thumbnail"
          :alt="props.access.name[lang]"
          class="h-48 w-full object-cover"
          loading="lazy"
        />

        <div class="flex flex-1 flex-col gap-3 p-4">
          <div class="space-y-2">
            <UBadge color="secondary" variant="soft" size="sm">
              {{ props.access.code }}
            </UBadge>
            <h3
              class="line-clamp-2 text-base font-semibold text-[var(--ui-text)]"
            >
              {{ props.access.name[lang] }}
            </h3>
            <p class="line-clamp-3 text-sm text-[var(--ui-text-muted)]">
              {{ props.access.description[lang] }}
            </p>
          </div>

          <div class="mt-auto flex items-end justify-between gap-3">
            <div class="space-y-1 text-sm">
              <p class="text-[var(--ui-text-muted)]">
                {{ t("productDetail.deposit") }}: ฿{{
                  props.access.pricing.deposit.toLocaleString()
                }}
              </p>
              <p
                v-if="props.access.pricing.dailyEnabled"
                class="font-semibold text-[var(--ui-primary)]"
              >
                ฿{{ props.access.pricing.daily.toLocaleString() }}/{{
                  t("home.perDay")
                }}
              </p>
              <p
                v-if="props.access.pricing.weeklyEnabled"
                class="text-[var(--ui-text-muted)]"
              >
                ฿{{ props.access.pricing.weekly.toLocaleString() }}/{{
                  t("productDetail.perWeek")
                }}
              </p>
              <p
                v-if="props.access.pricing.monthlyEnabled"
                class="text-[var(--ui-text-muted)]"
              >
                ฿{{ props.access.pricing.monthly.toLocaleString() }}/{{
                  t("productDetail.perMonth")
                }}
              </p>
            </div>

            <UButton size="sm" color="secondary" variant="soft">
              {{ t("home.viewDetails") }}
            </UButton>
          </div>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
