/**
 * POST /api/admin/partners/:id/verification-documents
 *
 * Upload one KYC document for a partner to the private kyc-documents bucket.
 * Uploading does NOT change is_verified / verified_at / verified_until.
 * Documents accumulate; this endpoint may be called multiple times.
 *
 * Auth:    requireSuperAdmin only
 * Input:   multipart/form-data  field: file
 * Returns: { item: AdminPartnerRow }
 *
 * Errors:
 *   400  id missing
 *   400  file missing
 *   404  partner not found
 *   413  file > 20 MB
 *   415  unsupported MIME type
 *   500  storage / DB error
 */
import {
  createError,
  defineEventHandler,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requireSuperAdmin } from "~~/server/utils/admin";
import {
  ADMIN_PARTNER_DETAIL_SELECT,
  mapAdminPartnerDetail,
} from "~~/server/utils/admin-partners";
import {
  PARTNER_KYC_BUCKET,
  appendPartnerKycDocument,
  buildPartnerKycPath,
  validatePartnerKycMime,
  validatePartnerKycSize,
} from "~~/server/utils/partner-verification";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requireSuperAdmin(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "id is required" });
  }

  // ── Parse multipart ─────────────────────────────────────────────────────
  const parts = await readMultipartFormData(event);
  const file = parts?.find((p) => p.filename && p.data);

  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "file is required",
    });
  }

  // ── Validate ────────────────────────────────────────────────────────────
  validatePartnerKycMime(file.type || "");
  const fileBuffer = Buffer.from(file.data);
  validatePartnerKycSize(fileBuffer.byteLength);

  // ── Verify partner exists + read current kyc_documents ──────────────────
  const { data: existing, error: fetchError } = await adminClient
    .from("partner_profiles")
    .select("id, kyc_documents")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    throw createError({ statusCode: 500, statusMessage: fetchError.message });
  }
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Partner profile not found",
    });
  }

  // ── Upload to private bucket ────────────────────────────────────────────
  const documentId = crypto.randomUUID();
  const originalFilename = file.filename ?? "document";
  const path = buildPartnerKycPath(id, documentId, originalFilename);

  const { error: uploadError } = await adminClient.storage
    .from(PARTNER_KYC_BUCKET)
    .upload(path, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw createError({
      statusCode: 500,
      statusMessage: uploadError.message ?? "Failed to upload document",
    });
  }

  // ── Append metadata to kyc_documents ───────────────────────────────────
  const updatedDocs = appendPartnerKycDocument(existing.kyc_documents, {
    id: documentId,
    name: originalFilename,
    path,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: fileBuffer.byteLength,
    uploadedAt: new Date().toISOString(),
    uploadedByUserId: userId,
  });

  const { data: updated, error: updateError } = await adminClient
    .from("partner_profiles")
    .update({ kyc_documents: updatedDocs })
    .eq("id", id)
    .select(ADMIN_PARTNER_DETAIL_SELECT)
    .single();

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message ?? "Failed to update partner profile",
    });
  }

  return {
    item: mapAdminPartnerDetail(updated as Record<string, unknown>),
  };
});
