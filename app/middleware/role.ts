/**
 * Route middleware for role-based access control.
 *
 * Usage in page:
 *   definePageMeta({ middleware: ["role"], roles: ["b2b_admin"] }) // organization admin
 *   definePageMeta({ middleware: ["role"], platformRoles: ["staff"] }) // HOPNIC internal staff
 *
 * Supported company-context role values: 'b2c', 'b2b_admin', 'b2b_user'
 * Supported platform role values: 'customer', 'staff', 'super_admin'
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const allowedRoles = (to.meta.roles as string[] | undefined) ?? [];
  const allowedPlatformRoles =
    (to.meta.platformRoles as string[] | undefined) ?? [];

  // No role restriction on this page — allow everyone
  if (allowedRoles.length === 0 && allowedPlatformRoles.length === 0) return;

  const user = useSupabaseUser();
  const supabase = useSupabaseClient();
  let resolvedAuthUser = user.value;

  if (!resolvedAuthUser) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    resolvedAuthUser = authUser;
  }

  if (!resolvedAuthUser) {
    const redirect = encodeURIComponent(to.fullPath || "/");
    return navigateTo(`/user/login?redirect=${redirect}`);
  }

  if (allowedPlatformRoles.length > 0) {
    const currentPlatformRole = await fetchCurrentPlatformRole();
    if (
      !currentPlatformRole ||
      !allowedPlatformRoles.includes(currentPlatformRole)
    ) {
      showForbiddenToast();
      return navigateTo("/user/account");
    }
  }

  if (allowedRoles.length > 0) {
    const { activeContext, fetchMemberships, syncContextWithMemberships } =
      useCompanyContext();

    await fetchMemberships();
    syncContextWithMemberships();

    const currentRole = activeContext.value.role ?? "b2c";
    if (!allowedRoles.includes(currentRole)) {
      showForbiddenToast();
      return navigateTo("/user/account");
    }
  }
});

type UserProfileRoleResponse = {
  profile?: {
    id?: unknown;
    platform_role?: unknown;
    platformRole?: unknown;
  } | null;
};

async function fetchCurrentPlatformRole(): Promise<string | null> {
  try {
    const response = await $fetch<UserProfileRoleResponse>("/api/user", {
      headers: import.meta.server ? useRequestHeaders(["cookie"]) : undefined,
    });
    const profile = response.profile;
    if (!profile) return null;
    const role = profile.platform_role ?? profile.platformRole;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

function showForbiddenToast() {
  if (import.meta.server) return;

  const toast = useToast();
  const { t } = useI18n();

  toast.add({
    title: t("user.noPermission"),
    icon: "bx:lock",
    color: "error",
  });
}

// ── Augment Nuxt route meta to include `roles` ──
declare module "#app" {
  interface PageMeta {
    roles?: string[];
    platformRoles?: string[];
  }
}
