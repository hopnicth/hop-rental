<script setup lang="ts">
import { getAdminApiErrorMessage } from "~/utils/admin-api";

definePageMeta({
  layout: "admin",
  middleware: ["role"],
  platformRoles: ["super_admin"],
});

type ContactSettings = {
  supportPhone: string;
  lineUrl: string;
  updatedAt: string | null;
};

type ContactSettingsResponse = {
  item: ContactSettings;
  migrationRequired?: boolean;
};

const DEFAULT_SUPPORT_PHONE = "+66 95-479-2333";
const DEFAULT_SUPPORT_LINE_URL =
  "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url";

const toast = useToast();
const saving = ref(false);
const form = reactive({
  supportPhone: DEFAULT_SUPPORT_PHONE,
  lineUrl: DEFAULT_SUPPORT_LINE_URL,
});

const { data, pending, error, refresh } = await useFetch<ContactSettingsResponse>(
  "/api/admin/contact-settings",
  {
    key: "admin-contact-settings",
    default: () => ({
      item: {
        supportPhone: DEFAULT_SUPPORT_PHONE,
        lineUrl: DEFAULT_SUPPORT_LINE_URL,
        updatedAt: null,
      },
      migrationRequired: false,
    }),
  },
);

watchEffect(() => {
  if (saving.value) return;
  form.supportPhone = data.value?.item.supportPhone || DEFAULT_SUPPORT_PHONE;
  form.lineUrl = data.value?.item.lineUrl || DEFAULT_SUPPORT_LINE_URL;
});

const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Failed to load settings"),
);

const phoneHref = computed(() => `tel:${form.supportPhone.replace(/\s+/g, "")}`);
const updatedAtLabel = computed(() => {
  const value = data.value?.item.updatedAt;
  return value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not saved yet";
});

async function saveSettings() {
  saving.value = true;
  try {
    const result = await $fetch<ContactSettingsResponse>(
      "/api/admin/contact-settings",
      {
        method: "PATCH",
        body: { supportPhone: form.supportPhone, lineUrl: form.lineUrl },
      },
    );
    form.supportPhone = result.item.supportPhone;
    form.lineUrl = result.item.lineUrl;
    toast.add({ title: "Settings saved", color: "success", icon: "bx:check-circle" });
    await refresh();
  } catch (saveError) {
    toast.add({
      title: "Save failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-lg font-semibold">Public contact settings</h2>
            <p class="text-sm text-muted">Controls guest ChatFab Line and Call buttons.</p>
          </div>
          <UButton icon="bx:refresh" variant="soft" :loading="pending" @click="refresh">Refresh</UButton>
        </div>
      </template>

      <UAlert v-if="error" color="error" variant="soft" title="Failed to load settings" :description="loadErrorMessage" class="mb-4" />
      <UAlert v-if="data?.migrationRequired" color="warning" variant="soft" title="Migration required" description="Apply migration 053 before saving admin contact settings. The storefront still uses default fallback values." class="mb-4" />

      <div class="space-y-4">
        <UFormField label="Call button phone" required>
          <UInput v-model="form.supportPhone" placeholder="+66 95-479-2333" />
        </UFormField>
        <UFormField label="Line Official URL" required>
          <UInput v-model="form.lineUrl" placeholder="https://line.me/R/ti/p/..." />
        </UFormField>

        <div class="rounded-2xl border border-default bg-neutral-50 p-4">
          <p class="mb-3 text-sm font-medium">Preview</p>
          <div class="flex flex-wrap gap-2">
            <UButton :href="form.lineUrl" target="_blank" rel="noopener noreferrer" color="success" variant="soft" icon="ri:line-fill">Line Official</UButton>
            <UButton :href="phoneHref" color="neutral" variant="soft" icon="bx:phone-call">Call {{ form.supportPhone }}</UButton>
          </div>
          <p class="mt-3 text-xs text-muted">Last updated: {{ updatedAtLabel }}</p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton color="primary" icon="bx:save" :loading="saving" @click="saveSettings">Save settings</UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>