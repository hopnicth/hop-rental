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
function sanitizeLineUrl(value?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const isAllowedHost =
      host === "line.me" || host === "lin.ee" || host.endsWith(".line.me");
    return url.protocol === "https:" && isAllowedHost ? url.toString() : "";
  } catch {
    return "";
  }
}

function sanitizeLineId(value?: string) {
  const id = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
  return /^@?[A-Za-z0-9._-]{2,64}$/.test(id) ? id : "";
}

function lineUrlFromId(value?: string) {
  const id = sanitizeLineId(value);
  if (!id) return "";
  if (id.startsWith("@")) return `https://line.me/R/ti/p/${id}`;
  return `https://line.me/ti/p/~${encodeURIComponent(id)}`;
}

const lineContactHref = computed(() => {
  const provider = serviceProvider.value;
  if (!provider) return "";
  return (
    sanitizeLineUrl(provider.lineUrl) ||
    sanitizeLineUrl(provider.lineId) ||
    lineUrlFromId(provider.lineId)
  );
});
const lineContactDisplay = computed(
  () => serviceProvider.value?.lineId || lineContactHref.value,
);
const hasContactOptions = computed(() => {
  if (props.contentType !== "service" || !serviceProvider.value) return false;
  return Boolean(
    serviceProvider.value.contactPhone ||
    serviceProvider.value.contactEmail ||
    serviceProvider.value.googleMapsUrl ||
    lineContactHref.value,
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

  <div
    v-if="hasContactOptions"
    class="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3"
  >
    <UTooltip v-if="lineContactHref" :text="t('service.lineContact')">
      <UButton
        :to="lineContactHref"
        target="_blank"
        external
        class="shadow-lg"
        color="success"
        size="xl"
        icon="ri:line-fill"
        :aria-label="t('service.lineContact')"
      />
    </UTooltip>
    <UButton
      class="shadow-lg"
      color="primary"
      size="xl"
      icon="bx:phone-call"
      :label="t('service.contactProvider')"
      :aria-label="t('service.contactProvider')"
      @click="contactOpen = true"
    />
  </div>

  <UModal v-model:open="contactOpen" :title="t('service.contactProviderTitle')">
    <template #body>
      <div v-if="serviceProvider" class="space-y-4">
        <div
          v-if="serviceProvider.contactPhone"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">
            {{ t("service.call") }}
          </p>
          <p class="break-all text-sm text-muted">
            {{ serviceProvider.contactPhone }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="
                copyContact(serviceProvider.contactPhone, t('service.phone'))
              "
            >
              {{ t("service.copy") }}
            </UButton>
            <UButton size="sm" icon="bx:phone" :to="callHref">
              {{ t("service.callNow") }}
            </UButton>
          </div>
        </div>

        <div
          v-if="lineContactHref"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">
            {{ t("service.lineContact") }}
          </p>
          <p class="break-all text-sm text-muted">
            {{ lineContactDisplay }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="copyContact(lineContactDisplay, t('service.lineContact'))"
            >
              {{ t("service.copy") }}
            </UButton>
            <UButton
              size="sm"
              icon="ri:line-fill"
              :to="lineContactHref"
              target="_blank"
              external
            >
              {{ t("service.openLine") }}
            </UButton>
          </div>
        </div>

        <div
          v-if="serviceProvider.contactEmail"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">
            {{ t("service.email") }}
          </p>
          <p class="break-all text-sm text-muted">
            {{ serviceProvider.contactEmail }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="
                copyContact(serviceProvider.contactEmail, t('service.email'))
              "
            >
              {{ t("service.copy") }}
            </UButton>
            <UButton
              size="sm"
              icon="bx:envelope"
              :to="`mailto:${serviceProvider.contactEmail}`"
            >
              {{ t("service.email") }}
            </UButton>
          </div>
        </div>

        <div
          v-if="serviceProvider.googleMapsUrl"
          class="rounded-lg border border-default p-4"
        >
          <p class="mb-1 text-sm font-semibold text-highlighted">
            {{ t("service.googleMaps") }}
          </p>
          <p class="break-all text-sm text-muted">
            {{ serviceProvider.googleMapsUrl }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="bx:copy"
              @click="
                copyContact(
                  serviceProvider.googleMapsUrl,
                  t('service.googleMaps'),
                )
              "
            >
              {{ t("service.copy") }}
            </UButton>
            <UButton
              size="sm"
              icon="bx:map"
              :to="serviceProvider.googleMapsUrl"
              target="_blank"
              external
            >
              {{ t("service.open") }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
