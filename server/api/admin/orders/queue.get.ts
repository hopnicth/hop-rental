import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import { resolveSearchUserIds } from "~~/server/utils/admin-orders";
import {
  fetchAdminSaleOrderQueue,
  parseAdminSaleOrderQueueFilters,
} from "~~/server/utils/admin-order-queue";
import type { AdminSaleOrderQueueResponse } from "~~/app/types/admin-order";

export default defineEventHandler(
  async (event): Promise<AdminSaleOrderQueueResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const { filters, page, pageSize } = parseAdminSaleOrderQueueFilters(event);
    const searchUserIds = filters.search
      ? await resolveSearchUserIds(adminClient, filters.search)
      : null;

    try {
      return await fetchAdminSaleOrderQueue({
        adminClient,
        filters,
        page,
        pageSize,
        searchUserIds,
      });
    } catch (err) {
      throw createError({
        statusCode: 500,
        statusMessage:
          err instanceof Error
            ? err.message
            : "Failed to load admin sale order queue",
      });
    }
  },
);