/**
 * GET /api/admin/kyc/profiles/:id
 *
 * Open ONE profile from the Super Admin approve queue (§a addendum item 1 —
 * part of the ratified pending-queue exception; lookup-first remains the rule
 * for identity-based reads). Returns the standard SafeKycProfile shape only.
 *
 * Auth: requirePlatformAdmin + EXPLICIT super_admin check (§a addendum
 * item 2 inversion) — denial audit-logged (action='list_pending') BEFORE the
 * 403. Deliberately NOT the dedicated super-admin guard helper (it would throw before the denial could be logged).
 *
 * Returns: { profile: SafeKycProfile }
 * Errors:  400 | 401 | 403 | 404 | 500
 */
import { createError, defineEventHandler, getHeader, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  asUuidOrNull,
  logKycDocumentAccess,
  parseSingleForwardedIp,
} from "~~/server/utils/kyc-documents";
import {
  KYC_PROFILE_SAFE_SELECT,
  toSafeKycProfile,
  type KycProfileSafeRow,
} from "~~/server/utils/kyc-profile-view";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const profileId = asUuidOrNull(getRouterParam(event, "id"));

  const actor = {
    actorUserId: userId,
    actorRole: platformRole,
    ipAddress:
      parseSingleForwardedIp(getHeader(event, "x-forwarded-for")) ??
      parseSingleForwardedIp(event.node.req.socket?.remoteAddress),
    userAgent: getHeader(event, "user-agent") ?? null,
  };

  if (platformRole !== "super_admin") {
    await logKycDocumentAccess(adminClient, {
      ...actor,
      kycProfileId: profileId,
      action: "list_pending",
      result: "denied",
      reason: profileId ? "not_super_admin" : "not_super_admin_malformed_id",
    });
    throw createError({
      statusCode: 403,
      statusMessage: "Super admin access required",
    });
  }
  if (!profileId) {
    throw createError({ statusCode: 400, statusMessage: "INVALID_PROFILE_ID" });
  }

  const { data, error } = await adminClient
    .from("kyc_profiles")
    .select(KYC_PROFILE_SAFE_SELECT)
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "KYC profile not found" });
  }
  return { profile: toSafeKycProfile(data as unknown as KycProfileSafeRow) };
});
