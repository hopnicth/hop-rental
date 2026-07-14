/**
 * POST /api/user/kyc/id-card
 *
 * Customer self-serve KYC submission (§a channel 1 intake — T1b rail-move
 * pulled into T1a per decisions.md §a addendum item 3). Creates/attaches the
 * caller's user-bound kyc_profiles row (once per user, migration 120) and
 * stores the signed ID copy in the PRIVATE `kyc-profile-documents` bucket —
 * the legacy `kyc-documents` bucket is retired as a write target on this
 * path. Submission lands in the Super Admin pending queue.
 *
 * Input: multipart/form-data
 *   file          — signed ID copy (JPEG/PNG/PDF by MAGIC BYTES, max 5 MB)
 *   identityValue — Thai national ID number (hashed server-side, never stored)
 *   holderName    — name-on-ID (§a)
 *
 * Rules:
 *  - PDPA consent required (403) — unchanged from the legacy path.
 *  - verified profile → 409 KYC_ALREADY_VERIFIED (§a: once per user).
 *  - rejected profile → resubmission flips the SAME row back to 'pending',
 *    recorded in the upload audit row (never silent).
 *  - identity mismatch vs the existing bound profile → 409 (the identity
 *    root of a profile never changes via re-upload).
 *  - users.kyc_status mirror stays 'pending' for the account-page badge.
 *
 * Returns: { profile: { id, status }, document: { documentType, mimeType } }
 * Errors:  400 | 401 | 403 | 409 | 413 | 415 | 422 | 500
 */
import { createError, defineEventHandler, getHeader, readMultipartFormData } from "h3";
import {
  serverSupabaseServiceRole,
  serverSupabaseUser,
} from "#supabase/server";
import { getAuthUserId } from "~~/server/utils/user-wishlist";
import {
  hashKycIdentity,
  maskLast4,
  normalizeKycIdentity,
} from "~~/server/utils/kyc";
import {
  KYC_PROFILE_DOCUMENTS_BUCKET,
  buildKycDocumentStorageKey,
  logKycDocumentAccess,
  parseSingleForwardedIp,
  sniffKycDocumentMime,
} from "~~/server/utils/kyc-documents";

const MAX_BYTES = 5 * 1024 * 1024;

function textPart(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
): string {
  const value = parts
    ?.find((p) => p.name === name && !p.filename)
    ?.data?.toString("utf8")
    .trim();
  return value ?? "";
}

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = getAuthUserId(authUser);
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const parts = await readMultipartFormData(event);
  const file =
    parts?.find((part) => part.name === "file" && part.filename && part.data) ??
    parts?.find((part) => part.filename && part.data);
  const identityValue = textPart(parts, "identityValue");
  const holderName = textPart(parts, "holderName");

  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "ID card file is required",
    });
  }
  if (!identityValue) {
    throw createError({ statusCode: 422, statusMessage: "IDENTITY_VALUE_REQUIRED" });
  }
  if (!holderName) {
    throw createError({ statusCode: 422, statusMessage: "HOLDER_NAME_REQUIRED" });
  }

  const buffer = Buffer.from(file.data);
  if (buffer.byteLength > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "ID card file must be 5MB or smaller",
    });
  }
  // Magic-byte sniffing — the client-declared MIME is never trusted on the
  // kyc-profile-documents rails.
  const sniffedMime = sniffKycDocumentMime(buffer);
  if (!sniffedMime) {
    throw createError({
      statusCode: 415,
      statusMessage: "Only JPEG, PNG, or PDF files are supported",
    });
  }

  const client = serverSupabaseServiceRole(event);
  const { data: userRow, error: profileError } = await client
    .from("users")
    .select("pdpa_consented_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    throw createError({ statusCode: 500, statusMessage: profileError.message });
  }
  if (!userRow?.pdpa_consented_at) {
    throw createError({
      statusCode: 403,
      statusMessage: "PDPA consent is required before uploading KYC documents",
    });
  }

  // Hash the identity server-side (national_id — B2C individual channel).
  let identityHash: string;
  let identityLast4: string;
  try {
    const normalized = normalizeKycIdentity("national_id", identityValue);
    identityLast4 = maskLast4(normalized);
    identityHash = hashKycIdentity("national_id", identityValue);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const isSecretError = message.includes("KYC_HASH_SECRET");
    throw createError({
      statusCode: isSecretError ? 500 : 400,
      statusMessage: isSecretError ? "KYC_HASH_UNAVAILABLE" : "INVALID_IDENTITY_FORMAT",
    });
  }

  // Once-per-user (migration 120): attach to the existing bound profile.
  const { data: existingRows, error: lookupError } = await client
    .from("kyc_profiles")
    .select("id, status, identity_hash")
    .eq("user_id", userId)
    .limit(1);
  if (lookupError) {
    throw createError({ statusCode: 500, statusMessage: lookupError.message });
  }
  const existing = (existingRows ?? [])[0] ?? null;
  if (existing?.status === "verified") {
    throw createError({ statusCode: 409, statusMessage: "KYC_ALREADY_VERIFIED" });
  }
  if (existing && existing.identity_hash !== identityHash) {
    // The identity root of a bound profile never changes via re-upload.
    throw createError({ statusCode: 409, statusMessage: "KYC_IDENTITY_MISMATCH" });
  }

  let profileId: string;
  let wasRejected = false;
  if (existing) {
    profileId = existing.id;
    wasRejected = existing.status === "rejected";
    // Keep the §a name capture current on resubmission.
    const { error: nameError } = await client
      .from("kyc_profiles")
      .update({ holder_name: holderName })
      .eq("id", profileId);
    if (nameError) {
      throw createError({ statusCode: 500, statusMessage: nameError.message });
    }
  } else {
    const { data: inserted, error: insertError } = await client
      .from("kyc_profiles")
      .insert({
        user_id: userId,
        holder_name: holderName,
        customer_type: "individual",
        identity_type: "national_id",
        identity_hash: identityHash,
        identity_last4: identityLast4,
        status: "pending",
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      const code = (insertError as { code?: string } | null)?.code;
      throw createError({
        statusCode: code === "23505" ? 409 : 500,
        statusMessage:
          code === "23505"
            ? "KYC_PROFILE_ALREADY_EXISTS_FOR_USER"
            : (insertError?.message ?? "KYC profile create failed"),
      });
    }
    profileId = inserted.id;
  }

  // Upload to the private bucket under an opaque key (server-proxy rails —
  // no signed URL, no public URL, ever).
  const storageKey = buildKycDocumentStorageKey(sniffedMime);
  const { error: uploadError } = await client.storage
    .from(KYC_PROFILE_DOCUMENTS_BUCKET)
    .upload(storageKey, buffer, { contentType: sniffedMime, upsert: false });
  if (uploadError) {
    throw createError({ statusCode: 500, statusMessage: uploadError.message });
  }

  const { data: doc, error: docError } = await client
    .from("kyc_documents")
    .insert({
      kyc_profile_id: profileId,
      document_type: "id_card",
      storage_path: storageKey,
      mime_type: sniffedMime,
      file_size_bytes: buffer.byteLength,
      uploaded_by_user_id: userId,
    })
    .select("id, document_type, mime_type")
    .single();
  if (docError || !doc) {
    await client.storage
      .from(KYC_PROFILE_DOCUMENTS_BUCKET)
      .remove([storageKey])
      .catch(() => undefined);
    throw createError({
      statusCode: 500,
      statusMessage: docError?.message ?? "KYC document insert failed",
    });
  }

  // Rejected-profile resubmission → same-row flip to pending (fail-closed;
  // recorded in the upload audit row — never silent).
  let uploadLogReason: string | null = null;
  if (wasRejected) {
    const { error: flipError } = await client
      .from("kyc_profiles")
      .update({ status: "pending" })
      .eq("id", profileId)
      .eq("status", "rejected");
    if (flipError) {
      throw createError({
        statusCode: 500,
        statusMessage: "KYC_RESUBMISSION_FLIP_FAILED",
      });
    }
    uploadLogReason = "resubmission_status_rejected_to_pending";
  }

  // Best-effort upload audit row — actor is the customer themselves.
  await logKycDocumentAccess(client, {
    documentId: doc.id,
    kycProfileId: profileId,
    actorUserId: userId,
    actorRole: "customer",
    action: "upload",
    result: "allowed",
    reason: uploadLogReason,
    documentType: "id_card",
    storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
    storagePath: storageKey,
    ipAddress:
      parseSingleForwardedIp(getHeader(event, "x-forwarded-for")) ??
      parseSingleForwardedIp(event.node.req.socket?.remoteAddress),
    userAgent: getHeader(event, "user-agent") ?? null,
  });

  // Account-page badge mirror (legacy users.kyc_status display path).
  const { error: mirrorError } = await client
    .from("users")
    .update({ kyc_status: "pending" })
    .eq("id", userId);
  if (mirrorError) {
    throw createError({ statusCode: 500, statusMessage: mirrorError.message });
  }

  return {
    profile: { id: profileId, status: "pending" },
    document: { documentType: doc.document_type, mimeType: doc.mime_type },
  };
});
