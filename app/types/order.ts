import type { Address } from "~/types/user";

export type OrderCheckoutMode = "payment" | "quotation";
export type OrderPaymentMethod = "credit_card" | "promptpay" | "company_credit";
export type OrderStatus = "submitted" | "confirmed" | "completed" | "cancelled";
export type OrderPaymentStatus =
  | "not_applicable"
  | "pending_review"
  | "awaiting_payment"
  | "paid"
  | "deferred"
  | "cancelled"
  | "refunded";
export type OrderFulfillmentStatus =
  | "not_applicable"
  | "unfulfilled"
  | "preparing"
  | "ready_for_carrier_pickup"
  | "shipped"
  | "delivered"
  | "returned"
  | "cancelled";

export interface OrderAddressSnapshot {
  title: string;
  contactName: string | null;
  contactPhone: string | null;
  fullAddress: string;
  subDistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  note: string | null;
}

export interface OrderRecord {
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
  grandTotal: number;
  currencyCode: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderParams {
  checkoutMode: OrderCheckoutMode;
  paymentMethod?: OrderPaymentMethod;
  address: Address;
  items: Array<{
    productId: string;
    skuId: string;
    name: string;
    thumbnail: string;
    unitPrice: number;
    originalUnitPrice: number;
    discountPercent: number;
    quantity: number;
  }>;
  cartId?: string | null;
  companyId?: string | null;
  notes?: string | null;
}
