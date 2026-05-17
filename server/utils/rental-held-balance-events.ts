import { createError } from "h3";
import { normalizeCurrency } from "~~/server/utils/payment-core";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

export const RENTAL_HELD_BALANCE_EVENT_SELECT =
  "id, rental_booking_id, event_type, amount, currency_code, status, occurred_at, source_type, source_id, payment_method, branch_id, staff_user_id, idempotency_key, metadata, created_at";

export const BOOKING_DEPOSIT_COLLECTION_EVENT =
  "booking_deposit_collection";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

function isUniqueViolation(error: { code?: string | null } | null): boolean {
  return error?.code === "23505";
}

function assertValidEventIdentity(input: {
  rentalBookingId: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
}) {
  if (
    !input.rentalBookingId ||
    !input.eventType ||
    !input.sourceType ||
    !input.sourceId
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: "RENTAL_HELD_BALANCE_EVENT_SOURCE_REQUIRED",
    });
  }
}

function assertExistingEventMatches(
  existing: AnyRecord | null,
  expected: {
    rentalBookingId: string;
    eventType: string;
    amount: number;
    currencyCode: string;
    sourceType: string;
    sourceId: string;
  },
) {
  const matches =
    existing &&
    text(existing.rental_booking_id) === expected.rentalBookingId &&
    text(existing.event_type) === expected.eventType &&
    text(existing.source_type) === expected.sourceType &&
    text(existing.source_id) === expected.sourceId &&
    text(existing.status) === "posted" &&
    normalizeCurrency(existing.currency_code) === expected.currencyCode &&
    Math.abs(money(existing.amount) - expected.amount) <= 0.01;
  if (!matches) {
    throw createError({
      statusCode: 409,
      statusMessage: "RENTAL_HELD_BALANCE_EVENT_CONFLICT",
    });
  }
}

export async function findExistingRentalHeldBalanceEvent(input: {
  client: AnyClient;
  sourceType: string;
  sourceId: string;
  eventType: string;
}): Promise<AnyRecord | null> {
  const { data, error } = await input.client
    .from("rental_held_balance_events")
    .select(RENTAL_HELD_BALANCE_EVENT_SELECT)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("event_type", input.eventType)
    .maybeSingle();
  if (error) throw createError({ statusCode: 500, statusMessage: error.message });
  return (data as AnyRecord | null) ?? null;
}

export async function recordRentalHeldBalanceEvent(input: {
  client: AnyClient;
  rentalBookingId: string;
  eventType: string;
  amount: number;
  currencyCode: string;
  sourceType: string;
  sourceId: string;
  paymentMethod?: string | null;
  branchId?: string | null;
  staffUserId?: string | null;
  idempotencyKey?: string | null;
  metadata?: AnyRecord;
}): Promise<AnyRecord> {
  const expected = {
    rentalBookingId: text(input.rentalBookingId),
    eventType: text(input.eventType),
    amount: money(input.amount),
    currencyCode: normalizeCurrency(input.currencyCode || "THB"),
    sourceType: text(input.sourceType),
    sourceId: text(input.sourceId),
  };
  assertValidEventIdentity(expected);
  const payload = {
    rental_booking_id: expected.rentalBookingId,
    event_type: expected.eventType,
    amount: expected.amount,
    currency_code: expected.currencyCode,
    status: "posted",
    source_type: expected.sourceType,
    source_id: expected.sourceId,
    payment_method: text(input.paymentMethod) || null,
    branch_id: text(input.branchId) || null,
    staff_user_id: text(input.staffUserId) || null,
    idempotency_key: text(input.idempotencyKey) || null,
    metadata: input.metadata ?? {},
  };
  const { data, error } = await input.client
    .from("rental_held_balance_events")
    .insert(payload)
    .select(RENTAL_HELD_BALANCE_EVENT_SELECT)
    .maybeSingle();
  if (!error && data) return data as AnyRecord;
  if (!isUniqueViolation(error)) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message ?? "RENTAL_HELD_BALANCE_EVENT_NOT_CREATED",
    });
  }
  const existing = await findExistingRentalHeldBalanceEvent({
    client: input.client,
    sourceType: expected.sourceType,
    sourceId: expected.sourceId,
    eventType: expected.eventType,
  });
  assertExistingEventMatches(existing, expected);
  return existing as AnyRecord;
}

export async function recordBookingDepositHeldBalanceCollection(input: {
  client: AnyClient;
  booking: AnyRecord;
  amount: number;
  sourceType: "rental_booking_payment_attempt" | "mixed_payment_allocation";
  sourceId: string;
  paymentMethod?: string | null;
  metadata?: AnyRecord;
}) {
  return await recordRentalHeldBalanceEvent({
    client: input.client,
    rentalBookingId: String(input.booking.id ?? ""),
    eventType: BOOKING_DEPOSIT_COLLECTION_EVENT,
    amount: input.amount,
    currencyCode: String(input.booking.currency_code ?? "THB"),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    paymentMethod: input.paymentMethod,
    metadata: input.metadata,
  });
}