<script setup lang="ts">
import type { UserProfile } from "~/types/user";

type LifecycleAction = "deactivate" | "request_deletion";

const { t, locale } = useI18n();
const toast = useToast();
const { profile, fetchProfile, loading } = useUserProfile();

const isConfirmOpen = ref(false);
const pendingAction = ref<LifecycleAction | null>(null);
const saving = ref(false);

const statusColor = computed(() => {
  if (profile.value?.accountStatus === "active") return "success";
  if (profile.value?.accountStatus === "deactivated") return "warning";
  if (profile.value?.accountStatus === "deletion_requested") return "error";
  return "neutral";
});

const statusLabel = computed(() => {
  const status = profile.value?.accountStatus ?? "active";
  return t(`user.accountStatus_${status}`);
});

const canDeactivate = computed(
  () => profile.value?.accountStatus === "active" && !saving.value,
);
const canRequestDeletion = computed(
  () =>
    !["deleted", "anonymized", "deletion_requested"].includes(
      profile.value?.accountStatus ?? "active",
    ) && !saving.value,
);

const confirmTitle = computed(() =>
  pendingAction.value === "deactivate"
    ? t("user.deactivateAccount")
    : t("user.requestAccountDeletion"),
);
const confirmDescription = computed(() =>
  pendingAction.value === "deactivate"
    ? t("user.deactivate_description")
    : t("user.delete_description"),
);

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function openConfirm(action: LifecycleAction) {
  pendingAction.value = action;
  isConfirmOpen.value = true;
}

async function confirmLifecycleAction() {
  if (!pendingAction.value) return;

  saving.value = true;
  try {
    await $fetch<{ profile: Partial<UserProfile> }>("/api/user/lifecycle", {
      method: "PUT",
      body: { action: pendingAction.value },
    });
    await fetchProfile(true);
    toast.add({
      title: t("user.accountLifecycleUpdated"),
      icon: "bx:check-circle",
      color: "success",
    });
    isConfirmOpen.value = false;
  } catch (error) {
    toast.add({
      title: t("user.accountLifecycleUpdateError"),
      description: error instanceof Error ? error.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ t("user.accountLifecycle") }}</h2>
            <p class="text-sm text-muted">{{ t("user.accountLifecycleSubtitle") }}</p>
          </div>
          <UBadge :label="statusLabel" :color="statusColor" variant="subtle" />
        </div>
      </template>

      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="h-10 animate-pulse rounded bg-elevated" />
      </div>
      <div v-else class="space-y-5">
        <UAlert
          color="neutral"
          variant="soft"
          icon="bx:shield-quarter"
          :title="t('user.softDeleteReady')"
          :description="t('user.softDeleteReadyDesc')"
        />

        <div class="grid gap-4 md:grid-cols-3">
          <div class="rounded-lg border p-4">
            <p class="text-xs font-medium tracking-wide text-muted uppercase">
              {{ t("user.accountStatus") }}
            </p>
            <p class="mt-1 font-semibold">{{ statusLabel }}</p>
            <p class="mt-2 text-sm text-muted">{{ t("user.accountStatusDesc") }}</p>
          </div>
          <div class="rounded-lg border p-4">
            <p class="text-xs font-medium tracking-wide text-muted uppercase">
              {{ t("user.deactivationRequestedAt") }}
            </p>
            <p class="mt-1 font-semibold">
              {{ formatDateTime(profile?.deactivationRequestedAt) }}
            </p>
          </div>
          <div class="rounded-lg border p-4">
            <p class="text-xs font-medium tracking-wide text-muted uppercase">
              {{ t("user.deletionRequestedAt") }}
            </p>
            <p class="mt-1 font-semibold">
              {{ formatDateTime(profile?.deletionRequestedAt) }}
            </p>
          </div>
        </div>

        <UAlert
          color="info"
          variant="soft"
          icon="bx:receipt"
          :title="t('user.taxRetentionTitle')"
          :description="t('user.delete_description')"
        />

        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border p-4">
            <h3 class="font-semibold">{{ t("user.deactivateAccount") }}</h3>
            <p class="mt-2 text-sm text-muted">{{ t("user.deactivate_description") }}</p>
            <UButton
              class="mt-4"
              color="warning"
              variant="soft"
              icon="bx:pause-circle"
              :label="t('user.deactivateAccount')"
              :disabled="!canDeactivate"
              @click="openConfirm('deactivate')"
            />
          </div>
          <div class="rounded-xl border border-error/30 p-4">
            <h3 class="font-semibold text-error">{{ t("user.requestAccountDeletion") }}</h3>
            <p class="mt-2 text-sm text-muted">{{ t("user.delete_description") }}</p>
            <UButton
              class="mt-4"
              color="error"
              variant="soft"
              icon="bx:trash"
              :label="t('user.requestAccountDeletion')"
              :disabled="!canRequestDeletion"
              @click="openConfirm('request_deletion')"
            />
          </div>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="isConfirmOpen" :title="confirmTitle">
      <template #body>
        <UAlert
          color="warning"
          variant="soft"
          icon="bx:error"
          :title="t('user.confirmAccountLifecycleAction')"
          :description="confirmDescription"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('user.cancel')"
            @click="isConfirmOpen = false"
          />
          <UButton
            color="error"
            icon="bx:check-shield"
            :label="t('user.confirm')"
            :loading="saving"
            @click="confirmLifecycleAction"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
