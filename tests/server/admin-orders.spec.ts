import { describe, expect, it } from "vitest";
import {
  countAdminActionRequiredItems,
  filterAdminActionRequiredRows,
  isAdminRentalBookingActionRequired,
  isAdminSaleOrderActionRequired,
} from "../../server/utils/admin-orders";
import type {
  AdminRentalBookingRow,
  AdminSaleOrderRow,
} from "../../app/types/admin-order";

function saleOrder(
  patch: Partial<AdminSaleOrderRow>,
): AdminSaleOrderRow {
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
    expect(isAdminSaleOrderActionRequired(saleOrder({ status: "cancelled" }))).toBe(false);
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
      saleOrder({ id: "sale-paid-ready", fulfillmentStatus: "ready_for_carrier_pickup" }),
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