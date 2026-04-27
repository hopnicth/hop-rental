import { createError, defineEventHandler } from "h3";
import { requirePlatformAdmin } from "~~/server/utils/admin";
import {
  fetchAdminEmailMap,
  fetchAdminRentalBookings,
  fetchAdminSaleOrders,
  fetchAdminUserProfiles,
  groupCustomerCards,
  parseAdminOrderFilters,
  resolveSearchUserIds,
} from "~~/server/utils/admin-orders";
import type { AdminCustomerListResponse } from "~~/app/types/admin-order";

export default defineEventHandler(
  async (event): Promise<AdminCustomerListResponse> => {
    const { adminClient } = await requirePlatformAdmin(event);
    const { filters, page, pageSize } = parseAdminOrderFilters(event);

    const searchUserIds = filters.search
      ? await resolveSearchUserIds(adminClient, filters.search)
      : null;

    try {
      const includeSale = filters.type !== "rental";
      const includeRental = filters.type !== "sale";

      const [saleOrders, rentalBookings] = await Promise.all([
        includeSale
          ? fetchAdminSaleOrders(adminClient, filters, searchUserIds)
          : Promise.resolve([]),
        includeRental
          ? fetchAdminRentalBookings(adminClient, filters, searchUserIds)
          : Promise.resolve([]),
      ]);

      const userIds = Array.from(
        new Set([
          ...saleOrders.map((o) => o.userId),
          ...rentalBookings.map((b) => b.userId),
        ]),
      );

      const [profiles, emails] = await Promise.all([
        fetchAdminUserProfiles(adminClient, userIds),
        fetchAdminEmailMap(adminClient),
      ]);

      const allCards = groupCustomerCards(
        saleOrders,
        rentalBookings,
        profiles,
        emails,
      );

      const total = allCards.length;
      const start = page * pageSize;
      const end = start + pageSize;
      const items = allCards.slice(start, end);

      return {
        items,
        total,
        page,
        pageSize,
        hasMore: end < total,
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to load admin customer orders";
      console.error("[admin/orders/customers] failed:", err);
      throw createError({ statusCode: 500, statusMessage: message });
    }
  },
);
