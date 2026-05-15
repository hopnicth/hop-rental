import type {
  OrderFulfillmentStatus,
  OrderPaymentStatus,
  OrderStatus,
} from "~/types/order";
import type { RentalBookingStatus } from "~/types/rental-booking";

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  submitted: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const ORDER_PAYMENT_STATUS_TRANSITIONS: Record<
  OrderPaymentStatus,
  OrderPaymentStatus[]
> = {
  not_applicable: [],
  pending_review: ["paid", "awaiting_payment", "cancelled", "refunded"],
  awaiting_payment: ["paid", "pending_review", "cancelled"],
  paid: ["refunded", "cancelled"],
  deferred: ["paid", "cancelled"],
  refunded: [],
  cancelled: [],
};

export const ORDER_FULFILLMENT_STATUS_TRANSITIONS: Record<
  OrderFulfillmentStatus,
  OrderFulfillmentStatus[]
> = {
  not_applicable: [],
  unfulfilled: ["preparing", "cancelled"],
  preparing: ["ready_for_carrier_pickup", "unfulfilled", "cancelled"],
  ready_for_carrier_pickup: ["shipped", "preparing", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export const RENTAL_BOOKING_STATUS_TRANSITIONS: Record<
  RentalBookingStatus,
  RentalBookingStatus[]
> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["picked_up", "cancelled"],
  picked_up: ["returned"],
  returned: [],
  cancelled: [],
  no_show: [],
};
