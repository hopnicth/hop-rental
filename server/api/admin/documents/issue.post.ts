import { defineEventHandler, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { issueOperationalRentalDocument } from "~~/server/utils/admin-rental-operational-documents";
import type { AdminDocumentIssueResponse } from "~~/app/types/admin-documents";

interface IssueBody {
  sourceType?: unknown;
  sourceId?: unknown;
  documentType?: unknown;
  issueNote?: string | null;
}

export default defineEventHandler(
  async (event): Promise<AdminDocumentIssueResponse> => {
    const { adminClient, userId, platformRole } =
      await requirePlatformAdmin(event);
    const body = (await readBody<IssueBody>(event)) ?? {};
    const result = await issueOperationalRentalDocument({
      adminClient,
      userId,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      documentType: body.documentType,
      issueNote: body.issueNote,
      platformRole,
    });
    return {
      ...result,
      printUrl: `/admin/documents/${result.document.id}/print`,
    };
  },
);
