import { createError, defineEventHandler, getRouterParam } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { getAdminRefundDetail } from "~~/server/utils/admin-refunds";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const refundId = getRouterParam(event, "id");
  if (!refundId) throw createError({ statusCode: 400, statusMessage: "Refund id is required" });
  return getAdminRefundDetail(adminClient, refundId);
});