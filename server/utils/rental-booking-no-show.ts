import { createError } from "h3";
import { recordRentalHeldBalanceEvent } from "~~/server/utils/rental-held-balance-events";
import { buildRentalHeldBalanceSummary } from "~~/server/utils/rental-held-balance-summary";
import type { AdminRentalBookingDetail } from "~~/app/types/admin-order-detail";
import {
  ADMIN_RENTAL_BOOKING_DETAIL_SELECT,
  fetchAdminCustomerProfile,
  mapAdminRentalBookingDetail,
} from "~~/server/utils/admin-orders";
import { ensureNoShowForfeitureDocuments } from "~~/server/utils/rental-booking-no-show-documents";
import { toBangkokLocalDate } from "~~/server/utils/rental-cancellation-policy";

type Row = Record<string, unknown>;
type QueryError = { message?: string; code?: string } | null;
type AnyClient = { from(table: string): any };

const LOAD_SELECT =
  "id, user_id, status, start_date, deposit_paid_amount, currency_code, booking_deposit_paid_amount, booking_deposit_payment_attempt_id, booking_deposit_mixed_allocation_id, booking_deposit_policy_version, booking_deposit_terms_accepted_at, booking_deposit_terms_version, deposit_refund_status, deposit_refund_amount, deposit_refund_notes, no_show_source_event_id";
const DEFAULT_NO_SHOW_DEPOSIT_NOTE =
  "Booking Deposit retained/forfeited by no-show policy; refund not applicable.";
const NO_SHOW_FORFEITURE_POLICY_VERSION =
  "booking_deposit_forfeiture_no_show_v1";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function optionalText(value: unknown): string | null {
  const clean = text(value);
  return clean || null;
}
function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : 0;
}
function isUniqueViolation(error: QueryError): boolean {
  return error?.code === "23505";
}
function noShowStatusCode(message: string): number {
  if (message === "RENTAL_BOOKING_NOT_FOUND") return 404;
  if (message === "BOOKING_ALREADY_NO_SHOW") return 409;
  if (message === "BOOKING_PICKUP_DATE_NOT_PASSED") return 409;
  if (message === "BOOKING_NOT_CONFIRMED_FOR_NO_SHOW") return 409;
  return 500;
}

async function fetchCurrentBookingDetail(input: {
  adminClient: AnyClient;
  bookingId: string;
}): Promise<AdminRentalBookingDetail> {
  const { data, error } = await input.adminClient
    .from("rental_bookings")
    .select(ADMIN_RENTAL_BOOKING_DETAIL_SELECT)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data)
    throw createError({
      statusCode: 404,
      statusMessage: "RENTAL_BOOKING_NOT_FOUND",
    });
  const customer = await fetchAdminCustomerProfile(
    input.adminClient as never,
    text((data as Row).user_id),
  );
  return mapAdminRentalBookingDetail(data, customer);
}

async function ensureNoShowDocumentsThenFetchDetail(input: {
  adminClient: AnyClient;
  bookingId: string;
  adminUserId: string;
}): Promise<AdminRentalBookingDetail> {
  await ensureNoShowForfeitureDocuments({
    client: input.adminClient,
    bookingId: input.bookingId,
    adminUserId: input.adminUserId,
  });
  return fetchCurrentBookingDetail({
    adminClient: input.adminClient,
    bookingId: input.bookingId,
  });
}

export function assertBookingCanBeMarkedNoShow(input: {
  booking: Row;
  now?: Date;
}) {
  const status = text(input.booking.status);
  if (status === "no_show")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_ALREADY_NO_SHOW",
    });
  if (status !== "confirmed")
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_NOT_CONFIRMED_FOR_NO_SHOW",
    });
  const pickupLocalDate = toBangkokLocalDate(text(input.booking.start_date));
  const todayLocalDate = toBangkokLocalDate(input.now ?? new Date());
  if (pickupLocalDate >= todayLocalDate) {
    throw createError({
      statusCode: 409,
      statusMessage: "BOOKING_PICKUP_DATE_NOT_PASSED",
      data: { pickupLocalDate, todayLocalDate, timeZone: "Asia/Bangkok" },
    });
  }
  return { pickupLocalDate, todayLocalDate };
}

function bookingDepositPaymentSource(booking: Row): {
  sourceType: string;
  paymentAttemptId: string | null;
  mixedAllocationId: string | null;
} {
  const paymentAttemptId = optionalText(
    booking.booking_deposit_payment_attempt_id,
  );
  if (paymentAttemptId) {
    return {
      sourceType: "rental_booking_payment_attempt",
      paymentAttemptId,
      mixedAllocationId: null,
    };
  }
  const mixedAllocationId = optionalText(
    booking.booking_deposit_mixed_allocation_id,
  );
  if (mixedAllocationId) {
    return {
      sourceType: "mixed_payment_allocation",
      paymentAttemptId: null,
      mixedAllocationId,
    };
  }
  return {
    sourceType: "legacy_deposit_field",
    paymentAttemptId: null,
    mixedAllocationId: null,
  };
}

async function createNoShowForfeitureChain(input: {
  adminClient: AnyClient;
  booking: Row;
  bookingId: string;
  eventId: string;
  adminUserId: string;
  markedAt: string;
  reason: string | null;
}) {
  const forfeitedAmount =
    money(input.booking.booking_deposit_paid_amount) ||
    money(input.booking.deposit_paid_amount);
  const currencyCode = text(input.booking.currency_code).toUpperCase() || "THB";
  const paymentSource = bookingDepositPaymentSource(input.booking);
  const dispositionPayload = {
    booking_id: input.bookingId,
    user_id: optionalText(input.booking.user_id),
    source_event_type: "no_show",
    no_show_event_id: input.eventId,
    actor_user_id: input.adminUserId,
    actor_type: "admin",
    occurred_at: input.markedAt,
    disposition: "forfeited",
    forfeited_amount: forfeitedAmount,
    currency_code: currencyCode,
    booking_deposit_payment_source_type: paymentSource.sourceType,
    rental_booking_payment_attempt_id: paymentSource.paymentAttemptId,
    mixed_payment_allocation_id: paymentSource.mixedAllocationId,
    accepted_terms_version: optionalText(
      input.booking.booking_deposit_terms_version,
    ),
    terms_accepted_at: optionalText(
      input.booking.booking_deposit_terms_accepted_at,
    ),
    policy_version: NO_SHOW_FORFEITURE_POLICY_VERSION,
    reason: input.reason,
    metadata: {
      operationalSource: "rental_booking_no_show_events",
      noShowEventId: input.eventId,
      bookingDepositPolicyVersion: optionalText(
        input.booking.booking_deposit_policy_version,
      ),
      bookingDepositPaidAmount: money(
        input.booking.booking_deposit_paid_amount,
      ),
      legacyDepositPaidAmount: money(input.booking.deposit_paid_amount),
    },
  };
  const { data: disposition, error: dispositionError } = await input.adminClient
    .from("rental_booking_deposit_disposition_events")
    .insert(dispositionPayload)
    .select("*")
    .maybeSingle();

  // T2 (§b addendum item 2): forfeiture = policy-driven TOTAL seizure. The
  // held-balance ledger releases its FULL current balance (ledger-derived —
  // never the legacy columns), closing the Phase-0 gap where manual no-show
  // wrote the disposition event but left the ledger un-released. Idempotent
  // on the no-show event id. Skipped when the ledger holds nothing (legacy
  // bookings with no canonical events).
  {
    const { data: ledgerEvents, error: ledgerError } = await input.adminClient
      .from("rental_held_balance_events")
      .select("rental_booking_id, event_type, amount, currency_code, status")
      .eq("rental_booking_id", input.bookingId);
    if (ledgerError) {
      throw createError({ statusCode: 500, statusMessage: ledgerError.message });
    }
    const heldSummary = buildRentalHeldBalanceSummary({
      rentalBookingId: input.bookingId,
      events: (ledgerEvents ?? []) as Row[],
    });
    const heldTotal = heldSummary.currentHeldBalanceAvailableAmount;
    if (heldTotal > 0) {
      await recordRentalHeldBalanceEvent({
        client: input.adminClient,
        rentalBookingId: input.bookingId,
        eventType: "forfeiture",
        amount: heldTotal,
        currencyCode: currencyCode,
        sourceType: "no_show_forfeiture",
        sourceId: input.eventId,
        staffUserId: input.adminUserId,
        idempotencyKey: `no-show-forfeiture-${input.eventId}`,
        metadata: {
          noShowEventId: input.eventId,
          dispositionForfeitedAmount: forfeitedAmount,
          ledgerHeldTotalAtForfeiture: heldTotal,
          policyVersion: NO_SHOW_FORFEITURE_POLICY_VERSION,
        },
      });
    }
  }
  if (dispositionError && !isUniqueViolation(dispositionError)) {
    throw createError({
      statusCode: 500,
      statusMessage: dispositionError.message,
    });
  }
  let dispositionRow = disposition as Row | null;
  if (
    !dispositionRow &&
    dispositionError &&
    isUniqueViolation(dispositionError)
  ) {
    const { data: existing, error: existingError } = await input.adminClient
      .from("rental_booking_deposit_disposition_events")
      .select("*")
      .eq("no_show_event_id", input.eventId)
      .maybeSingle();
    if (existingError) {
      throw createError({
        statusCode: 500,
        statusMessage: existingError.message,
      });
    }
    dispositionRow = existing as Row | null;
  }
  const dispositionId = text(dispositionRow?.id);
  if (!dispositionId) {
    throw createError({
      statusCode: 500,
      statusMessage: "DEPOSIT_DISPOSITION_NOT_CREATED",
    });
  }

  const { data: recognition, error: recognitionError } = await input.adminClient
    .from("financial_recognition_events")
    .insert({
      recognition_type: "booking_deposit_forfeiture_income",
      source_type: "rental_booking_deposit_disposition_event",
      source_id: dispositionId,
      booking_id: input.bookingId,
      recognized_at: input.markedAt,
      recognized_amount: forfeitedAmount,
      currency_code: currencyCode,
      revenue_category: "contractual_penalty_damage_deposit_forfeiture",
      tax_treatment: "non_vat_contractual_penalty",
      vat_rate: 0,
      vat_amount: 0,
      wht_treatment: "not_subject_to_wht",
      wht_rate: 0,
      wht_amount: 0,
      status: "recognized",
      metadata: {
        dispositionEventId: dispositionId,
        noShowEventId: input.eventId,
        ordinaryReceiptDeferred: true,
      },
    })
    .select("*")
    .maybeSingle();
  if (recognitionError && !isUniqueViolation(recognitionError)) {
    throw createError({
      statusCode: 500,
      statusMessage: recognitionError.message,
    });
  }
  let recognitionRow = recognition as Row | null;
  if (
    !recognitionRow &&
    recognitionError &&
    isUniqueViolation(recognitionError)
  ) {
    const { data: existing, error: existingError } = await input.adminClient
      .from("financial_recognition_events")
      .select("*")
      .eq("source_type", "rental_booking_deposit_disposition_event")
      .eq("source_id", dispositionId)
      .eq("recognition_type", "booking_deposit_forfeiture_income")
      .maybeSingle();
    if (existingError) {
      throw createError({
        statusCode: 500,
        statusMessage: existingError.message,
      });
    }
    recognitionRow = existing as Row | null;
  }
  return {
    dispositionEventId: dispositionId,
    recognitionEventId: text(recognitionRow?.id) || null,
  };
}

async function cleanupNoShowForfeitureChain(input: {
  adminClient: AnyClient;
  eventId: string;
  dispositionEventId?: string | null;
}) {
  if (input.dispositionEventId) {
    await input.adminClient
      .from("financial_recognition_events")
      .delete()
      .eq("source_type", "rental_booking_deposit_disposition_event")
      .eq("source_id", input.dispositionEventId);
  }
  await input.adminClient
    .from("rental_booking_deposit_disposition_events")
    .delete()
    .eq("no_show_event_id", input.eventId);
}

export async function markRentalBookingNoShow(input: {
  adminClient: AnyClient;
  bookingId: string;
  adminUserId: string;
  reason?: unknown;
  now?: Date;
}): Promise<AdminRentalBookingDetail> {
  const markedAt = (input.now ?? new Date()).toISOString();
  const { data: current, error: loadError } = await input.adminClient
    .from("rental_bookings")
    .select(LOAD_SELECT)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loadError)
    throw createError({ statusCode: 500, statusMessage: loadError.message });
  if (!current)
    throw createError({
      statusCode: 404,
      statusMessage: "RENTAL_BOOKING_NOT_FOUND",
    });

  if (text((current as Row).status) === "no_show") {
    return ensureNoShowDocumentsThenFetchDetail({
      adminClient: input.adminClient,
      bookingId: input.bookingId,
      adminUserId: input.adminUserId,
    });
  }

  const policy = assertBookingCanBeMarkedNoShow({
    booking: current as Row,
    now: input.now,
  });
  const reason = optionalText(input.reason);
  const { data: event, error: eventError } = await input.adminClient
    .from("rental_booking_no_show_events")
    .insert({
      booking_id: input.bookingId,
      admin_user_id: input.adminUserId,
      marked_at: markedAt,
      pickup_date_snapshot: policy.pickupLocalDate,
      previous_status: "confirmed",
      previous_deposit_refund_status: optionalText(
        (current as Row).deposit_refund_status,
      ),
      deposit_outcome: "booking_deposit_forfeited_no_refund",
      reason,
      metadata: {
        todayLocalDate: policy.todayLocalDate,
        timeZone: "Asia/Bangkok",
      },
    })
    .select("*")
    .maybeSingle();
  if (eventError) {
    if (isUniqueViolation(eventError)) {
      const detail = await fetchCurrentBookingDetail({
        adminClient: input.adminClient,
        bookingId: input.bookingId,
      });
      if (detail.status === "no_show") {
        await ensureNoShowForfeitureDocuments({
          client: input.adminClient,
          bookingId: input.bookingId,
          adminUserId: input.adminUserId,
        });
        return detail;
      }
    }
    throw createError({
      statusCode: isUniqueViolation(eventError) ? 409 : 500,
      statusMessage: isUniqueViolation(eventError)
        ? "BOOKING_ALREADY_NO_SHOW"
        : eventError.message,
    });
  }
  const eventId = text((event as Row | null)?.id);
  if (!eventId)
    throw createError({
      statusCode: 500,
      statusMessage: "NO_SHOW_EVENT_NOT_CREATED",
    });

  let chain: {
    dispositionEventId: string;
    recognitionEventId: string | null;
  } | null = null;
  try {
    chain = await createNoShowForfeitureChain({
      adminClient: input.adminClient,
      booking: current as Row,
      bookingId: input.bookingId,
      eventId,
      adminUserId: input.adminUserId,
      markedAt,
      reason,
    });
  } catch (err) {
    await cleanupNoShowForfeitureChain({
      adminClient: input.adminClient,
      eventId,
    });
    await input.adminClient
      .from("rental_booking_no_show_events")
      .delete()
      .eq("id", eventId);
    throw err;
  }

  const { data: updated, error: updateError } = await input.adminClient
    .from("rental_bookings")
    .update({
      status: "no_show",
      no_show_at: markedAt,
      no_show_marked_by_user_id: input.adminUserId,
      no_show_reason: reason,
      no_show_source_event_id: eventId,
      deposit_refund_status: "forfeited",
      deposit_refund_amount: 0,
      deposit_refund_notes: reason || DEFAULT_NO_SHOW_DEPOSIT_NOTE,
    })
    .eq("id", input.bookingId)
    .eq("status", "confirmed")
    .select(ADMIN_RENTAL_BOOKING_DETAIL_SELECT)
    .maybeSingle();
  if (updateError || !updated) {
    await cleanupNoShowForfeitureChain({
      adminClient: input.adminClient,
      eventId,
      dispositionEventId: chain?.dispositionEventId,
    });
    await input.adminClient
      .from("rental_booking_no_show_events")
      .delete()
      .eq("id", eventId);
    throw createError({
      statusCode: updateError
        ? noShowStatusCode(text(updateError.message))
        : 409,
      statusMessage: updateError?.message || "BOOKING_NO_SHOW_CONFLICT",
    });
  }
  await ensureNoShowForfeitureDocuments({
    client: input.adminClient,
    bookingId: input.bookingId,
    adminUserId: input.adminUserId,
  });
  const customer = await fetchAdminCustomerProfile(
    input.adminClient as never,
    text((updated as Row).user_id),
  );
  return mapAdminRentalBookingDetail(updated, customer);
}
