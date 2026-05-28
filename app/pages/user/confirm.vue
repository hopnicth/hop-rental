<script setup lang="ts">
/**
 * OAuth callback page.
 * The @nuxtjs/supabase module automatically exchanges the auth code for a session.
 * We wait for the session to resolve, clear any stale profile state, refresh the
 * profile, then redirect. This prevents the race where profile was fetched before
 * the session cookies were fully set, causing platform_role to appear as 'customer'
 * on the first Google OAuth login on production.
 */
const route = useRoute();
const user = useSupabaseUser();
const { t } = useI18n();
const { clearProfile, refreshProfile, profile } = useUserProfile();

const redirectTarget = computed(() => {
  const redirect = route.query.redirect;
  return typeof redirect === "string" && redirect.startsWith("/")
    ? redirect
    : "/";
});

const didRedirect = ref(false);

watch(
  user,
  async (newUser) => {
    if (!newUser || didRedirect.value) return;
    didRedirect.value = true;

    // Only clear + reload when the profile is absent or belongs to a different
    // user. This is the normal path for a fresh OAuth callback. If a logged-in
    // user somehow lands here, their existing profile is preserved.
    if (!profile.value || profile.value.id !== newUser.id) {
      clearProfile();

      // Await the profile refresh so the correct platform_role is in state
      // before navigation. The session cookies are established at this point,
      // so the /api/user request will succeed.
      try {
        await refreshProfile();
      } catch {
        // Profile fetch failed — redirect anyway; the destination page will
        // retry via its own ensureProfileLoaded() call (e.g. admin layout).
      }
    }

    await navigateTo(redirectTarget.value, { replace: true });
  },
  { immediate: true },
);
</script>

<template>
  <UContainer
    class="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-4"
  >
    <UIcon
      name="bx:loader-alt"
      class="size-8 animate-spin text-[var(--ui-color-primary-500)]"
    />
    <p class="text-[var(--ui-text-muted)]">{{ t("auth.loginSubtitle") }}…</p>
  </UContainer>
</template>
