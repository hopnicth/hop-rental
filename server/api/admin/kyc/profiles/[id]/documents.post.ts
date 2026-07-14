/**
 * POST /api/admin/kyc/profiles/:id/documents
 *
 * Upload ONE KYC document for an existing kyc_profile to the dedicated private
 * `kyc-profile-documents` bucket and insert the matching public.kyc_documents
 * row. Staff intake only — there is NO customer self-upload for MVP.
 *
 * Auth:    requirePlatformAdmin (staff + super_admin); service-role storage + DB.
 * Input:   multipart/form-data
 *            file          — the document (JPEG/PNG/PDF, max 10 MB actual bytes)
 *            documentType  — kyc_document_type enum value (must be coherent
 *                            with the profile's customer_type × identity_type
 *                            pair — see map below)
 *            issuedAt?     — YYYY-MM-DD; REQUIRED for company_cert; never in
 *                            the future (Asia/Bangkok) for ANY type
 *            expiresAt?    — YYYY-MM-DD (optional; kyc_documents.expires_at);
 *                            must not be earlier than issuedAt when both given
 * Returns: { document: SafeKycDocument }
 * Errors:  400 | 401 | 403 | 404 | 413 | 415 | 422 | 500
 *
 * documentType ↔ profile coherence (422 INVALID_DOCUMENT_TYPE_FOR_PROFILE) —
 * keyed on the customer_type × identity_type pair to mirror the create-time
 * COHERENT_IDENTITY_TYPES guard in profiles/index.post.ts (individual →
 * national_id | passport; company → juristic_id). The identity-evidence
 * document must match the identity root the profile was created with:
 *   individual × national_id → id_card | signature
 *   individual × passport    → passport | signature
 *   company    × juristic_id → company_cert | vat_certificate | signature
 *   any other pair           → nothing (fail closed — incoherent/legacy profile)
 *
 * SECURITY / INVARIANTS:
 *  - HARD streaming body limit: the raw request stream is read with a byte cap
 *    BEFORE multipart parsing. Actual bytes are counted — a spoofed or missing
 *    Content-Length (chunked transfer) cannot bypass the limit. The capped
 *    buffer is handed to h3's parser via the documented pre-read body fallback
 *    (`event.node.req.rawBody`) so the socket is never re-read.
 *  - MIME is magic-byte sniffed (FF D8 FF / 89 50 4E 47 / %PDF- at offset 0).
 *    The client-declared MIME and filename are NEVER trusted. SVG and all
 *    other types are rejected with 415.
 *  - kyc_documents.mime_type stores the canonical SNIFFED MIME;
 *    file_size_bytes stores the ACTUAL byte count.
 *  - Object key is opaque (`kyc/<random-uuid>.<ext>`) — never derived from the
 *    profile id, identity value, filename, or any human-readable input.
 *  - Response goes through toSafeKycDocument ONLY: no storage_path, no bucket,
 *    no public URL, no signed URL. Download is a separate future phase.
 *  - The upload event is logged to kyc_document_access_log BEST-EFFORT
 *    (action=upload, result=allowed) — a log failure never fails the upload.
 *    ip_address is a single validated IP via parseSingleForwardedIp, never a
 *    raw multi-hop x-forwarded-for chain.
 *  - This endpoint does NOT verify the profile and does NOT mutate
 *    rental_bookings. The ONLY kyc_profiles.status write is the
 *    rejected→pending resubmission flip (§a addendum item 4), recorded in the
 *    upload's audit log row via `reason` — never any other transition.
 */
import {
  createError,
  defineEventHandler,
  getHeader,
  getRouterParam,
  readMultipartFormData,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  KYC_DOCUMENT_MAX_FILE_BYTES,
  KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES,
  KYC_PROFILE_DOCUMENTS_BUCKET,
  buildKycDocumentStorageKey,
  isFutureKycDate,
  logKycDocumentAccess,
  parseKycDateOnly,
  parseSingleForwardedIp,
  readRawBodyWithHardLimit,
  sniffKycDocumentMime,
  type KycDocumentType,
} from "~~/server/utils/kyc-documents";
import {
  KYC_DOCUMENT_SAFE_SELECT,
  toSafeKycDocument,
  type KycDocumentSafeRow,
  type SafeKycDocument,
} from "~~/server/utils/kyc-document-view";

/** kyc_document_type enum values (migrations 105 + 108). */
const DOCUMENT_TYPES = new Set<KycDocumentType>([
  "id_card",
  "passport",
  "signature",
  "vat_certificate",
  "company_cert",
]);

function isKycDocumentType(value: string): value is KycDocumentType {
  return DOCUMENT_TYPES.has(value as KycDocumentType);
}

// documentType × (customer_type × identity_type) coherence. The kyc_documents
// table is the immutable evidence record — an incoherent document (e.g. a
// passport doc on a national_id-rooted profile, or company_cert on an
// individual) would poison the verify gate's evidence basis. Keyed on the same
// pairs the create-time COHERENT_IDENTITY_TYPES guard permits
// (profiles/index.post.ts: individual → national_id | passport; company →
// juristic_id), so the identity-evidence document always matches the identity
// root the profile was hashed from. `signature` is identity-type-agnostic.
// Unknown/incoherent pairs (legacy or out-of-band rows) allow NOTHING.
const COHERENT_DOCUMENT_TYPES: Record<string, ReadonlySet<KycDocumentType>> = {
  "individual:national_id": new Set<KycDocumentType>(["id_card", "signature"]),
  "individual:passport": new Set<KycDocumentType>(["passport", "signature"]),
  "company:juristic_id": new Set<KycDocumentType>([
    "company_cert",
    "vat_certificate",
    "signature",
  ]),
};

/** Read one non-file multipart text field, trimmed; undefined when absent/empty. */
function multipartTextField(
  parts: Awaited<ReturnType<typeof readMultipartFormData>>,
  name: string,
): string | undefined {
  const value = parts
    ?.find((p) => p.name === name && !p.filename)
    ?.data?.toString("utf8")
    .trim();
  return value ? value : undefined;
}

export interface KycDocumentUploadResponse {
  document: SafeKycDocument;
}

export default defineEventHandler(
  async (event): Promise<KycDocumentUploadResponse> => {
    const { adminClient, userId, platformRole } =
      await requirePlatformAdmin(event);

    const kycProfileId = getRouterParam(event, "id");
    if (!kycProfileId) {
      throw createError({ statusCode: 400, statusMessage: "id is required" });
    }

    // ── Hard body limit (authoritative) ──────────────────────────────────────
    // Fast-fail on an honestly-declared oversize Content-Length (optimization
    // only — the header is NEVER trusted to allow a request through).
    const declaredLength = getHeader(event, "content-length");
    if (typeof declaredLength === "string" && declaredLength.length > 0) {
      const declared = Number(declaredLength);
      if (
        Number.isFinite(declared) &&
        declared > KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES
      ) {
        throw createError({
          statusCode: 413,
          statusMessage: "PAYLOAD_TOO_LARGE",
        });
      }
    }
    // Authoritative cap: stream the raw body counting ACTUAL bytes. Chunked
    // transfer or a spoofed Content-Length cannot bypass this.
    const rawBody = await readRawBodyWithHardLimit(
      event.node.req,
      KYC_DOCUMENT_UPLOAD_BODY_LIMIT_BYTES,
    );
    // Hand the already-capped buffer to h3's multipart parser via its pre-read
    // body fallback so the (consumed) socket is never re-read.
    (event.node.req as typeof event.node.req & { rawBody?: Buffer }).rawBody =
      rawBody;

    // ── Parse multipart ──────────────────────────────────────────────────────
    const parts = await readMultipartFormData(event);
    const file = parts?.find((p) => p.filename && p.data && p.data.length > 0);
    if (!file?.data) {
      throw createError({ statusCode: 400, statusMessage: "file is required" });
    }

    const documentTypeRaw = multipartTextField(parts, "documentType");
    if (!documentTypeRaw || !isKycDocumentType(documentTypeRaw)) {
      throw createError({
        statusCode: 400,
        statusMessage: "INVALID_DOCUMENT_TYPE",
      });
    }
    const documentType: KycDocumentType = documentTypeRaw;

    // ── issued_at / expires_at capture (kyc_documents date columns) ─────────
    // issuedAt: optional in general, REQUIRED for company_cert (the verify
    // gate's canVerifyCompanyCert recency check needs a real issued date).
    // A provided issuedAt must never be in the future (Asia/Bangkok) for ANY
    // document type — no document can be issued tomorrow. expiresAt: optional,
    // and never earlier than issuedAt. Strict YYYY-MM-DD only; bad input → 422.
    // Capture + sanity validation only — expiry ENFORCEMENT (gating on expired
    // documents) is a later verify/gate-phase decision, not this endpoint's.
    const issuedAtRaw = multipartTextField(parts, "issuedAt");
    let issuedAt: string | null = null;
    if (issuedAtRaw !== undefined) {
      issuedAt = parseKycDateOnly(issuedAtRaw);
      if (!issuedAt) {
        throw createError({ statusCode: 422, statusMessage: "INVALID_ISSUED_AT" });
      }
      if (isFutureKycDate(issuedAt)) {
        throw createError({ statusCode: 422, statusMessage: "ISSUED_AT_IN_FUTURE" });
      }
    }
    if (documentType === "company_cert" && !issuedAt) {
      throw createError({ statusCode: 422, statusMessage: "ISSUED_AT_REQUIRED" });
    }
    const expiresAtRaw = multipartTextField(parts, "expiresAt");
    let expiresAt: string | null = null;
    if (expiresAtRaw !== undefined) {
      expiresAt = parseKycDateOnly(expiresAtRaw);
      if (!expiresAt) {
        throw createError({ statusCode: 422, statusMessage: "INVALID_EXPIRES_AT" });
      }
    }
    // ISO date-only strings compare correctly as plain strings; same-day is allowed.
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      throw createError({
        statusCode: 422,
        statusMessage: "EXPIRES_AT_BEFORE_ISSUED_AT",
      });
    }

    // ── Content validation: actual bytes + magic-byte MIME ──────────────────
    const fileBuffer = Buffer.from(file.data);
    if (fileBuffer.byteLength > KYC_DOCUMENT_MAX_FILE_BYTES) {
      throw createError({ statusCode: 413, statusMessage: "FILE_TOO_LARGE" });
    }
    const sniffedMime = sniffKycDocumentMime(fileBuffer);
    if (!sniffedMime) {
      throw createError({
        statusCode: 415,
        statusMessage: "UNSUPPORTED_FILE_TYPE",
      });
    }

    // ── Verify the target profile exists + documentType coherence ───────────
    const { data: profile, error: profileError } = await adminClient
      .from("kyc_profiles")
      .select("id, customer_type, identity_type, status")
      .eq("id", kycProfileId)
      .maybeSingle();
    if (profileError) {
      throw createError({
        statusCode: 500,
        statusMessage: profileError.message,
      });
    }
    if (!profile) {
      throw createError({
        statusCode: 404,
        statusMessage: "KYC profile not found",
      });
    }
    // Fail closed: an unknown or incoherent customer_type × identity_type pair
    // allows nothing (mirrors the create-time COHERENT_IDENTITY_TYPES guard).
    const allowedDocumentTypes =
      COHERENT_DOCUMENT_TYPES[
        `${String(profile.customer_type)}:${String(profile.identity_type)}`
      ];
    if (!allowedDocumentTypes || !allowedDocumentTypes.has(documentType)) {
      throw createError({
        statusCode: 422,
        statusMessage: "INVALID_DOCUMENT_TYPE_FOR_PROFILE",
      });
    }

    // ── Upload to the private bucket under an opaque key ────────────────────
    const storageKey = buildKycDocumentStorageKey(sniffedMime);
    const { error: uploadError } = await adminClient.storage
      .from(KYC_PROFILE_DOCUMENTS_BUCKET)
      .upload(storageKey, fileBuffer, {
        contentType: sniffedMime,
        upsert: false,
      });
    if (uploadError) {
      throw createError({
        statusCode: 500,
        statusMessage: uploadError.message ?? "Failed to upload document",
      });
    }

    // ── Insert the kyc_documents row ─────────────────────────────────────────
    const { data: inserted, error: insertError } = await adminClient
      .from("kyc_documents")
      .insert({
        kyc_profile_id: kycProfileId,
        document_type: documentType,
        storage_path: storageKey,
        mime_type: sniffedMime,
        file_size_bytes: fileBuffer.byteLength,
        issued_at: issuedAt,
        expires_at: expiresAt,
        uploaded_by_user_id: userId,
      })
      .select(KYC_DOCUMENT_SAFE_SELECT)
      .single();
    if (insertError || !inserted) {
      // Best-effort: do not leave an orphaned object behind the failed row.
      await adminClient.storage
        .from(KYC_PROFILE_DOCUMENTS_BUCKET)
        .remove([storageKey])
        .catch(() => undefined);
      throw createError({
        statusCode: 500,
        statusMessage: insertError?.message ?? "KYC document insert failed",
      });
    }
    const row = inserted as KycDocumentSafeRow;

    // ── Rejected-profile resubmission (§a addendum item 4) ───────────────────
    // A new document on a REJECTED profile flips it back to 'pending' on the
    // SAME row (once-per-user, migration 120). The transition is recorded in
    // the upload's audit log row via `reason` — never a silent state change.
    // rejected_* mirror columns stay as history (consistent with the verify
    // RPC, which clears only revoked_*). The flip is fail-closed: if it
    // errors, the upload 500s so the log never claims a transition that
    // did not happen.
    let uploadLogReason: string | null = null;
    if (profile.status === "rejected") {
      const { error: flipError } = await adminClient
        .from("kyc_profiles")
        .update({ status: "pending" })
        .eq("id", kycProfileId)
        .eq("status", "rejected");
      if (flipError) {
        throw createError({
          statusCode: 500,
          statusMessage: "KYC_RESUBMISSION_FLIP_FAILED",
        });
      }
      uploadLogReason = "resubmission_status_rejected_to_pending";
    }

    // ── Best-effort upload audit log (never fails the upload) ───────────────
    // No cast: the service-role client satisfies KycDocumentAccessLogClient
    // structurally, and the payload is typed against the generated Insert type.
    await logKycDocumentAccess(adminClient, {
      documentId: row.id,
      kycProfileId,
      actorUserId: userId,
      actorRole: platformRole,
      action: "upload",
      result: "allowed",
      reason: uploadLogReason,
      documentType,
      storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
      storagePath: storageKey,
      ipAddress:
        parseSingleForwardedIp(getHeader(event, "x-forwarded-for")) ??
        parseSingleForwardedIp(event.node.req.socket?.remoteAddress),
      userAgent: getHeader(event, "user-agent") ?? null,
    });

    return { document: toSafeKycDocument(row) };
  },
);
