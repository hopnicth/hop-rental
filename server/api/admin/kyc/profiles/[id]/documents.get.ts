/**
 * GET /api/admin/kyc/profiles/:id/documents
 *
 * List the KYC documents of one kyc_profile — SAFE METADATA ONLY. Built for
 * the Admin KYC Documents Panel v1 (staging). Document bytes stay behind the
 * separate super_admin-only server-proxy download endpoint
 * (documents/[id]/download.get.ts); this route never touches Storage.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin) — matches the upload
 *          endpoint's visibility; the listed metadata is the PII-free
 *          SafeKycDocument whitelist.
 * Returns: { documents: SafeKycDocument[] } ordered uploaded_at desc
 * Errors:  400 (malformed profile id) | 401 | 403 | 404 (profile absent) | 500
 *
 * SECURITY / INVARIANTS:
 *  - The route id is classified with asUuidOrNull (the same strict UUID
 *    classifier the download endpoint uses) before any query.
 *  - SELECT is KYC_DOCUMENT_SAFE_SELECT only and every row goes through
 *    toSafeKycDocument only — storage paths, the storage bucket, signed/public
 *    URLs, uploader id, and raw identity values can never appear in the
 *    response by construction.
 *  - 404 for an absent profile is acceptable at this privilege level: the
 *    platform-admin lookup endpoint already discloses profile existence.
 *  - List access is intentionally UNLOGGED in v1 — it returns safe metadata
 *    only and is lower sensitivity than document delivery. No
 *    kyc_document_access_log write, no new audit action value. Revisit if
 *    metadata listing is later deemed auditable.
 *  - DB errors return opaque machine codes; raw error text goes to the server
 *    log only.
 */
import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { asUuidOrNull } from "~~/server/utils/kyc-documents";
import {
  KYC_DOCUMENT_SAFE_SELECT,
  toSafeKycDocument,
  type KycDocumentSafeRow,
  type SafeKycDocument,
} from "~~/server/utils/kyc-document-view";

export interface AdminKycDocumentListResponse {
  documents: SafeKycDocument[];
}

export default defineEventHandler(
  async (event): Promise<AdminKycDocumentListResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);

    const profileId = asUuidOrNull(getRouterParam(event, "id"));
    if (!profileId) {
      throw createError({
        statusCode: 400,
        statusMessage: "INVALID_PROFILE_ID",
      });
    }

    // Profile existence gate (404). Bare id only — this endpoint returns no
    // profile data; the lookup endpoint owns the SafeKycProfile response.
    const { data: profileRow, error: profileError } = await adminClient
      .from("kyc_profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) {
      console.error(
        "[kyc] kyc_profiles read failed during document list",
        profileError.message,
      );
      throw createError({
        statusCode: 500,
        statusMessage: "KYC_PROFILE_READ_FAILED",
      });
    }
    if (!profileRow) {
      throw createError({
        statusCode: 404,
        statusMessage: "KYC profile not found",
      });
    }

    const { data, error } = await adminClient
      .from("kyc_documents")
      .select(KYC_DOCUMENT_SAFE_SELECT)
      .eq("kyc_profile_id", profileId)
      .order("uploaded_at", { ascending: false });
    if (error) {
      console.error("[kyc] kyc_documents list read failed", error.message);
      throw createError({
        statusCode: 500,
        statusMessage: "KYC_DOCUMENT_LIST_FAILED",
      });
    }

    return {
      documents: ((data ?? []) as KycDocumentSafeRow[]).map(toSafeKycDocument),
    };
  },
);
