/**
 * Route middleware for role-based access control.
 *
 * Usage in page:
 *   definePageMeta({ middleware: ['role'], roles: ['b2b_admin'] })
 *
 * Supported role values: 'b2c', 'b2b_admin', 'b2b_user'
 * If `roles` is not set or empty, the page is accessible to all logged-in users.
 */
export default defineNuxtRouteMiddleware((to) => {
  const allowedRoles = to.meta.roles as string[] | undefined;

  // No role restriction on this page — allow everyone
  if (!allowedRoles || allowedRoles.length === 0) return;

  // Determine current user role from company context
  const { isB2BAdmin, isB2BUser } = useCompanyContext();

  let currentRole: string;
  if (isB2BAdmin.value) currentRole = "b2b_admin";
  else if (isB2BUser.value) currentRole = "b2b_user";
  else currentRole = "b2c";

  // If current role is allowed — pass through
  if (allowedRoles.includes(currentRole)) return;

  // Forbidden — redirect to profile with toast
  const toast = useToast();
  const { t } = useI18n();

  toast.add({
    title: t("user.noPermission"),
    icon: "bx:lock",
    color: "error",
  });

  return navigateTo("/user/account/profile");
});

// ── Augment Nuxt route meta to include `roles` ──
declare module "#app" {
  interface PageMeta {
    roles?: string[];
  }
}

