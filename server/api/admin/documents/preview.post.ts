import { defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { previewOperationalRentalDocument } from "~~/server/utils/admin-rental-operational-documents";

interface PreviewBody {
  sourceType?: unknown;
  sourceId?: unknown;
  documentType?: unknown;
}

export default defineEventHandler(async (event) => {
  const { adminClient, userId, platformRole } =
    await requirePlatformAdmin(event);
  const body = (await readBody<PreviewBody>(event)) ?? {};
  return await previewOperationalRentalDocument({
    adminClient,
    userId,
    platformRole,
    sourceType: body.sourceType,
    sourceId: body.sourceId,
    documentType: body.documentType,
  });
});
