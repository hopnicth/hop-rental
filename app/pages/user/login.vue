<script setup lang="ts">
import type { AuthError } from "@supabase/supabase-js";

definePageMeta({ layout: "default" });

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const { t } = useI18n();
const toast = useToast();

/** Toggle between sign-in and sign-up mode */
const mode = ref<"in" | "up">("in");
const loading = ref(false);

// Redirect to home if already logged in
watchEffect(() => {
  if (user.value) {
    navigateTo("/");
  }
});

// ── Form fields ──
const fields = computed(() => {
  const base = [
    {
      name: "email",
      label: t("auth.emailLabel"),
      type: "text" as const,
      placeholder: t("auth.emailPlaceholder"),
      required: true,
    },
    {
      name: "password",
      label: t("auth.passwordLabel"),
      type: "password" as const,
      placeholder: t("auth.passwordPlaceholder"),
      required: true,
    },
  ];

  if (mode.value === "up") {
    base.push({
      name: "confirmPassword",
      label: t("auth.confirmPasswordLabel"),
      type: "password" as const,
      placeholder: t("auth.confirmPasswordPlaceholder"),
      required: true,
    });
  }

  return base;
});

// ── Google OAuth provider ──
const providers = computed(() => [
  {
    label: t("auth.signInWithGoogle"),
    icon: "bx:bxl-google",
    color: "neutral" as const,
    variant: "outline" as const,
    onClick: signInWithGoogle,
  },
]);

// ── Auth actions ──
async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showError(error);
  toast.add({
    title: t("auth.loginSuccess"),
    icon: "bx:check-circle",
    color: "success",
  });
}

async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return showError(error);

  // Supabase returns user with empty identities when email already exists
  // (security feature to prevent email enumeration)
  if (
    data.user &&
    (!data.user.identities || data.user.identities.length === 0)
  ) {
    toast.add({
      title: t("auth.signUpError"),
      description: t("auth.emailAlreadyRegistered"),
      icon: "bx:error-circle",
      color: "error",
    });
    return;
  }

  // If session exists → auto-confirmed (Confirm email disabled in Supabase)
  // watchEffect will redirect to home — no need to call signInWithEmail
  if (data.session) {
    toast.add({
      title: t("auth.signUpSuccess"),
      icon: "bx:check-circle",
      color: "success",
    });
    return;
  }

  // No session → email confirmation required
  toast.add({
    title: t("auth.signUpCheckEmail"),
    icon: "bx:envelope",
    color: "info",
  });
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/user/confirm` },
  });
  if (error) showError(error);
}

function showError(error: AuthError) {
  toast.add({
    title: mode.value === "in" ? t("auth.loginError") : t("auth.signUpError"),
    description: error.message,
    icon: "bx:error-circle",
    color: "error",
  });
}

// ── Form submit handler ──
async function onSubmit(payload: any) {
  const { email, password, confirmPassword } = payload.data;

  if (mode.value === "up" && password !== confirmPassword) {
    toast.add({
      title: t("auth.signUpError"),
      description: "Passwords do not match",
      icon: "bx:error-circle",
      color: "error",
    });
    return;
  }

  loading.value = true;
  try {
    if (mode.value === "in") {
      await signInWithEmail(email, password);
    } else {
      await signUpWithEmail(email, password);
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UContainer
    class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12"
  >
    <UCard class="w-full max-w-sm">
      <UAuthForm
        :title="mode === 'in' ? t('auth.loginTitle') : t('auth.signUpTitle')"
        :description="
          mode === 'in' ? t('auth.loginSubtitle') : t('auth.signUpSubtitle')
        "
        icon="bx:user-circle"
        :fields="fields"
        :providers="providers"
        :separator="t('auth.orContinueWith')"
        :loading="loading"
        :submit="{
          label:
            mode === 'in' ? t('auth.signInButton') : t('auth.signUpButton'),
          block: true,
        }"
        @submit="onSubmit"
      >
        <template #footer>
          <p class="text-center text-sm text-[var(--ui-text-muted)]">
            {{ mode === "in" ? t("auth.noAccount") : t("auth.hasAccount") }}
            <UButton
              variant="link"
              :label="
                mode === 'in' ? t('auth.signUpButton') : t('auth.signInButton')
              "
              class="p-0"
              @click="mode = mode === 'in' ? 'up' : 'in'"
            />
          </p>
        </template>
      </UAuthForm>
    </UCard>
  </UContainer>
</template>
