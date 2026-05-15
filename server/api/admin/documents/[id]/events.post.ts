import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  assertDocumentBranchAccess,
  loadOfficialDocument,
  recordDocumentPrintEvent,
} from "~~/server/utils/admin-documents";
import type { AdminDocumentEventType } from "~~/app/types/admin-documents";

interface EventBody {
  eventType?: AdminDocumentEventType;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const documentId = getRouterParam(event, "id");
  if (!documentId) {
    throw createError({ statusCode: 400, statusMessage: "Document id is required" });
  }
  const body = (await readBody<EventBody>(event)) ?? {};
  if (body.eventType !== "printed" && body.eventType !== "reprinted") {
    throw createError({ statusCode: 400, statusMessage: "eventType must be printed or reprinted" });
  }
  const document = await loadOfficialDocument({ adminClient, documentId });
  await assertDocumentBranchAccess({
    adminClient,
    userId,
    platformRole,
    branchId: document.branchId,
  });
  const updated = await recordDocumentPrintEvent({
    adminClient,
    document,
    eventType: body.eventType,
    staffUserId: userId,
    reason: body.reason,
    metadata: body.metadata,
  });
  return { document: updated };
});
