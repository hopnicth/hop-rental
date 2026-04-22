import type { CompanyRole, PlatformRole } from "~/types/user";

export function formatPlatformRole(
  role: PlatformRole | null | undefined,
): string {
  if (role === "super_admin") return "HOPNIC Super Admin";
  if (role === "staff") return "HOPNIC Staff";
  return "Customer";
}

export function formatCompanyRole(role: CompanyRole | null | undefined): string {
  if (role === "b2b_admin") return "Organization Admin";
  if (role === "b2b_user") return "Organization Member";
  return "—";
}

export function formatContextMode(
  hasActiveCompany: boolean,
  hasMembership: boolean,
): string {
  if (hasActiveCompany) return "Organization context";
  if (hasMembership) return "Organization membership available";
  return "Personal customer context";
}