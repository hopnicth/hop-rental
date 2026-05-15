<script setup lang="ts">
const LAST_ACTIVITY_KEY = "hop-rental-last-activity";

const { t, locale } = useI18n();
const toast = useToast();
const supabase = useSupabaseClient();
const user = useSupabaseUser();
const { userEmail } = useAuthSession();

const sendingResetPasswordEmail = ref(false);
const signingOutAll = ref(false);
const isSignOutAllOpen = ref(false);
const lastActivityAt = ref<string | null>(null);

const providers = computed(() => {
  const raw = user.value?.app_metadata?.providers;
  return Array.isArray(raw) ? raw.map((provider) => String(provider)) : [];
});

const hasEmailPasswordProvider = computed(
  () => providers.value.length === 0 || providers.value.includes("email"),
);

const isEmailVerified = computed(() =>
  Boolean(user.value?.email_confirmed_at || user.value?.confirmed_at),
);

const canSendResetPasswordEmail = computed(
  () =>
    hasEmailPasswordProvider.value &&
    Boolean(userEmail.value) &&
    !sendingResetPasswordEmail.value,
);

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function refreshLastActivity() {
  if (!import.meta.client) return;
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  lastActivityAt.value = raw ? new Date(Number(raw)).toISOString() : null;
}

async function sendResetPasswordEmail() {
  if (!canSendResetPasswordEmail.value || !userEmail.value) return;

  sendingResetPasswordEmail.value = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      userEmail.value,
      {
        redirectTo: `${window.location.origin}/user/reset-password`,
      },
    );
    if (error) throw error;

    toast.add({
      title: t("user.resetPasswordEmailSent"),
      description: t("user.resetPasswordEmailSentDesc"),
      icon: "bx:envelope",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: t("user.resetPasswordEmailError"),
      description: error instanceof Error ? error.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    sendingResetPasswordEmail.value = false;
  }
}

async function signOutAllDevices() {
  signingOutAll.value = true;
  try {
    const { resetCartSession } = useCart();
    const { resetBookingSession } = useBooking();
    await resetCartSession();
    resetBookingSession();

    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) throw error;
    toast.add({
      title: t("user.signOutAllSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
    await navigateTo("/user/login");
  } catch (error) {
    toast.add({
      title: t("user.signOutAllError"),
      description: error instanceof Error ? error.message : undefined,
      icon: "bx:error-circle",
      color: "error",
    });
  } finally {
    signingOutAll.value = false;
    isSignOutAllOpen.value = false;
  }
}

onMounted(refreshLastActivity);
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ t("user.security") }}</h2>
            <p class="text-sm text-muted">{{ t("user.securitySubtitle") }}</p>
          </div>
          <UBadge
            :label="isEmailVerified ? t('user.verified') : t('user.unverified')"
            :color="isEmailVerified ? 'success' : 'warning'"
            variant="subtle"
          />
        </div>
      </template>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="rounded-lg border p-4">
          <p class="text-xs font-medium tracking-wide text-muted uppercase">
            {{ t("user.emailVerification") }}
          </p>
          <p class="mt-1 font-medium">{{ userEmail || "—" }}</p>
          <p class="mt-2 text-sm text-muted">
            {{
              isEmailVerified
                ? t("user.emailVerifiedDesc")
                : t("user.emailUnverifiedDesc")
            }}
          </p>
        </div>

        <div class="rounded-lg border p-4">
          <p class="text-xs font-medium tracking-wide text-muted uppercase">
            {{ t("user.currentSession") }}
          </p>
          <p class="mt-1 text-sm">
            {{ t("user.lastSignIn") }}:
            {{ formatDateTime(user?.last_sign_in_at) }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ t("user.lastActivity") }}: {{ formatDateTime(lastActivityAt) }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UBadge
              v-for="provider in providers"
              :key="provider"
              :label="provider"
              color="neutral"
              variant="subtle"
            />
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">{{ t("user.changePassword") }}</h3>
      </template>

      <UAlert
        v-if="!hasEmailPasswordProvider"
        color="info"
        variant="soft"
        icon="bx:info-circle"
        :title="t('user.passwordProviderUnavailable')"
        :description="t('user.passwordProviderUnavailableDesc')"
      />

      <div v-else class="space-y-3">
        <p class="text-sm text-muted">{{ t("user.changePasswordIntro") }}</p>
        <UAlert
          color="info"
          variant="soft"
          icon="bx:info-circle"
          :description="t('user.resetPasswordEmailDesc')"
        />
        <UButton
          icon="bx:send"
          :label="t('user.sendResetPasswordEmail')"
          :loading="sendingResetPasswordEmail"
          :disabled="!canSendResetPasswordEmail"
          @click="sendResetPasswordEmail"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">{{ t("user.sessionManagement") }}</h3>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-muted">{{ t("user.sessionManagementDesc") }}</p>
        <UButton
          color="error"
          variant="soft"
          icon="bx:log-out-circle"
          :label="t('user.signOutAllDevices')"
          @click="isSignOutAllOpen = true"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="isSignOutAllOpen"
      :title="t('user.signOutAllDevices')"
    >
      <template #body>
        <p class="text-sm text-muted">{{ t("user.signOutAllDevicesDesc") }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('user.cancel')"
            @click="isSignOutAllOpen = false"
          />
          <UButton
            color="error"
            icon="bx:log-out-circle"
            :label="t('user.signOutAllDevices')"
            :loading="signingOutAll"
            @click="signOutAllDevices"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
