/**
 * GET /api/admin/kyc/documents/:id/download
 *
 * super_admin-only SERVER-PROXY download of one KYC document. Streams the
 * object bytes from the private `kyc-profile-documents` bucket through the
 * server — no signed URL, no public/durable URL, ever. Locked spec:
 * docs/kyc-phase-2-download-spec.md (decisions.md 2026-06-05 Decisions B/D/E/F/G).
 *
 * Auth:    requirePlatformAdmin first, then an EXPLICIT super_admin role check
 *          so the denied audit log can be written between the role check and
 *          the throw. Deliberately NOT the dedicated super-admin guard helper
 *          (it would throw before the denial could be logged).
 * Returns: raw document bytes (attachment) — never JSON, never a row.
 * Errors:  401 | 403 | 400 | 404 | 500
 *
 * SECURITY / INVARIANTS (strict operation order — spec §2.1):
 *  - NO ORACLE: a non-super_admin gets a byte-identical 403 for existent,
 *    nonexistent, and malformed ids — kyc_documents is NEVER queried and
 *    Storage is NEVER touched on that path. Only super_admin can observe
 *    400/404/500.
 *  - AUDIT-LOG PURITY (Decision G): the route id is classified with
 *    asUuidOrNull BEFORE any log payload is built. A malformed id logs
 *    document_id = null + a `*_malformed_*` reason; the raw attacker-
 *    controlled string is never written anywhere in the immutable log.
 *  - Denied logs are BEST-EFFORT (a downed log table never escalates the
 *    uniform 403/400/404/500). The allowed log is FAIL-CLOSED and written
 *    BEFORE the storage fetch: log failure → 500 with zero bytes delivered.
 *    `allowed` means access granted + delivery attempted / stream initiated —
 *    NOT proof of full browser consumption (Decision E).
 *  - Storage fetch failure AFTER the allowed row writes a best-effort
 *    correction row (result=denied, reason=storage_download_failed).
 *  - The stored path must pass isSafeKycDocumentStoragePath (fail closed);
 *    an unsafe path is 500, is never fetched, and is never logged (it may be
 *    PII-bearing — storage_path is null on that denial row).
 *  - Response headers: Cache-Control no-store, X-Content-Type-Options
 *    nosniff, Content-Disposition attachment with the OPAQUE filename
 *    `kyc-<documentId>.<ext>`; Content-Type only from the stored sniffed MIME
 *    validated against the allowlist. Content-Length is deliberately OMITTED
 *    (Decision D impact 1 — metadata/object drift must not become a protocol
 *    failure). storage_path / bucket / internal metadata never reach the
 *    client in any header or body.
 */
import {
  createError,
  defineEventHandler,
  getHeader,
  getRouterParam,
  setHeader,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  KYC_PROFILE_DOCUMENTS_BUCKET,
  asUuidOrNull,
  isSafeKycDocumentStoragePath,
  kycDocumentExtensionForMime,
  logKycDocumentAccess,
  parseSingleForwardedIp,
  type KycDocumentType,
} from "~~/server/utils/kyc-documents";
import {
  KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT,
  type KycDocumentDownloadRow,
} from "~~/server/utils/kyc-document-view";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);

  // Classify the attacker-controlled route id BEFORE building any log payload
  // (Decision G): a raw non-UUID string must never reach the uuid-typed
  // document_id column or any other log field.
  const documentId = asUuidOrNull(getRouterParam(event, "id"));

  const ipAddress =
    parseSingleForwardedIp(getHeader(event, "x-forwarded-for")) ??
    parseSingleForwardedIp(event.node.req.socket?.remoteAddress);
  const userAgent = getHeader(event, "user-agent") ?? null;
  const actor = {
    actorUserId: userId,
    actorRole: platformRole,
    ipAddress,
    userAgent,
  };

  // ── Uniform deny for every non-super_admin (NO oracle) ────────────────────
  // Runs before any id validation, any kyc_documents query, and any storage
  // access. Best-effort log, then a 403 that is byte-identical for ALL inputs.
  if (platformRole !== "super_admin") {
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId,
      action: "download",
      result: "denied",
      reason: documentId ? "not_super_admin" : "not_super_admin_malformed_id",
    });
    throw createError({
      statusCode: 403,
      statusMessage: "Super admin access required",
    });
  }

  // ── super_admin only beyond this point ─────────────────────────────────────
  if (!documentId) {
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId: null,
      action: "download",
      result: "denied",
      reason: "malformed_document_id",
    });
    throw createError({
      statusCode: 400,
      statusMessage: "INVALID_DOCUMENT_ID",
    });
  }

  const { data, error } = await adminClient
    .from("kyc_documents")
    .select(KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT)
    .eq("id", documentId)
    .maybeSingle();
  if (error) {
    // Opaque to the client — raw DB error text can leak internals. The real
    // message goes to the server log only.
    console.error(
      "[kyc] kyc_documents read failed during download",
      error.message,
    );
    // Best-effort denial row (NOT fail-closed — an infrastructure read
    // failure must not depend on the log table being up). No storage path:
    // the row was never loaded. No allowed row is ever written on this path.
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId,
      action: "download",
      result: "denied",
      reason: "read_failed",
    });
    throw createError({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_READ_FAILED",
    });
  }
  if (!data) {
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId,
      action: "download",
      result: "denied",
      reason: "not_found",
    });
    throw createError({
      statusCode: 404,
      statusMessage: "KYC document not found",
    });
  }
  const doc = data as KycDocumentDownloadRow;
  // Column is the kyc_document_type enum; the internal row shape is string-typed.
  const documentType = doc.document_type as KycDocumentType;

  // ── Fail-closed stored-path validation (never fetch, never log the path) ──
  if (!isSafeKycDocumentStoragePath(doc.storage_path)) {
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId,
      kycProfileId: doc.kyc_profile_id,
      action: "download",
      result: "denied",
      reason: "unsafe_path",
      documentType,
      storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
      storagePath: null, // an unsafe path may be PII-bearing — never log it
    });
    throw createError({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_UNSAFE_PATH",
    });
  }
  const storagePath = doc.storage_path as string;

  // ── MIME allowlist (integrity gate — upload sniffs magic bytes) ───────────
  const extension = kycDocumentExtensionForMime(doc.mime_type);
  if (!extension) {
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId,
      kycProfileId: doc.kyc_profile_id,
      action: "download",
      result: "denied",
      reason: "invalid_mime",
      documentType,
      storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
      storagePath,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_INVALID_MIME",
    });
  }

  // ── FAIL-CLOSED allowed log — BEFORE the storage fetch (Decision E) ───────
  // `allowed` = access granted + delivery attempted / stream initiated. If
  // this write fails, logKycDocumentAccess throws 500 and zero bytes leave
  // the server.
  await logKycDocumentAccess(
    adminClient,
    {
      ...actor,
      documentId,
      kycProfileId: doc.kyc_profile_id,
      action: "download",
      result: "allowed",
      reason: null,
      documentType,
      storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
      storagePath,
    },
    { failClosed: true },
  );

  // ── Server-side fetch via service role; stream bytes back ─────────────────
  const { data: blob, error: downloadError } = await adminClient.storage
    .from(KYC_PROFILE_DOCUMENTS_BUCKET)
    .download(storagePath);
  if (downloadError || !blob) {
    // Best-effort correction row so the trail distinguishes "granted +
    // delivered" from "granted but errored". Its own failure must not mask
    // the 500 (logKycDocumentAccess never throws in best-effort mode).
    await logKycDocumentAccess(adminClient, {
      ...actor,
      documentId,
      kycProfileId: doc.kyc_profile_id,
      action: "download",
      result: "denied",
      reason: "storage_download_failed",
      documentType,
      storageBucket: KYC_PROFILE_DOCUMENTS_BUCKET,
      storagePath,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "KYC_DOCUMENT_DOWNLOAD_FAILED",
    });
  }

  setHeader(event, "Cache-Control", "no-store");
  setHeader(event, "Content-Type", doc.mime_type as string);
  setHeader(event, "X-Content-Type-Options", "nosniff");
  // Opaque filename — never the storage path, never customer-derived input.
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="kyc-${documentId}.${extension}"`,
  );
  // Content-Length deliberately omitted (Decision D impact 1).
  return blob.stream();
});
