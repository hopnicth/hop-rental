/**
 * Admin Orders detail types (P5.2).
 *
 * Shared between `/admin/orders/[id]`, `/admin/rental-bookings/[id]` pages
 * and the GET/PATCH endpoints under `/api/admin/orders/[id]` and
 * `/api/admin/rental-bookings/[id]`.
 */

import type {
  OrderAddressSnapshot,
  OrderCheckoutMode,
  OrderFulfillmentStatus,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";
import type {
  RentalDepositPaymentMethod,
  RentalDepositPaymentStatus,
  RentalDepositRefundStatus,
  RentalBookingStatus,
  RentalPricingBreakdownRow,
} from "~/types/rental-booking";
import type { RentalPaymentLine } from "~/types/rental-payment-line";
import type { ShippingBreakdown } from "~/utils/shipping";

export interface AdminCustomerProfile {
  userId: string;
  fullName: string | null;
  phone: string | null;
  kycStatus?: "pending" | "verified" | "rejected" | null;
  idCardUrl?: string | null;
}

export interface AdminSaleOrderItem {
  id: string;
  productId: string;
  skuId: string;
  name: string;
  thumbnail: string | null;
  unitPrice: number;
  originalUnitPrice: number | null;
  discountPercent: number;
  quantity: number;
  lineTotal: number;
}

export interface AdminSaleOrderDetail {
  id: string;
  orderNumber: string;
  userId: string;
  companyId: string | null;
  cartId: string | null;
  checkoutMode: OrderCheckoutMode;
  paymentMethod: OrderPaymentMethod | null;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  addressId: string | null;
  addressSnapshot: OrderAddressSnapshot;
  subtotal: number;
  discountTotal: number;
  shippingCost: number;
  shippingBreakdown: ShippingBreakdown | Record<string, never>;
  grandTotal: number;
  currencyCode: string;
  notes: string | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingNote: string | null;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: AdminSaleOrderItem[];
  customer: AdminCustomerProfile;
  alerts: AdminPaymentAlert[];
}

export type AdminPaymentAlertSeverity =
  | "info"
  | "warning"
  | "error"
  | "critical";

export interface AdminPaymentAlert {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  paymentAttemptId: string | null;
  kind: string;
  severity: AdminPaymentAlertSeverity;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface AdminPaymentAlertListResponse {
  items: AdminPaymentAlert[];
  total: number;
  unresolvedTotal: number;
}

export interface AdminRentalBookingDetail {
  id: string;
  userId: string;
  walkInPhone: string | null;
  status: RentalBookingStatus;
  assetId: string | null;
  assetCode: string | null;
  assetName: string | null;
  assetThumbnail: string | null;
  productId: string | null;
  skuId: string | null;
  productName: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  thumbnail: string | null;
  hubId: string | null;
  hubName: string | null;
  startDate: string;
  endDate: string;
  rentalDays: number;
  pricingModel: "daily";
  currencyCode: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  rentalTotal: number;
  depositAmount: number;
  depositPaidAmount: number;
  depositPaymentMethod: RentalDepositPaymentMethod | null;
  depositPaymentStatus: RentalDepositPaymentStatus;
  depositRefundStatus: RentalDepositRefundStatus;
  depositRefundAmount: number;
  depositRefundNotes: string | null;
  noShowAt: string | null;
  noShowMarkedByUserId: string | null;
  noShowReason: string | null;
  noShowSourceEventId: string | null;
  pricingBreakdown: RentalPricingBreakdownRow | Record<string, never>;
  rentalPaymentLines: RentalPaymentLine[];
  storageBranchId: string | null;
  storageBranchName: string | null;
  bookerName: string | null;
  bookerPhone: string | null;
  createdAt: string;
  updatedAt: string;
  customer: AdminCustomerProfile;
}

/** Allowed PATCH payload for sale orders. Each field is optional; sender supplies only what changed. */
export interface AdminSaleOrderPatchPayload {
  status?: OrderStatus;
  paymentStatus?: OrderPaymentStatus;
  fulfillmentStatus?: OrderFulfillmentStatus;
  notes?: string | null;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
  trackingNote?: string | null;
}

/** Allowed PATCH payload for rental bookings. */
export interface AdminRentalBookingPatchPayload {
  status?: RentalBookingStatus;
}
