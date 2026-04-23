<script setup lang="ts">
import { mockServicePages } from "~/mock/home-content";
import type { LocaleCode } from "~/types/locale";

const route = useRoute();
const { locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);

const service = computed(() =>
  mockServicePages.find((item) => item.slug === String(route.params.slug ?? "")),
);

if (!service.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Service page not found",
  });
}

useSeoMeta({
  title: computed(() => service.value?.title[lang.value] ?? "Service"),
  description: computed(() => service.value?.summary[lang.value] ?? "Service page"),
});
</script>

<template>
  <UContainer class="py-8 sm:py-10">
    <div class="mx-auto max-w-4xl space-y-6">
      <UButton to="/" variant="ghost" color="neutral" icon="bx:left-arrow-alt">
        Back to home
      </UButton>

      <UCard class="overflow-hidden">
        <template #header>
          <div class="space-y-3">
            <UBadge color="primary" variant="soft" size="lg">Our Service</UBadge>
            <div class="space-y-2">
              <h1 class="text-2xl font-semibold sm:text-3xl">
                {{ service?.title[lang] }}
              </h1>
              <p class="text-base text-[var(--ui-text-muted)]">
                {{ service?.summary[lang] }}
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-6">
          <p class="text-sm leading-7 text-[var(--ui-text)] sm:text-base">
            {{ service?.intro[lang] }}
          </p>

          <div class="grid gap-4 sm:grid-cols-3">
            <UCard
              v-for="(bullet, index) in service?.bullets ?? []"
              :key="`${service?.slug}-${index}`"
              variant="subtle"
            >
              <div class="space-y-3">
                <div class="flex items-center gap-2 text-[var(--ui-primary)]">
                  <UIcon name="bx:check-circle" class="size-5" />
                  <span class="text-sm font-semibold">Step {{ index + 1 }}</span>
                </div>
                <p class="text-sm leading-6 text-[var(--ui-text-muted)]">
                  {{ bullet[lang] }}
                </p>
              </div>
            </UCard>
          </div>

          <div class="rounded-2xl bg-[var(--ui-bg-elevated)]/60 p-5">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold">Next step</h2>
                <p class="text-sm text-[var(--ui-text-muted)]">
                  Continue to the prepared page or browse the related catalog area.
                </p>
              </div>

              <UButton :to="service?.ctaHref" color="primary" trailing-icon="bx:right-arrow-alt">
                {{ service?.ctaLabel[lang] }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>