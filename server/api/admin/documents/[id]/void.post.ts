/**
 * POST /api/admin/documents/:id/void
 *
 * Voids an issued/printed official document (§B: edits never — void +
 * reissue). §F inversion: requirePlatformAdmin here; the explicit
 * super_admin check in the util so staff denials are LOGGED
 * (operation='document_void') before the 403 — deliberately NOT the
 * super-admin-only guard helper. Body { reason, reissue?: boolean } —
 * reissue=true immediately issues the replacement under a fresh number and
 * flips the original voided → replaced.
 *
 * Errors: 403 | 404 | 409 | 422 | 500
 */
import {
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  readBody,
} from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  reissueOfficialDocument,
  voidOfficialDocument,
} from "~~/server/utils/admin-document-void";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const body = (await readBody<{ reason?: string; reissue?: boolean }>(event)) ?? {};
  const documentId = getRouterParam(event, "id");
  const voided = await voidOfficialDocument({
    client: adminClient,
    rawDocumentId: documentId,
    actorUserId: userId,
    actorRole: platformRole,
    reason: body.reason,
    ipAddress: getRequestIP(event, { xForwardedFor: true }) ?? null,
    userAgent: getHeader(event, "user-agent") ?? null,
  });
  if (body.reissue === true) {
    const reissued = await reissueOfficialDocument({
      client: adminClient,
      rawOriginalDocumentId: documentId,
      actorUserId: userId,
    });
    return { ...voided, reissue: reissued };
  }
  return voided;
});
