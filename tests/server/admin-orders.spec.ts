import { describe, expect, it } from "vitest";
import {
  countAdminActionRequiredItems,
  fetchAdminRentalBookings,
  filterAdminActionRequiredRows,
  isAdminRentalBookingActionRequired,
  isAdminSaleOrderActionRequired,
} from "../../server/utils/admin-orders";
import type {
  AdminRentalBookingRow,
  AdminSaleOrderRow,
} from "../../app/types/admin-order";

function saleOrder(patch: Partial<AdminSaleOrderRow>): AdminSaleOrderRow {
  return {
    id: patch.id ?? crypto.randomUUID(),
    orderNumber: patch.orderNumber ?? "HOP-0001",
    userId: patch.userId ?? "user-1",
    status: patch.status ?? "confirmed",
    paymentStatus: patch.paymentStatus ?? "paid",
    fulfillmentStatus: patch.fulfillmentStatus ?? "unfulfilled",
    checkoutMode: patch.checkoutMode ?? "payment",
    paymentMethod: patch.paymentMethod ?? "promptpay",
    grandTotal: patch.grandTotal ?? 100,
    currencyCode: patch.currencyCode ?? "THB",
    itemCount: patch.itemCount ?? 1,
    addressTitle: patch.addressTitle ?? null,
    createdAt: patch.createdAt ?? "2026-04-29T00:00:00.000Z",
  };
}

function rentalBooking(
  patch: Partial<AdminRentalBookingRow>,
): AdminRentalBookingRow {
  return {
    id: patch.id ?? crypto.randomUUID(),
    userId: patch.userId ?? "user-1",
    status: patch.status ?? "confirmed",
    assetName: patch.assetName ?? "Camera A",
    productName: patch.productName ?? "Camera",
    thumbnail: patch.thumbnail ?? null,
    startDate: patch.startDate ?? "2026-04-29",
    endDate: patch.endDate ?? "2026-04-30",
    rentalDays: patch.rentalDays ?? 1,
    rentalTotal: patch.rentalTotal ?? 100,
    depositAmount: patch.depositAmount ?? 0,
    currencyCode: patch.currencyCode ?? "THB",
    storageBranchId: patch.storageBranchId ?? null,
    storageBranchName: patch.storageBranchName ?? null,
    hubName: patch.hubName ?? null,
    bookerName: patch.bookerName ?? null,
    bookerPhone: patch.bookerPhone ?? null,
    createdAt: patch.createdAt ?? "2026-04-29T00:00:00.000Z",
  };
}

describe("admin order action-required queue", () => {
  it("marks paid sale orders with open fulfillment as action required", () => {
    expect(isAdminSaleOrderActionRequired(saleOrder({}))).toBe(true);
    expect(
      isAdminSaleOrderActionRequired(
        saleOrder({ fulfillmentStatus: "preparing" }),
      ),
    ).toBe(true);
    expect(
      isAdminSaleOrderActionRequired(
        saleOrder({ paymentStatus: "awaiting_payment" }),
      ),
    ).toBe(false);
    expect(
      isAdminSaleOrderActionRequired(
        saleOrder({ fulfillmentStatus: "ready_for_carrier_pickup" }),
      ),
    ).toBe(false);
    expect(
      isAdminSaleOrderActionRequired(saleOrder({ status: "cancelled" })),
    ).toBe(false);
  });

  it("marks confirmed rental bookings as action required", () => {
    expect(isAdminRentalBookingActionRequired(rentalBooking({}))).toBe(true);
    expect(
      isAdminRentalBookingActionRequired(rentalBooking({ status: "draft" })),
    ).toBe(false);
  });

  it("counts and filters only action-required sale orders and rentals", () => {
    const saleOrders = [
      saleOrder({ id: "sale-prepare" }),
      saleOrder({
        id: "sale-paid-ready",
        fulfillmentStatus: "ready_for_carrier_pickup",
      }),
    ];
    const rentalBookings = [
      rentalBooking({ id: "rental-confirmed" }),
      rentalBooking({ id: "rental-cancelled", status: "cancelled" }),
    ];

    expect(countAdminActionRequiredItems(saleOrders, rentalBookings)).toBe(2);
    expect(filterAdminActionRequiredRows(saleOrders, rentalBookings)).toEqual({
      saleOrders: [saleOrders[0]],
      rentalBookings: [rentalBookings[0]],
    });
  });
});

describe("admin rental booking list fetch", () => {
  it("retries without walk_in_phone when the deployed DB has not run migration 057", async () => {
    const selects: string[] = [];
    const missingColumn = {
      data: null,
      error: {
        code: "42703",
        message: "column rental_bookings.walk_in_phone does not exist",
      },
    };
    const legacyRow = {
      id: "booking-1",
      user_id: "user-1",
      status: "confirmed",
      product_name: "Camera",
      start_date: "2026-05-01",
      end_date: "2026-05-02",
      rental_days: 1,
      rental_total: 100,
      deposit_amount: 0,
      deposit_paid_amount: 0,
      deposit_payment_status: "unpaid",
      deposit_refund_status: "not_refunded",
      currency_code: "THB",
      created_at: "2026-05-01T00:00:00.000Z",
    };
    const results = [missingColumn, { data: [legacyRow], error: null }];

    const client = {
      from: () => ({
        select: (select: string) => {
          selects.push(select);
          const result = results[selects.length - 1];
          const query = {
            order: () => query,
            limit: () => query,
            in: () => query,
            gte: () => query,
            lte: () => query,
            or: () => query,
            then: (resolve: (value: typeof result) => unknown) =>
              Promise.resolve(result).then(resolve),
          };
          return query;
        },
      }),
    };

    const rows = await fetchAdminRentalBookings(client, {}, null);

    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain("walk_in_phone");
    expect(selects[1]).not.toContain("walk_in_phone");
    expect(rows).toHaveLength(1);
    expect(rows[0].walkInPhone).toBeNull();
  });
});
