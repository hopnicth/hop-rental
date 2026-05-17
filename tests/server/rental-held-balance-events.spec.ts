import { describe, expect, it } from "vitest";
import {
  findExistingRentalHeldBalanceEvent,
  recordBookingDepositHeldBalanceCollection,
  recordRentalHeldBalanceEvent,
} from "../../server/utils/rental-held-balance-events";

type Row = Record<string, unknown>;

function client(initial: Row[] = []) {
  const state = { rental_held_balance_events: [...initial] };
  return {
    state,
    from(table: string) {
      let action: "select" | "insert" = "select";
      let payload: Row = {};
      const filters: Array<[string, unknown]> = [];
      const rows = () => (state as any)[table] as Row[];
      const matching = () =>
        rows().filter((row) => filters.every(([k, v]) => row[k] === v));
      const exec = async () => {
        if (action === "insert") {
          const duplicate = rows().find(
            (row) =>
              row.source_type === payload.source_type &&
              row.source_id === payload.source_id &&
              row.event_type === payload.event_type,
          );
          if (duplicate) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          const row = { id: `event-${rows().length + 1}`, ...payload };
          rows().push(row);
          return { data: row, error: null };
        }
        return { data: matching()[0] ?? null, error: null };
      };
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => (
          filters.push([key, value]),
          chain
        ),
        insert: (p: Row) => ((action = "insert"), (payload = p), chain),
        maybeSingle: exec,
      };
      return chain;
    },
  };
}

describe("rental held-balance events", () => {
  it("records a booking_deposit_collection event", async () => {
    const c = client();
    await recordBookingDepositHeldBalanceCollection({
      client: c,
      booking: { id: "booking-1", currency_code: "THB" },
      amount: 200,
      sourceType: "rental_booking_payment_attempt",
      sourceId: "attempt-1",
      paymentMethod: "qr_transfer",
    });
    expect(c.state.rental_held_balance_events).toEqual([
      expect.objectContaining({
        event_type: "booking_deposit_collection",
        rental_booking_id: "booking-1",
        amount: 200,
        currency_code: "THB",
        status: "posted",
        source_type: "rental_booking_payment_attempt",
        source_id: "attempt-1",
      }),
    ]);
  });

  it("reposting the same canonical source returns existing event", async () => {
    const c = client();
    const first = await recordRentalHeldBalanceEvent({
      client: c,
      rentalBookingId: "booking-1",
      eventType: "booking_deposit_collection",
      amount: 200,
      currencyCode: "THB",
      sourceType: "rental_booking_payment_attempt",
      sourceId: "attempt-1",
    });
    const second = await recordRentalHeldBalanceEvent({
      client: c,
      rentalBookingId: "booking-1",
      eventType: "booking_deposit_collection",
      amount: 200,
      currencyCode: "THB",
      sourceType: "rental_booking_payment_attempt",
      sourceId: "attempt-1",
    });
    expect(second.id).toBe(first.id);
    expect(c.state.rental_held_balance_events).toHaveLength(1);
  });

  it("rejects same source when existing event conflicts", async () => {
    const c = client([
      {
        id: "event-1",
        rental_booking_id: "booking-1",
        event_type: "booking_deposit_collection",
        amount: 200,
        currency_code: "THB",
        status: "posted",
        source_type: "rental_booking_payment_attempt",
        source_id: "attempt-1",
      },
    ]);
    await expect(
      recordRentalHeldBalanceEvent({
        client: c,
        rentalBookingId: "booking-2",
        eventType: "booking_deposit_collection",
        amount: 300,
        currencyCode: "THB",
        sourceType: "rental_booking_payment_attempt",
        sourceId: "attempt-1",
      }),
    ).rejects.toMatchObject({
      statusMessage: "RENTAL_HELD_BALANCE_EVENT_CONFLICT",
    });
  });

  it("finds existing events by exact source identity", async () => {
    const c = client([
      {
        id: "event-1",
        rental_booking_id: "booking-1",
        event_type: "booking_deposit_collection",
        amount: 200,
        currency_code: "THB",
        status: "posted",
        source_type: "mixed_payment_allocation",
        source_id: "allocation-1",
      },
    ]);
    await expect(
      findExistingRentalHeldBalanceEvent({
        client: c,
        sourceType: "mixed_payment_allocation",
        sourceId: "allocation-1",
        eventType: "booking_deposit_collection",
      }),
    ).resolves.toMatchObject({ id: "event-1" });
  });
});