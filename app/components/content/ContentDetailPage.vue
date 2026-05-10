<script setup lang="ts">
import {
  SERVICE_AREA_OPTIONS,
  type ServiceAreaOption,
} from "~/data/thaiServiceAreas";
import type { ContentType } from "~/types/content";
import type { LocaleCode } from "~/types/locale";

const props = defineProps<{
  contentType: ContentType;
  backTo: string;
  backLabel: string;
  badge: string;
}>();

const route = useRoute();
const toast = useToast();
const { t, locale } = useI18n();
const lang = computed(() => locale.value as LocaleCode);
const slug = computed(() => String(route.params.slug ?? ""));
const { fetchContentPage } = useContentPages();

const { data: page } = await useAsyncData(
  `content-detail:${props.contentType}:${slug.value}`,
  () => fetchContentPage(props.contentType, slug.value),
);

if (!page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Content page not found",
  });
}

useSeoMeta({
  title: computed(() => page.value?.title[lang.value] ?? props.badge),
  description: computed(() => page.value?.excerpt[lang.value] ?? props.badge),
});

const serviceAreaMap: Record<string, ServiceAreaOption> = Object.fromEntries(
  SERVICE_AREA_OPTIONS.map((option) => [option.value, option]),
);

function serviceAreaLabel(slugValue: string) {
  const option = serviceAreaMap[slugValue];
  if (!option) return slugValue;
  return lang.value === "th" ? option.labelTh : option.labelEn;
}

const serviceAreas = computed(() => {
  if (props.contentType !== "service") return [];
  return page.value?.serviceAreas ?? [];
});

const contactOpen = ref(false);
const serviceProvider = computed(() => page.value?.serviceProvider ?? null);
const hasContactOptions = computed(() => {
  if (props.contentType !== "service" || !serviceProvider.value) return false;
  return Boolean(
    serviceProvider.value.contactPhone ||
    serviceProvider.value.contactEmail ||
    serviceProvider.value.googleMapsUrl,
  );
});
const callHref = computed(() => {
  const phone =
    serviceProvider.value?.contactPhone.replace(/[^\d+]/g, "") ?? "";
  return phone ? `tel:${phone}` : "";
});

async function copyContact(value: string, label: string) {
  if (!value || !import.meta.client) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ title: `${label} copied`, color: "success", icon: "bx:copy" });
  } catch {
    toast.add({
      title: "Copy failed",
      color: "error",
      icon: "bx:error-circle",
    });
  }
}
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <article v-if="page" class="mx-auto max-w-4xl space-y-8">
      <UButton
        :to="backTo"
        variant="ghost"
        color="neutral"
        icon="bx:left-arrow-alt"
      >
        {{ backLabel }}
      </UButton>

      <header class="space-y-5">
        <UBadge color="primary" variant="soft" size="lg">{{ badge }}</UBadge>
        <div class="space-y-3">
          <h1 class="text-3xl font-semibold text-highlighted sm:text-5xl">
            {{ page.title[lang] }}
          </h1>
          <p class="text-lg leading-8 text-muted">
            {{ page.excerpt[lang] }}
          </p>
        </div>
        <NuxtImg
          v-if="page.coverImageUrl"
          :src="page.coverImageUrl"
          :alt="page.title[lang]"
          class="aspect-video w-full rounded-xl object-cover"
        />
      </header>

      <section
        v-if="serviceAreas.length > 0"
        class="rounded-xl border border-default bg-elevated/40 p-5"
      >
        <h2 class="mb-3 text-base font-semibold text-highlighted">
          {{ t("home.serviceAreasTitle") }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="area in serviceAreas"
            :key="area"
            color="primary"
            variant="soft"
            size="md"
          >
            {{ serviceAreaLabel(area) }}
          </UBadge>
        </div>
      </section>

      <ContentRenderer :body="page.body" />
    </article>
  </UContainer>

  <UButton
    v-if="hasContactOptions"
    class="fixed bottom-6 right-6 z-40 shadow-lg"
    color="primary"
    size="xl"
    icon="bx:phone-call"
    label="Contact"
    @click="contactOpen = true"
  />

  <UModal v-model:open="contactOpen" title="Contact service provider">
    <template #body>
      <div v-if="serviceProvider" class="space-y-4">
        <div
          v-if="serviceProvider.contactPhone"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">Call</p>
          <p class="break-all text-sm text-muted">
            {{ serviceProvider.contactPhone }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="copyContact(serviceProvider.contactPhone, 'Phone')"
            >
              Copy
            </UButton>
            <UButton size="sm" icon="bx:phone" :to="callHref">Call now</UButton>
          </div>
        </div>

        <div
          v-if="serviceProvider.contactEmail"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">Email</p>
          <p class="break-all text-sm text-muted">
            {{ serviceProvider.contactEmail }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="copyContact(serviceProvider.contactEmail, 'Email')"
            >
              Copy
            </UButton>
            <UButton
              size="sm"
              icon="bx:envelope"
              :to="`mailto:${serviceProvider.contactEmail}`"
            >
              Email
            </UButton>
          </div>
        </div>

        <div
          v-if="serviceProvider.googleMapsUrl"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">Google Maps</p>
          <p class="break-all text-sm text-muted">
            {{ serviceProvider.googleMapsUrl }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="copyContact(serviceProvider.googleMapsUrl, 'Google Maps')"
            >
              Copy
            </UButton>
            <UButton
              size="sm"
              icon="bx:map"
              :to="serviceProvider.googleMapsUrl"
              target="_blank"
              external
            >
              Open
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
