<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";
import type { HomeLinkCard } from "~/types/home";

const props = defineProps<{
  card: HomeLinkCard;
}>();

const { locale, t } = useI18n();
const lang = computed(() => locale.value as LocaleCode);
</script>

<template>
  <NuxtLink
    :to="props.card.linkUrl"
    :target="props.card.linkTarget || '_self'"
    class="block h-full"
  >
    <UCard
      class="h-[22rem] overflow-hidden transition-shadow duration-200 hover:shadow-lg"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <div class="flex h-full flex-col">
        <NuxtImg
          :src="props.card.imageUrl"
          :alt="props.card.title[lang]"
          class="h-48 w-full object-cover"
          loading="lazy"
        />

        <div class="flex flex-1 flex-col gap-3 p-4">
          <div class="space-y-2">
            <UBadge color="primary" variant="soft" size="sm">
              {{
                props.card.sectionKey === "service"
                  ? t("home.serviceBadge")
                  : t("home.promotionBadge")
              }}
            </UBadge>
            <h3
              class="line-clamp-2 text-base font-semibold text-[var(--ui-text)]"
            >
              {{ props.card.title[lang] }}
            </h3>
            <p class="line-clamp-3 text-sm text-[var(--ui-text-muted)]">
              {{ props.card.description[lang] }}
            </p>
          </div>

          <div
            class="mt-auto flex items-center gap-2 text-sm font-medium text-[var(--ui-primary)]"
          >
            <span>{{ t("home.learnMore") }}</span>
            <UIcon name="bx:right-arrow-alt" class="size-5" />
          </div>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
