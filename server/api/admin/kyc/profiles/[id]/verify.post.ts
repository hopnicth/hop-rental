/**
 * POST /api/admin/kyc/profiles/:id/verify
 *
 * FIRST caller of the verify_kyc_profile RPC (migration 112). Verifies a
 * KYC profile as a super-admin decision: §a document completeness is
 * enforced here (422) BEFORE the RPC; the RPC owns the row lock, the
 * decision INSERT, and valid_until (+1 year) — a validity period is NEVER
 * passed in from this endpoint.
 *
 * Auth: requirePlatformAdmin + EXPLICIT super_admin check (§a addendum
 * item 2 inversion) — denial audit-logged (action='verify') BEFORE the 403.
 * Deliberately NOT the dedicated super-admin guard helper (it would throw before the denial could be logged).
 *
 * Body:
 *   reviewedDocumentIds   — uuid[] actually reviewed (RPC re-checks ownership)
 *   visualReviewConfirmed — must be true
 *   vatStatus?            — 'vat_registered' | 'not_vat_registered'
 *                           (REQUIRED for company; forbidden otherwise — RPC
 *                           enforces; endpoint passes through)
 *
 * Returns: { decision: { decisionId, outcome, decidedAt, validUntil } }
 * Errors:  400 | 401 | 403 | 404 | 422 | 500
 */
import { createError, defineEventHandler, getHeader, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { computeKycDocumentCompleteness } from "~~/server/utils/kyc";
import {
  asUuidOrNull,
  logKycDocumentAccess,
  parseSingleForwardedIp,
} from "~~/server/utils/kyc-documents";

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
      action: "verify",
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
  const reviewedDocumentIds = Array.isArray(body.reviewedDocumentIds)
    ? body.reviewedDocumentIds.filter((v): v is string => typeof v === "string")
    : [];
  const visualReviewConfirmed = body.visualReviewConfirmed === true;
  const vatStatus =
    body.vatStatus === "vat_registered" || body.vatStatus === "not_vat_registered"
      ? body.vatStatus
      : null;
  if (!visualReviewConfirmed) {
    throw createError({ statusCode: 422, statusMessage: "KYC_VISUAL_REVIEW_REQUIRED" });
  }
  if (reviewedDocumentIds.length < 1) {
    throw createError({ statusCode: 422, statusMessage: "KYC_REVIEWED_DOCUMENTS_REQUIRED" });
  }

  // §a completeness (the TS-side readiness check migration 112 deferred):
  // refuse verification while required document types are missing.
  const { data: profile, error: profileError } = await adminClient
    .from("kyc_profiles")
    .select("id, customer_type, identity_type")
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) {
    throw createError({ statusCode: 500, statusMessage: profileError.message });
  }
  if (!profile) {
    throw createError({ statusCode: 404, statusMessage: "KYC profile not found" });
  }
  const { data: docs, error: docsError } = await adminClient
    .from("kyc_documents")
    .select("document_type")
    .eq("kyc_profile_id", profileId);
  if (docsError) {
    throw createError({ statusCode: 500, statusMessage: docsError.message });
  }
  const completeness = computeKycDocumentCompleteness(
    String(profile.customer_type),
    String(profile.identity_type),
    (docs ?? []).map((d) => String(d.document_type)),
  );
  if (!completeness.complete) {
    throw createError({
      statusCode: 422,
      statusMessage: "KYC_DOCUMENTS_INCOMPLETE",
      data: { missingDocumentTypes: completeness.missing },
    });
  }

  // Actor display name snapshot for the immutable decision record.
  const { data: actorRow } = await adminClient
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: decision, error: rpcError } = await adminClient.rpc(
    "verify_kyc_profile",
    {
      p_profile_id: profileId,
      p_decided_by_user_id: userId,
      p_decided_by_name: actorRow?.full_name ?? "(unknown)",
      p_decided_by_role: platformRole,
      p_reviewed_document_ids: reviewedDocumentIds,
      p_visual_review_confirmed: true,
      p_vat_status: vatStatus ?? undefined,
      p_ip_address: actor.ipAddress ?? undefined,
      p_user_agent: actor.userAgent ?? undefined,
    },
  );
  if (rpcError) {
    // RPC business errors (KYC_*) → 422; anything else → 500.
    const msg = rpcError.message ?? "verify_kyc_profile failed";
    throw createError({
      statusCode: msg.startsWith("KYC_") ? 422 : 500,
      statusMessage: msg,
    });
  }

  // Allowed decision event — fail-closed would block on log outage; decision
  // history already lives in kyc_verification_decisions, so best-effort here.
  await logKycDocumentAccess(adminClient, {
    ...actor,
    kycProfileId: profileId,
    action: "verify",
    result: "allowed",
    reason: null,
  });

  return { decision };
});
