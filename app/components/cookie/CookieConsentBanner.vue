<script setup lang="ts">
import type { CookieCategory } from "~/composables/useCookieConsent";

const { t } = useI18n();
const consent = useCookieConsent();

const showBanner = computed(
  () => !consent.hasResponded.value && !consent.isPreferencesOpen.value,
);

const draft = ref<Record<CookieCategory, boolean>>({
  necessary: true,
  analytics: false,
  preferences: false,
  marketing: false,
});

watch(
  () => consent.isPreferencesOpen.value,
  (open) => {
    if (open) {
      draft.value = { ...consent.categories.value, necessary: true };
    }
  },
);

function onAcceptAll() {
  consent.acceptAll();
}

function onRejectNonEssential() {
  consent.rejectNonEssential();
}

function onCustomize() {
  draft.value = { ...consent.categories.value, necessary: true };
  consent.openPreferences();
}

function onSavePreferences() {
  consent.savePreferences(draft.value);
}
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-4 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-4 opacity-0"
      >
        <div
          v-if="showBanner"
          role="dialog"
          aria-modal="false"
          :aria-label="t('cookieConsent.title')"
          class="fixed inset-x-0 bottom-0 z-60 px-3 pb-3 sm:px-6 sm:pb-6"
        >
          <div
            class="mx-auto max-w-4xl rounded-2xl border border-default bg-white p-4 shadow-xl sm:p-5"
          >
            <div
              class="flex flex-col gap-3 md:flex-row md:items-start md:gap-4"
            >
              <div class="flex-1 space-y-1.5">
                <p class="text-base font-semibold text-default">
                  {{ t("cookieConsent.title") }}
                </p>
                <p class="text-sm leading-relaxed text-muted">
                  {{ t("cookieConsent.description") }}
                </p>
              </div>
              <div
                class="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:flex-nowrap md:items-center"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :label="t('cookieConsent.customize')"
                  @click="onCustomize"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :label="t('cookieConsent.rejectNonEssential')"
                  @click="onRejectNonEssential"
                />
                <UButton
                  color="primary"
                  size="sm"
                  :label="t('cookieConsent.acceptAll')"
                  @click="onAcceptAll"
                />
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <UModal
      v-model:open="consent.isPreferencesOpen.value"
      :title="t('cookieConsent.preferencesTitle')"
      :description="t('cookieConsent.preferencesDescription')"
      :ui="{
        overlay: 'z-70',
        content: 'z-70',
      }"
    >
      <template #body>
        <div class="space-y-4">
          <div
            class="rounded-xl border border-default bg-(--ui-bg-elevated)/40 p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-default">
                  {{ t("cookieConsent.categories.necessary.label") }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ t("cookieConsent.categories.necessary.description") }}
                </p>
              </div>
              <USwitch :model-value="true" disabled />
            </div>
          </div>

          <div
            v-for="key in consent.nonNecessaryCategories"
            :key="key"
            class="rounded-xl border border-default p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-default">
                  {{ t(`cookieConsent.categories.${key}.label`) }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ t(`cookieConsent.categories.${key}.description`) }}
                </p>
              </div>
              <USwitch v-model="draft[key]" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('cookieConsent.rejectNonEssential')"
            @click="onRejectNonEssential"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="t('cookieConsent.acceptAll')"
            @click="onAcceptAll"
          />
          <UButton
            color="primary"
            :label="t('cookieConsent.savePreferences')"
            @click="onSavePreferences"
          />
        </div>
      </template>
    </UModal>
  </ClientOnly>
</template>
