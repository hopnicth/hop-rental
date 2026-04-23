<script setup lang="ts">
import type { LocaleCode } from "~/types/locale";

const { bannerSlides } = useBanners();
const { locale, t } = useI18n();
const lang = computed(() => locale.value as LocaleCode);
</script>

<template>
  <div class="overflow-hidden rounded-[2rem] bg-neutral-950 shadow-sm">
    <UCarousel
      v-slot="{ item }"
      loop
      dots
      :autoplay="{ delay: 4000 }"
      :items="bannerSlides"
      :ui="{
        root: 'relative w-full',
        item: 'basis-full',
        dots: 'bottom-4',
        prev: 'hidden md:inline-flex left-4 z-20 border border-white/15 bg-black/45 text-white shadow-lg backdrop-blur',
        next: 'hidden md:inline-flex right-4 z-20 border border-white/15 bg-black/45 text-white shadow-lg backdrop-blur',
      }"
    >
      <div
        class="relative h-[33vh] min-h-[15rem] max-h-[22rem] w-full overflow-hidden"
      >
        <NuxtImg
          :src="item.mobileImageUrl || item.imageUrl"
          :alt="item.title[lang]"
          class="absolute inset-0 h-full w-full object-cover md:hidden"
          loading="lazy"
        />
        <NuxtImg
          :src="item.imageUrl"
          :alt="item.title[lang]"
          class="absolute inset-0 hidden h-full w-full object-cover md:block"
          loading="lazy"
        />

        <div
          class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25"
        />

        <div class="relative z-10 flex h-full items-end p-6 sm:p-8 lg:p-10">
          <div class="max-w-2xl space-y-4 text-white">
            <UBadge color="neutral" variant="soft" size="lg">
              {{ t("home.heroBadge") }}
            </UBadge>
            <div class="space-y-2">
              <h1
                class="text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl"
              >
                {{ item.title[lang] }}
              </h1>
              <p class="max-w-xl text-sm leading-6 text-white/85 sm:text-base">
                {{ item.subtitle[lang] }}
              </p>
            </div>

            <UButton
              :to="item.linkUrl"
              :target="item.linkTarget || '_self'"
              color="primary"
              size="lg"
              trailing-icon="bx:right-arrow-alt"
            >
              {{ item.ctaLabel[lang] }}
            </UButton>
          </div>
        </div>
      </div>
    </UCarousel>
  </div>
</template>
