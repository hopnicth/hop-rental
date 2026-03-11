<script setup lang="ts">
/**
 * OAuth callback page.
 * Supabase redirects here after Google sign-in (or email confirmation link).
 * The @nuxtjs/supabase module automatically exchanges the auth code for a session.
 * We simply wait for the user to be resolved, then redirect.
 */
const user = useSupabaseUser();
const { t } = useI18n();

watchEffect(() => {
  if (user.value) {
    // Session confirmed — redirect to home (or saved redirect path via cookie)
    navigateTo("/");
  }
});
</script>

<template>
  <UContainer class="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-4">
    <UIcon name="bx:loader-alt" class="size-8 animate-spin text-[var(--ui-color-primary-500)]" />
    <p class="text-[var(--ui-text-muted)]">
      {{ t("auth.loginSubtitle") }}…
    </p>
  </UContainer>
</template>

