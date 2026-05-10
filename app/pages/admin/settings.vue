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

type BranchAccessBranch = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
};

type BranchAccessUser = {
  id: string;
  fullName: string;
  phone: string;
  platformRole: "staff" | "super_admin";
  branchIds: string[];
};

type BranchAccessResponse = {
  users: BranchAccessUser[];
  branches: BranchAccessBranch[];
  migrationRequired?: boolean;
};

const DEFAULT_SUPPORT_PHONE = "+66 95-479-2333";
const DEFAULT_SUPPORT_LINE_URL =
  "https://line.me/R/ti/p/@832vmicv?ts=03031436&oat_content=url";

const toast = useToast();
const saving = ref(false);
const savingBranchUserId = ref<string | null>(null);
const branchAccessDraft = ref<Record<string, string[]>>({});
const form = reactive({
  supportPhone: DEFAULT_SUPPORT_PHONE,
  lineUrl: DEFAULT_SUPPORT_LINE_URL,
});

const { data, pending, error, refresh } =
  await useFetch<ContactSettingsResponse>("/api/admin/contact-settings", {
    key: "admin-contact-settings",
    default: () => ({
      item: {
        supportPhone: DEFAULT_SUPPORT_PHONE,
        lineUrl: DEFAULT_SUPPORT_LINE_URL,
        updatedAt: null,
      },
      migrationRequired: false,
    }),
  });

const {
  data: branchAccessData,
  pending: branchAccessPending,
  error: branchAccessError,
  refresh: refreshBranchAccess,
} = await useFetch<BranchAccessResponse>("/api/admin/pos/branch-access", {
  key: "admin-pos-branch-access",
  default: () => ({ users: [], branches: [], migrationRequired: false }),
});

watchEffect(() => {
  if (saving.value) return;
  form.supportPhone = data.value?.item.supportPhone || DEFAULT_SUPPORT_PHONE;
  form.lineUrl = data.value?.item.lineUrl || DEFAULT_SUPPORT_LINE_URL;
});

watchEffect(() => {
  if (savingBranchUserId.value) return;
  const next: Record<string, string[]> = {};
  for (const user of branchAccessData.value?.users ?? []) {
    next[user.id] = [...user.branchIds];
  }
  branchAccessDraft.value = next;
});

const loadErrorMessage = computed(() =>
  getAdminApiErrorMessage(error.value, "Failed to load settings"),
);

const phoneHref = computed(
  () => `tel:${form.supportPhone.replace(/\s+/g, "")}`,
);
const updatedAtLabel = computed(() => {
  const value = data.value?.item.updatedAt;
  return value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not saved yet";
});
const branchAccessLoadErrorMessage = computed(() =>
  getAdminApiErrorMessage(
    branchAccessError.value,
    "Failed to load POS branch access",
  ),
);

function hasBranchAccess(userId: string, branchId: string) {
  return branchAccessDraft.value[userId]?.includes(branchId) === true;
}

function toggleBranchAccess(
  userId: string,
  branchId: string,
  checked: boolean,
) {
  const current = new Set(branchAccessDraft.value[userId] ?? []);
  if (checked) current.add(branchId);
  else current.delete(branchId);
  branchAccessDraft.value = {
    ...branchAccessDraft.value,
    [userId]: [...current],
  };
}

function handleBranchCheckboxChange(
  event: Event,
  userId: string,
  branchId: string,
) {
  const checked =
    event.target instanceof HTMLInputElement && event.target.checked;
  toggleBranchAccess(userId, branchId, checked);
}

function grantAllBranches(userId: string) {
  branchAccessDraft.value = {
    ...branchAccessDraft.value,
    [userId]: (branchAccessData.value?.branches ?? []).map(
      (branch) => branch.id,
    ),
  };
}

function clearBranches(userId: string) {
  branchAccessDraft.value = { ...branchAccessDraft.value, [userId]: [] };
}

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
    toast.add({
      title: "Settings saved",
      color: "success",
      icon: "bx:check-circle",
    });
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

async function saveBranchAccess(user: BranchAccessUser) {
  savingBranchUserId.value = user.id;
  try {
    await $fetch("/api/admin/pos/branch-access", {
      method: "PATCH",
      body: {
        userId: user.id,
        branchIds: branchAccessDraft.value[user.id] ?? [],
      },
    });
    toast.add({
      title: "POS branch access saved",
      description: user.fullName || user.id,
      color: "success",
      icon: "bx:check-circle",
    });
    await refreshBranchAccess();
  } catch (saveError) {
    toast.add({
      title: "Save branch access failed",
      description: getAdminApiErrorMessage(saveError, "Unknown error"),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    savingBranchUserId.value = null;
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">Public contact settings</h2>
            <p class="text-sm text-muted">
              Controls guest ChatFab Line and Call buttons.
            </p>
          </div>
          <UButton
            icon="bx:refresh"
            variant="soft"
            :loading="pending"
            @click="refresh"
            >Refresh</UButton
          >
        </div>
      </template>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        title="Failed to load settings"
        :description="loadErrorMessage"
        class="mb-4"
      />
      <UAlert
        v-if="data?.migrationRequired"
        color="warning"
        variant="soft"
        title="Migration required"
        description="Apply migration 053 before saving admin contact settings. The storefront still uses default fallback values."
        class="mb-4"
      />

      <div class="space-y-4">
        <UFormField label="Call button phone" required>
          <UInput
            v-model="form.supportPhone"
            class="w-full"
            placeholder="+66 95-479-2333"
          />
        </UFormField>
        <UFormField label="Line Official URL" required>
          <UInput
            v-model="form.lineUrl"
            class="w-full"
            placeholder="https://line.me/R/ti/p/..."
          />
        </UFormField>

        <div class="rounded-2xl border border-default bg-neutral-50 p-4">
          <p class="mb-3 text-sm font-medium">Preview</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              :href="form.lineUrl"
              target="_blank"
              rel="noopener noreferrer"
              color="success"
              variant="soft"
              icon="ri:line-fill"
              >Line Official</UButton
            >
            <UButton
              :href="phoneHref"
              color="neutral"
              variant="soft"
              icon="bx:phone-call"
              >Call {{ form.supportPhone }}</UButton
            >
          </div>
          <p class="mt-3 text-xs text-muted">
            Last updated: {{ updatedAtLabel }}
          </p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="primary"
            icon="bx:save"
            :loading="saving"
            @click="saveSettings"
            >Save settings</UButton
          >
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 class="text-lg font-semibold">POS branch access</h2>
            <p class="text-sm text-muted">
              Super Admin กำหนดว่าสตาฟคนไหนใช้งาน POS ได้ที่สาขาใด
            </p>
          </div>
          <UButton
            icon="bx:refresh"
            variant="soft"
            :loading="branchAccessPending"
            @click="refreshBranchAccess"
            >Refresh</UButton
          >
        </div>
      </template>

      <UAlert
        v-if="branchAccessError"
        color="error"
        variant="soft"
        title="Failed to load POS branch access"
        :description="branchAccessLoadErrorMessage"
        class="mb-4"
      />
      <UAlert
        v-if="branchAccessData?.migrationRequired"
        color="warning"
        variant="soft"
        title="Migration required"
        description="Apply migration 059 before managing POS branch access."
        class="mb-4"
      />

      <div v-if="branchAccessData?.users.length" class="space-y-4">
        <div
          v-for="user in branchAccessData.users"
          :key="user.id"
          class="rounded-2xl border border-default p-4"
        >
          <div
            class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium">{{ user.fullName || user.id }}</p>
                <UBadge
                  :color="
                    user.platformRole === 'super_admin' ? 'primary' : 'neutral'
                  "
                  variant="soft"
                >
                  {{ user.platformRole }}
                </UBadge>
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ user.phone || "No phone" }} · {{ user.id }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                label="All branches"
                @click="grantAllBranches(user.id)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                label="Clear"
                @click="clearBranches(user.id)"
              />
              <UButton
                size="xs"
                color="primary"
                icon="bx:save"
                :loading="savingBranchUserId === user.id"
                label="Save"
                @click="saveBranchAccess(user)"
              />
            </div>
          </div>

          <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label
              v-for="branch in branchAccessData.branches"
              :key="branch.id"
              class="flex cursor-pointer items-start gap-2 rounded-xl border border-default p-3 text-sm hover:border-primary/60"
            >
              <input
                type="checkbox"
                class="mt-1"
                :checked="hasBranchAccess(user.id, branch.id)"
                @change="handleBranchCheckboxChange($event, user.id, branch.id)"
              />
              <span>
                <span class="font-medium">{{ branch.nameTh }}</span>
                <span class="block text-xs text-muted">
                  {{ branch.code }} · {{ branch.nameEn }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-muted">
        ยังไม่มี staff/super_admin user สำหรับตั้งค่าสาขา POS
      </p>
    </UCard>
  </div>
</template>
