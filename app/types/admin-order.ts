/**
 * Admin Orders Dashboard types.
 *
 * Shared between `useAdminOrders` composable, `/admin/orders` page,
 * and the server endpoints under `/api/admin/orders/*` and
 * `/api/admin/rental-bookings/*`.
 *
 * P5.1 list scope only — detail/transition shapes live elsewhere.
 */

import type {
  OrderCheckoutMode,
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";
import type { RentalBookingStatus } from "~/types/rental-booking";

export type AdminOrderType = "sale" | "rental";

export interface AdminCustomerSummary {
  userId: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  saleCount: number;
  rentalCount: number;
  latestActivityAt: string;
  totalSaleAmount: number;
  totalRentalAmount: number;
  currencyCode: string;
}

export interface AdminSaleOrderRow {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  checkoutMode: OrderCheckoutMode;
  paymentMethod: OrderPaymentMethod | null;
  grandTotal: number;
  currencyCode: string;
  itemCount: number;
  addressTitle: string | null;
  createdAt: string;
}

export interface AdminRentalBookingRow {
  id: string;
  userId: string;
  status: RentalBookingStatus;
  assetName: string | null;
  productName: string;
  thumbnail: string | null;
  startDate: string;
  endDate: string;
  rentalDays: number;
  rentalTotal: number;
  depositAmount: number;
  currencyCode: string;
  storageBranchId: string | null;
  storageBranchName: string | null;
  hubName: string | null;
  bookerName: string | null;
  bookerPhone: string | null;
  createdAt: string;
}

export interface AdminCustomerCard {
  customer: AdminCustomerSummary;
  saleOrders: AdminSaleOrderRow[];
  rentalBookings: AdminRentalBookingRow[];
}

export interface AdminOrderFilterParams {
  search?: string;
  type?: "all" | "sale" | "rental";
  orderStatus?: OrderStatus[];
  paymentStatus?: OrderPaymentStatus[];
  fulfillmentStatus?: OrderFulfillmentStatus[];
  rentalStatus?: RentalBookingStatus[];
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
}

export interface AdminCustomerListResponse {
  items: AdminCustomerCard[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminFlatSaleListResponse {
  items: AdminSaleOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminFlatRentalListResponse {
  items: AdminRentalBookingRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
