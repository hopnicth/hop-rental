import { defineEventHandler, getQuery } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { listAdminRefunds } from "~~/server/utils/admin-refunds";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  const query = getQuery(event);
  return listAdminRefunds(adminClient, {
    status: query.status,
    limit: query.limit,
  });
});