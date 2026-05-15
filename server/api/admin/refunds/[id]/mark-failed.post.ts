import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { transitionAdminRefund } from "~~/server/utils/admin-refunds";

export default defineEventHandler(async (event) => {
  const { adminClient, userId } = await requirePlatformAdmin(event);
  const refundId = getRouterParam(event, "id");
  if (!refundId) throw createError({ statusCode: 400, statusMessage: "Refund id is required" });
  const body = (await readBody<{ adminNote?: string }>(event)) ?? {};
  return transitionAdminRefund({ client: adminClient, refundId, adminUserId: userId, action: "mark-failed", adminNote: body.adminNote });
});