<script setup lang="ts">
import CatalogCardShell from "~/components/products/CatalogCardShell.vue";
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";
import type { ContentPage } from "~/types/content";
import type { LocaleCode } from "~/types/locale";

const props = defineProps<{ page: ContentPage }>();
const toast = useToast();
const { locale, t } = useI18n();
const user = useSupabaseUser();
const { pathForContent } = useContentPages();
const { isSaved, isToggling, toggleSaveList } = useSaveList();
const lang = computed(() => locale.value as LocaleCode);
const to = computed(() =>
  pathForContent(props.page.contentType, props.page.slug),
);
const imageSrc = computed(
  () =>
    props.page.coverImageUrl ||
    "https://placehold.co/400x400/E0E0E0/757575?text=HOPNIC&font=roboto",
);
const canSaveService = computed(() => props.page.contentType === "service");
const isVerifiedService = computed(
  () => canSaveService.value && props.page.serviceProvider?.isVerified === true,
);
const saved = isSaved("service", props.page.id);
const saveLoading = isToggling("service", props.page.id);
const saveLabel = computed(() =>
  saved.value ? t("saveList.removeService") : t("saveList.addService"),
);
const serviceAreaMap = Object.fromEntries(
  SERVICE_AREA_OPTIONS.map((option) => [option.value, option]),
);

function serviceAreaLabel(area: string) {
  const option = serviceAreaMap[area];
  if (!option) return area;
  return locale.value === "th" ? option.labelTh : option.labelEn;
}

async function handleSaveToggle() {
  if (!canSaveService.value) return;
  if (!user.value) {
    toast.add({
      title: t("saveList.loginTitle"),
      description: t("saveList.loginDesc"),
      icon: "bx:log-in-circle",
      color: "warning",
      duration: 3000,
    });
    await navigateTo("/user/login");
    return;
  }

  try {
    const next = await toggleSaveList("service", props.page.id);
    toast.add({
      title: next ? t("saveList.savedAdded") : t("saveList.savedRemoved"),
      icon: next ? "bx:bookmark" : "bx:check-circle",
      color: next ? "secondary" : "neutral",
      duration: 2200,
    });
  } catch (error) {
    toast.add({
      title: t("saveList.saveError"),
      description: error instanceof Error ? error.message : "Unknown error",
      icon: "bx:error-circle",
      color: "error",
      duration: 3000,
    });
  }
}
</script>

<template>
  <CatalogCardShell
    :title="page.title[lang]"
    :subtitle="t(`search.scope.${page.contentType}`)"
    :image-src="imageSrc"
    :image-alt="page.title[lang]"
    :to="to"
    :clickable="true"
    card-class="hover:ring-2 hover:ring-primary"
  >
    <template v-if="canSaveService || isVerifiedService" #overlay>
      <UTooltip v-if="isVerifiedService" text="Verified provider">
        <UBadge
          color="success"
          variant="solid"
          icon="bx:check-circle"
          class="shadow-sm"
        >
          Verified
        </UBadge>
      </UTooltip>
      <UTooltip :text="saveLabel" :popper="{ placement: 'top' }">
        <UButton
          icon="bx:bookmark"
          :color="saved ? 'secondary' : 'neutral'"
          :variant="saved ? 'solid' : 'soft'"
          size="sm"
          square
          :loading="saveLoading"
          class="shadow-sm backdrop-blur transition-all duration-200 hover:scale-110 hover:shadow-md"
          :aria-label="saveLabel"
          @click.prevent.stop="handleSaveToggle()"
        />
      </UTooltip>
    </template>

    <template #description>
      <p class="line-clamp-2 text-sm text-muted">
        {{ page.excerpt[lang] }}
      </p>
    </template>

    <template #details>
      <div class="flex flex-wrap gap-2">
        <UBadge color="primary" size="sm" variant="subtle">
          {{ t(`search.scope.${page.contentType}`) }}
        </UBadge>
        <UBadge
          v-for="area in page.serviceAreas.slice(0, 2)"
          :key="area"
          color="neutral"
          size="sm"
          variant="subtle"
        >
          {{ serviceAreaLabel(area) }}
        </UBadge>
      </div>
    </template>

    <template #badges>
      <span class="text-sm font-medium text-primary">
        {{ t("home.learnMore") }}
      </span>
    </template>

    <template #actions>
      <UButton
        :to="to"
        icon="bx:right-arrow-alt"
        color="primary"
        variant="soft"
        size="sm"
        square
        :aria-label="t('home.learnMore')"
      />
    </template>
  </CatalogCardShell>
</template>
