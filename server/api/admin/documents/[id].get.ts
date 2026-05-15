import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  assertDocumentBranchAccess,
  loadOfficialDocument,
} from "~~/server/utils/admin-documents";

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } = await requirePlatformAdmin(event);
  const documentId = getRouterParam(event, "id");
  if (!documentId) {
    throw createError({ statusCode: 400, statusMessage: "Document id is required" });
  }
  const document = await loadOfficialDocument({ adminClient, documentId });
  await assertDocumentBranchAccess({
    adminClient,
    userId,
    platformRole,
    branchId: document.branchId,
  });
  return { document };
});
