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
      class="h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:ring-2 hover:ring-primary"
    >
      <template #header>
        <div class="flex min-h-14 flex-col justify-start gap-1">
          <UBadge color="primary" variant="soft" size="sm" class="w-fit">
            {{
              props.card.sectionKey === "service"
                ? t("home.serviceBadge")
                : t("home.promotionBadge")
            }}
          </UBadge>
          <h3 class="line-clamp-2 text-sm font-semibold text-highlighted">
            {{ props.card.title[lang] }}
          </h3>
        </div>
      </template>

      <NuxtImg
        :src="props.card.imageUrl"
        :alt="props.card.title[lang]"
        class="aspect-square w-full object-cover"
        loading="lazy"
      />

      <div class="mt-3 flex min-h-60 flex-col gap-3">
        <div class="min-h-10">
          <p class="line-clamp-3 text-sm text-muted">
            {{ props.card.description[lang] }}
          </p>
        </div>

        <div class="mt-auto flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-primary">
            {{ t("home.learnMore") }}
          </span>
          <UIcon name="bx:right-arrow-alt" class="size-5 text-primary" />
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
