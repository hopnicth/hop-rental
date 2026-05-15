export const RENTAL_CANCELLATION_TIME_ZONE = "Asia/Bangkok";
export const BOOKING_DEPOSIT_REFUND_POLICY_VERSION =
  "booking_deposit_refund_calendar_day_v1";
export const EXCESSIVE_CANCELLATION_WINDOW_MONTHS = 12;
export const EXCESSIVE_CANCELLATION_ALLOWED_COUNT = 5;
export const EXCESSIVE_CANCELLATION_RESTRICTION_REASON =
  "excessive_customer_rental_cancellations";
export const RENTAL_BOOKING_RESTRICTION_MESSAGE_TH =
  "บัญชีของคุณถูกจำกัดการจองเช่าชั่วคราว เนื่องจากมีประวัติการยกเลิกการจองเกินเกณฑ์ที่กำหนด กรุณาติดต่อ HOPNIC เพื่อให้เจ้าหน้าที่ตรวจสอบและดำเนินการต่อ";

export type LocalDateString = `${number}-${number}-${number}`;

export type BookingDepositRefundEligibility = {
  eligible: boolean;
  timeZone: typeof RENTAL_CANCELLATION_TIME_ZONE;
  policyVersion: typeof BOOKING_DEPOSIT_REFUND_POLICY_VERSION;
  pickupLocalDate: string;
  cancellationLocalDate: string;
  refundCutoffLocalDate: string;
};

export type CancellationEventLike = {
  id?: string;
  user_id?: string | null;
  userId?: string | null;
  cancelled_at?: string | Date | null;
  cancelledAt?: string | Date | null;
  cancellation_initiator?: string | null;
  cancellationInitiator?: string | null;
  cancellation_source?: string | null;
  cancellationSource?: string | null;
  previous_status?: string | null;
  previousStatus?: string | null;
  previous_booking_deposit_payment_status?: string | null;
  previousBookingDepositPaymentStatus?: string | null;
  qualifies_for_restriction?: boolean | null;
  qualifiesForRestriction?: boolean | null;
};

const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RENTAL_CANCELLATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function assertIsoLocalDate(value: string): string {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    throw new Error(`Invalid local date: ${value}`);
  }
  return value;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toBangkokLocalDate(input: string | Date): string {
  if (typeof input === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input)) {
    return input;
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid date: ${String(input)}`);
  const parts = bangkokFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return assertIsoLocalDate(`${year}-${month}-${day}`);
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = assertIsoLocalDate(localDate)
    .split("-")
    .map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

export function evaluateBookingDepositRefundEligibility(input: {
  pickupDate: string | Date;
  cancellationAt?: string | Date;
}): BookingDepositRefundEligibility {
  const pickupLocalDate = toBangkokLocalDate(input.pickupDate);
  const cancellationLocalDate = toBangkokLocalDate(
    input.cancellationAt ?? new Date(),
  );
  const refundCutoffLocalDate = addDaysToLocalDate(pickupLocalDate, -3);
  return {
    eligible: cancellationLocalDate <= refundCutoffLocalDate,
    timeZone: RENTAL_CANCELLATION_TIME_ZONE,
    policyVersion: BOOKING_DEPOSIT_REFUND_POLICY_VERSION,
    pickupLocalDate,
    cancellationLocalDate,
    refundCutoffLocalDate,
  };
}

function eventValue(
  event: CancellationEventLike,
  snake: keyof CancellationEventLike,
  camel: keyof CancellationEventLike,
): unknown {
  return event[snake] ?? event[camel] ?? null;
}

function parseEventDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isQualifyingCustomerCancellation(
  event: CancellationEventLike,
): boolean {
  const explicit =
    event.qualifies_for_restriction ?? event.qualifiesForRestriction;
  if (explicit === true) return true;
  if (explicit === false) return false;
  return (
    eventValue(event, "cancellation_initiator", "cancellationInitiator") ===
      "customer" &&
    eventValue(event, "cancellation_source", "cancellationSource") ===
      "customer_web" &&
    eventValue(event, "previous_status", "previousStatus") === "confirmed" &&
    eventValue(
      event,
      "previous_booking_deposit_payment_status",
      "previousBookingDepositPaymentStatus",
    ) === "paid"
  );
}

export function rollingCancellationWindowStart(asOf: string | Date): Date {
  const date = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Invalid date: ${String(asOf)}`);
  date.setUTCMonth(date.getUTCMonth() - EXCESSIVE_CANCELLATION_WINDOW_MONTHS);
  return date;
}

export function countQualifyingCustomerCancellations(input: {
  events: CancellationEventLike[];
  asOf: string | Date;
  userId?: string;
}): { count: number; windowStartedAt: string } {
  const asOf = input.asOf instanceof Date ? input.asOf : new Date(input.asOf);
  if (Number.isNaN(asOf.getTime()))
    throw new Error(`Invalid date: ${String(input.asOf)}`);
  const windowStart = rollingCancellationWindowStart(asOf);
  const count = input.events.filter((event) => {
    const eventUserId = eventValue(event, "user_id", "userId");
    if (input.userId && eventUserId !== input.userId) return false;
    if (!isQualifyingCustomerCancellation(event)) return false;
    const atRaw = eventValue(event, "cancelled_at", "cancelledAt");
    if (!atRaw) return false;
    const at = parseEventDate(atRaw);
    return !!at && at >= windowStart && at <= asOf;
  }).length;
  return { count, windowStartedAt: windowStart.toISOString() };
}

export function shouldRestrictForExcessiveCancellations(
  count: number,
): boolean {
  return count > EXCESSIVE_CANCELLATION_ALLOWED_COUNT;
}
