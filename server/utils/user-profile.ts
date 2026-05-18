import type { UserProfile } from "~/types/user";

export const USER_PROFILE_SELECT_BASE =
  "id, full_name, first_name, last_name, phone, avatar_url, platform_role, membership_level, kyc_status, id_card_url, pdpa_consent_url, pdpa_consented_at, kyc_rejection_reason, created_at, updated_at";

export const USER_PROFILE_SELECT_WITH_LIFECYCLE = `${USER_PROFILE_SELECT_BASE}, account_status, deactivation_requested_at, deletion_requested_at, deleted_at, anonymized_at, lifecycle_updated_at`;

export const USER_PROFILE_SELECT_LEGACY =
  "id, full_name, phone, platform_role, membership_level, kyc_status, id_card_url, pdpa_consent_url, pdpa_consented_at, kyc_rejection_reason, created_at, updated_at";

export const USER_PROFILE_SELECT_LEGACY_WITH_LIFECYCLE = `${USER_PROFILE_SELECT_LEGACY}, account_status, deactivation_requested_at, deletion_requested_at, deleted_at, anonymized_at, lifecycle_updated_at`;

export function isMissingOptionalUserProfileColumns(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42703" ||
    err?.message?.includes("first_name") === true ||
    err?.message?.includes("last_name") === true ||
    err?.message?.includes("avatar_url") === true
  );
}

export function isMissingUserLifecycleColumns(error: unknown) {
  const err = error as { code?: string | null; message?: string | null } | null;
  return (
    err?.code === "42703" ||
    err?.message?.includes("account_status") === true ||
    err?.message?.includes("deactivation_requested_at") === true ||
    err?.message?.includes("lifecycle_updated_at") === true
  );
}

function optionalProfileText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildUserProfileUpdatePayload(
  body: Record<string, unknown>,
): Partial<
  Record<
    "full_name" | "first_name" | "last_name" | "phone" | "avatar_url",
    string | null
  >
> {
  const payload: Partial<
    Record<
      "full_name" | "first_name" | "last_name" | "phone" | "avatar_url",
      string | null
    >
  > = {};
  const fullName = optionalProfileText(body.fullName);
  const firstName = optionalProfileText(body.firstName);
  const lastName = optionalProfileText(body.lastName);
  const phone = optionalProfileText(body.phone);
  const avatarUrl = optionalProfileText(body.avatarUrl);

  if (fullName !== undefined) payload.full_name = fullName;
  if (firstName !== undefined) payload.first_name = firstName;
  if (lastName !== undefined) payload.last_name = lastName;
  if (phone !== undefined) payload.phone = phone;
  if (avatarUrl !== undefined) payload.avatar_url = avatarUrl;

  return payload;
}

export type UserProfileApiResponse = {
  profile: Record<string, unknown> | UserProfile | null;
};
