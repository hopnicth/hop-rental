<script setup lang="ts">
import CatalogCardShell from "~/components/products/CatalogCardShell.vue";
import type { LocaleCode } from "~/types/locale";
import type { HomeLinkCard } from "~/types/home";

const props = defineProps<{
  card: HomeLinkCard;
}>();

const toast = useToast();
const { locale, t } = useI18n();
const user = useSupabaseUser();
const { isSaved, isToggling, toggleSaveList } = useSaveList();
const lang = computed(() => locale.value as LocaleCode);
const canSaveService = computed(
  () =>
    props.card.sectionKey === "service" && Boolean(props.card.contentPageId),
);
const saved = computed(() =>
  props.card.contentPageId
    ? isSaved("service", props.card.contentPageId).value
    : false,
);
const saveLoading = computed(() =>
  props.card.contentPageId
    ? isToggling("service", props.card.contentPageId).value
    : false,
);
const saveLabel = computed(() =>
  saved.value ? t("saveList.removeService") : t("saveList.addService"),
);

async function handleSaveToggle() {
  if (!props.card.contentPageId) return;
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
    const next = await toggleSaveList("service", props.card.contentPageId);
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
    :title="props.card.title[lang]"
    :subtitle="
      props.card.sectionKey === 'service'
        ? t('home.serviceBadge')
        : t('home.promotionBadge')
    "
    :image-src="props.card.imageUrl"
    :image-alt="props.card.title[lang]"
    :to="props.card.linkUrl"
    :clickable="props.card.linkTarget !== '_blank'"
    card-class="hover:ring-2 hover:ring-primary"
  >
    <template v-if="canSaveService" #overlay>
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
        {{ props.card.description[lang] }}
      </p>
    </template>

    <template #details>
      <div class="flex flex-wrap gap-2">
        <UBadge color="primary" size="sm" variant="subtle">
          {{
            props.card.sectionKey === "service"
              ? t("home.serviceBadge")
              : t("home.promotionBadge")
          }}
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
        :to="props.card.linkUrl"
        :target="props.card.linkTarget || '_self'"
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
