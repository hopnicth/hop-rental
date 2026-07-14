/**
 * POST /api/admin/kyc/profiles/:id/reject
 *
 * FIRST caller of the reject_kyc_profile RPC (migration 121). Rejects a
 * PENDING profile as a super-admin verification decision — decision INSERT,
 * row lock, and status mirror all live in the RPC. Resubmission (document
 * upload) later flips the SAME row back to 'pending'.
 *
 * Auth: requirePlatformAdmin + EXPLICIT super_admin check (§a addendum
 * item 2 inversion) — denial audit-logged (action='reject') BEFORE the 403.
 * Deliberately NOT the dedicated super-admin guard helper (it would throw before the denial could be logged).
 *
 * Body:
 *   reasonCode — 'document_illegible' | 'document_incomplete' |
 *                'document_expired' | 'identity_mismatch' | 'other'
 *   note?      — free-text rejection note (stored on the profile mirror)
 *
 * Returns: { decision: { decisionId, outcome, decidedAt, reasonCode } }
 * Errors:  400 | 401 | 403 | 422 | 500
 */
import { createError, defineEventHandler, getHeader, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  asUuidOrNull,
  logKycDocumentAccess,
  parseSingleForwardedIp,
} from "~~/server/utils/kyc-documents";

const REASON_CODES = new Set([
  "document_illegible",
  "document_incomplete",
  "document_expired",
  "identity_mismatch",
  "other",
]);

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
      action: "reject",
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

  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode : "";
  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;
  if (!REASON_CODES.has(reasonCode)) {
    throw createError({ statusCode: 422, statusMessage: "KYC_REJECT_REASON_INVALID" });
  }

  const { data: actorRow } = await adminClient
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: decision, error: rpcError } = await adminClient.rpc(
    "reject_kyc_profile",
    {
      p_profile_id: profileId,
      p_decided_by_user_id: userId,
      p_decided_by_name: actorRow?.full_name ?? "(unknown)",
      p_decided_by_role: platformRole,
      p_reason_code: reasonCode,
      p_note: note ?? undefined,
      p_ip_address: actor.ipAddress ?? undefined,
      p_user_agent: actor.userAgent ?? undefined,
    },
  );
  if (rpcError) {
    const msg = rpcError.message ?? "reject_kyc_profile failed";
    throw createError({
      statusCode: msg.startsWith("KYC_") ? 422 : 500,
      statusMessage: msg,
    });
  }

  await logKycDocumentAccess(adminClient, {
    ...actor,
    kycProfileId: profileId,
    action: "reject",
    result: "allowed",
    reason: reasonCode,
  });

  return { decision };
});
