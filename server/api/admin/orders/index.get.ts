import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  fetchAdminSaleOrders,
  parseAdminOrderFilters,
  resolveSearchUserIds,
} from "~~/server/utils/admin-orders";
import type { AdminFlatSaleListResponse } from "~~/app/types/admin-order";

export default defineEventHandler(
  async (event): Promise<AdminFlatSaleListResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const { filters, page, pageSize } = parseAdminOrderFilters(event);

    const searchUserIds = filters.search
      ? await resolveSearchUserIds(adminClient, filters.search)
      : null;

    try {
      const all = await fetchAdminSaleOrders(
        adminClient,
        filters,
        searchUserIds,
      );

      const total = all.length;
      const start = page * pageSize;
      const end = start + pageSize;

      return {
        items: all.slice(start, end),
        total,
        page,
        pageSize,
        hasMore: end < total,
      };
    } catch (err) {
      throw createError({
        statusCode: 500,
        statusMessage:
          err instanceof Error ? err.message : "Failed to load admin orders",
      });
    }
  },
);
