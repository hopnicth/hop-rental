import { createError } from "h3";
import { normalizeCurrency } from "~~/server/utils/payment-core";

type AnyRecord = Record<string, unknown>;
type AnyClient = { from(table: string): any };

export type RentalHeldBalanceWarningCode =
  | "HELD_BALANCE_NEGATIVE_AVAILABLE"
  | "HELD_BALANCE_MIXED_CURRENCY"
  | "HELD_BALANCE_UNSUPPORTED_EVENT_TYPE"
  | "HELD_BALANCE_EVENT_BOOKING_MISMATCH";

export interface RentalHeldBalanceWarning {
  code: RentalHeldBalanceWarningCode;
  severity: "info" | "warning";
  message: string;
  context?: Record<string, unknown>;
}

export interface RentalHeldBalanceSummary {
  rentalBookingId: string;
  currencyCode: string | null;
  collections: {
    bookingDepositCollectedAmount: number;
    pickupHeldBalanceCollectedAmount: number;
    sameDayHeldBalanceCollectedAmount: number;
    totalHeldBalanceCollectedAmount: number;
  };
  reductions: {
    settlementAppliedAmount: number;
    refundedAmount: number;
    forfeitedAmount: number;
    totalHeldBalanceReducedAmount: number;
  };
  currentHeldBalanceAvailableAmount: number;
  state: {
    hasCanonicalEvents: boolean;
    eventCount: number;
    warnings: RentalHeldBalanceWarning[];
  };
}

const COLLECTION_EVENT_TYPES = new Set([
  "booking_deposit_collection",
  "pickup_held_balance_collection",
  "same_day_held_balance_collection",
]);

const REDUCTION_EVENT_TYPES = new Set([
  "settlement_application",
  "refund",
  "forfeiture",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : 0;
}

function signedMoney(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function addWarning(
  warnings: RentalHeldBalanceWarning[],
  warning: RentalHeldBalanceWarning,
) {
  warnings.push(warning);
}

export function buildRentalHeldBalanceSummary(input: {
  rentalBookingId: string;
  events?: AnyRecord[] | null;
}): RentalHeldBalanceSummary {
  const rentalBookingId = text(input.rentalBookingId);
  const warnings: RentalHeldBalanceWarning[] = [];
  const collections = {
    bookingDepositCollectedAmount: 0,
    pickupHeldBalanceCollectedAmount: 0,
    sameDayHeldBalanceCollectedAmount: 0,
    totalHeldBalanceCollectedAmount: 0,
  };
  const reductions = {
    settlementAppliedAmount: 0,
    refundedAmount: 0,
    forfeitedAmount: 0,
    totalHeldBalanceReducedAmount: 0,
  };
  const postedEvents = (input.events ?? []).filter((event) => {
    if (text(event.status) !== "posted") return false;
    const eventBookingId = text(event.rental_booking_id);
    if (eventBookingId !== rentalBookingId) {
      addWarning(warnings, {
        code: "HELD_BALANCE_EVENT_BOOKING_MISMATCH",
        severity: "warning",
        message: "A held-balance event for another rental booking was ignored.",
        context: { eventBookingId, expectedBookingId: rentalBookingId },
      });
      return false;
    }
    return true;
  });
  const currencyCodes = [
    ...new Set(
      postedEvents
        .map((event) => normalizeCurrency(event.currency_code || "THB"))
        .filter(Boolean),
    ),
  ];
  if (currencyCodes.length > 1) {
    addWarning(warnings, {
      code: "HELD_BALANCE_MIXED_CURRENCY",
      severity: "warning",
      message:
        "Held-balance events contain multiple currencies; totals are not cross-currency accounting totals.",
      context: { currencyCodes },
    });
  }
  for (const event of postedEvents) {
    const eventType = text(event.event_type);
    const amount = money(event.amount);
    if (eventType === "booking_deposit_collection") {
      collections.bookingDepositCollectedAmount = money(
        collections.bookingDepositCollectedAmount + amount,
      );
    } else if (eventType === "pickup_held_balance_collection") {
      collections.pickupHeldBalanceCollectedAmount = money(
        collections.pickupHeldBalanceCollectedAmount + amount,
      );
    } else if (eventType === "same_day_held_balance_collection") {
      collections.sameDayHeldBalanceCollectedAmount = money(
        collections.sameDayHeldBalanceCollectedAmount + amount,
      );
    } else if (eventType === "settlement_application") {
      reductions.settlementAppliedAmount = money(
        reductions.settlementAppliedAmount + amount,
      );
    } else if (eventType === "refund") {
      reductions.refundedAmount = money(reductions.refundedAmount + amount);
    } else if (eventType === "forfeiture") {
      reductions.forfeitedAmount = money(reductions.forfeitedAmount + amount);
    } else if (
      !COLLECTION_EVENT_TYPES.has(eventType) &&
      !REDUCTION_EVENT_TYPES.has(eventType)
    ) {
      addWarning(warnings, {
        code: "HELD_BALANCE_UNSUPPORTED_EVENT_TYPE",
        severity: "warning",
        message: "Unsupported held-balance event type was ignored.",
        context: { eventType },
      });
    }
  }
  collections.totalHeldBalanceCollectedAmount = money(
    collections.bookingDepositCollectedAmount +
      collections.pickupHeldBalanceCollectedAmount +
      collections.sameDayHeldBalanceCollectedAmount,
  );
  reductions.totalHeldBalanceReducedAmount = money(
    reductions.settlementAppliedAmount +
      reductions.refundedAmount +
      reductions.forfeitedAmount,
  );
  const currentHeldBalanceAvailableAmount = signedMoney(
    collections.totalHeldBalanceCollectedAmount -
      reductions.totalHeldBalanceReducedAmount,
  );
  if (
    reductions.totalHeldBalanceReducedAmount >
    collections.totalHeldBalanceCollectedAmount
  ) {
    addWarning(warnings, {
      code: "HELD_BALANCE_NEGATIVE_AVAILABLE",
      severity: "warning",
      message:
        "Held-balance reductions exceed collections; available balance is negative.",
      context: {
        totalHeldBalanceCollectedAmount:
          collections.totalHeldBalanceCollectedAmount,
        totalHeldBalanceReducedAmount: reductions.totalHeldBalanceReducedAmount,
      },
    });
  }
  return {
    rentalBookingId,
    currencyCode: currencyCodes[0] ?? null,
    collections,
    reductions,
    currentHeldBalanceAvailableAmount,
    state: {
      hasCanonicalEvents: postedEvents.length > 0,
      eventCount: postedEvents.length,
      warnings,
    },
  };
}

export async function loadRentalHeldBalanceEventsForBooking(input: {
  client: AnyClient;
  rentalBookingId: string;
}): Promise<AnyRecord[]> {
  const { data, error } = await input.client
    .from("rental_held_balance_events")
    .select("*")
    .eq("rental_booking_id", input.rentalBookingId)
    .order("occurred_at", { ascending: true });
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  return (data as AnyRecord[] | null) ?? [];
}
