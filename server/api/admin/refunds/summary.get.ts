import { defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { getAdminRefundSummary } from "~~/server/utils/admin-refunds";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  return getAdminRefundSummary(adminClient);
});
