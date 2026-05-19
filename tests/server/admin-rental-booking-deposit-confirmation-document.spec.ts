import { beforeEach, describe, expect, it } from "vitest";

type Row = Record<string, unknown>;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const BASE_EVENT: Row = {
  id: "event-1",
  event_type: "booking_deposit_collection",
  amount: 500,
  currency_code: "THB",
  occurred_at: "2026-05-21T10:00:00.000Z",
  source_type: "pos_rental_payment_attempt",
  source_id: "attempt-1",
  payment_method: "cash",
  rental_booking_id: "booking-1",
};

const BASE_BOOKING: Row = {
  id: "booking-1",
  user_id: null,
  walk_in_phone: "0812345678",
  booker_name: "Test Customer",
  start_date: "2026-05-21",
  end_date: "2026-05-24",
  rental_days: 3,
  hub_id: null,
  pos_branch_id: "branch-hq",
  currency_code: "THB",
  // Intentionally different — to confirm snapshot uses event amount, not booking field
  booking_deposit_paid_amount: 9999,
};

// ── Mock client factory ───────────────────────────────────────────────────────
function makeClient(opts: { existingDoc?: Row; insertError?: any } = {}) {
  const state = {
    documents: opts.existingDoc ? [opts.existingDoc] : ([] as Row[]),
    events: [] as Row[],
    rpcCalls: [] as Row[],
    insertedDocs: [] as Row[],
    tablesAccessed: [] as string[],
  };

  const chain = (result: { data: unknown; error: unknown }) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      in: () => c,
      order: () => c,
      limit: () => c,
      maybeSingle: async () => result,
      single: async () => result,
      then: (resolve: (v: any) => unknown) => Promise.resolve(result).then(resolve),
    };
    return c;
  };

  return {
    state,
    async rpc(name: string, params: Row) {
      state.rpcCalls.push({ name, params });
      return {
        data: `${params.p_prefix}-${params.p_period}-0001`,
        error: null,
      };
    },
    from(table: string) {
      state.tablesAccessed.push(table);

      // system_configs and branch_document_settings → return empty for header
      if (table === "system_configs" || table === "branch_document_settings")
        return chain({ data: null, error: null });

      if (table === "official_documents") {
        return {
          select: () => {
            const filters: Array<{ key: string; value: unknown }> = [];
            const c: any = {
              select: () => c,
              eq: (key: string, value: unknown) => {
                filters.push({ key, value });
                return c;
              },
              in: () => c,
              order: () => c,
              limit: () => c,
              maybeSingle: async () => {
                const match = state.documents.find((d) =>
                  filters.every((f) => d[f.key] === f.value),
                );
                return { data: match ?? null, error: null };
              },
            };
            return c;
          },
          insert: (payload: Row) => {
            const insertError = opts.insertError ?? null;
            if (!insertError) {
              const row = {
                ...payload,
                id: `doc-${state.documents.length + 1}`,
                print_count: 0,
                last_printed_at: null,
                created_at: "2026-05-21T10:00:00.000Z",
                updated_at: "2026-05-21T10:00:00.000Z",
              };
              state.documents.push(row);
              state.insertedDocs.push(row);
              return chain({ data: row, error: null });
            }
            return chain({ data: null, error: insertError });
          },
        };
      }

      if (table === "document_events") {
        return {
          insert: (payload: Row) => {
            state.events.push(payload);
            return chain({ data: { id: "evt-1" }, error: null });
          },
        };
      }

      return chain({ data: null, error: null });
    },
  };
}

// ── Existing doc fixture ──────────────────────────────────────────────────────
function makeExistingDoc(): Row {
  return {
    id: "doc-existing",
    document_type: "rental_booking_deposit_confirmation",
    document_no: "BDC-202605-0001",
    status: "issued",
    branch_id: "branch-hq",
    source_type: "rental_held_balance_event",
    source_id: "event-1",
    issued_at: "2026-05-21T10:00:00.000Z",
    subtotal: 500,
    vat_amount: 0,
    total_amount: 500,
    currency_code: "THB",
    template_key: "rental_booking_deposit_confirmation_v1",
    template_version: 1,
    snapshot: {},
    print_count: 0,
    last_printed_at: null,
    created_at: "2026-05-21T10:00:00.000Z",
    updated_at: "2026-05-21T10:00:00.000Z",
  };
}

// ── Import utility under test ─────────────────────────────────────────────────
const {
  issueBookingDepositConfirmationDocument,
  BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
  BOOKING_DEPOSIT_CONFIRMATION_TITLE_TH,
} = await import(
  "../../server/utils/admin-rental-booking-deposit-confirmation-document"
);

describe("issueBookingDepositConfirmationDocument", () => {
  it("happy path: inserts official_documents and document_events with correct fields", async () => {
    const client = makeClient();
    const result = await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: BASE_EVENT,
      booking: BASE_BOOKING,
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    expect(result.alreadyIssued).toBe(false);
    expect(result.document.documentType).toBe(BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE);
    expect(result.document.status).toBe("issued");
    expect(result.document.sourceType).toBe("rental_held_balance_event");
    expect(result.document.sourceId).toBe("event-1");

    // official_documents row
    const inserted = client.state.insertedDocs[0];
    expect(inserted).toMatchObject({
      document_type: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
      status: "issued",
      source_type: "rental_held_balance_event",
      source_id: "event-1",
      branch_id: "branch-hq",
      subtotal: 500,
      vat_amount: 0,
      total_amount: 500,
      currency_code: "THB",
      template_key: "rental_booking_deposit_confirmation_v1",
      template_version: 1,
    });

    // document_events row
    expect(client.state.events).toHaveLength(1);
    expect(client.state.events[0]).toMatchObject({
      event_type: "issued",
      staff_user_id: "staff-1",
    });
  });

  it("snapshot uses held_balance_event.amount — NOT booking_deposit_paid_amount", async () => {
    const client = makeClient();
    await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: { ...BASE_EVENT, amount: 500 },
      booking: { ...BASE_BOOKING, booking_deposit_paid_amount: 9999 },
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    const snap = client.state.insertedDocs[0].snapshot as any;
    expect(snap.held_balance_event.amount).toBe(500);
    expect(snap.document.document_title).toBe(BOOKING_DEPOSIT_CONFIRMATION_TITLE_TH);
    expect(snap.source.source_type).toBe("rental_held_balance_event");
    expect(snap.source.source_id).toBe("event-1");
    // amount should NOT be 9999
    expect(snap.held_balance_event.amount).not.toBe(9999);
  });

  it("calls f_next_document_number with BDC prefix and correct document_type", async () => {
    const client = makeClient();
    await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: BASE_EVENT,
      booking: BASE_BOOKING,
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    expect(client.state.rpcCalls).toHaveLength(1);
    expect(client.state.rpcCalls[0]).toMatchObject({
      name: "f_next_document_number",
      params: {
        p_document_type: BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE,
        p_prefix: "BDC",
        p_branch_id: "branch-hq",
      },
    });
    // document_no in inserted row contains BDC prefix
    expect(client.state.insertedDocs[0].document_no).toMatch(/^BDC-/);
  });

  it("returns alreadyIssued=true without creating duplicate when doc already exists", async () => {
    const client = makeClient({ existingDoc: makeExistingDoc() });
    const result = await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: BASE_EVENT,
      booking: BASE_BOOKING,
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    expect(result.alreadyIssued).toBe(true);
    expect(result.document.id).toBe("doc-existing");
    // No new inserts
    expect(client.state.insertedDocs).toHaveLength(0);
    expect(client.state.rpcCalls).toHaveLength(0);
    expect(client.state.events).toHaveLength(0);
  });

  it("handles 23505 race condition: loads winning row instead of throwing", async () => {
    const existingDoc = makeExistingDoc();
    const client = makeClient({
      existingDoc,
      insertError: { code: "23505", message: "unique violation" },
    });
    const result = await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: BASE_EVENT,
      booking: BASE_BOOKING,
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    expect(result.alreadyIssued).toBe(true);
    expect(result.document.id).toBe("doc-existing");
  });

  it("does not touch rental_bookings, pos_rental_payment_attempts, pos_document_issuance_tasks", async () => {
    const client = makeClient();
    await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: BASE_EVENT,
      booking: BASE_BOOKING,
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    const forbidden = ["rental_bookings", "pos_rental_payment_attempts", "pos_document_issuance_tasks"];
    for (const table of forbidden) {
      expect(client.state.tablesAccessed).not.toContain(table);
    }
  });

  it("throws 422 when heldBalanceEvent.id is missing", async () => {
    const client = makeClient();
    await expect(
      issueBookingDepositConfirmationDocument({
        client: client as any,
        heldBalanceEvent: { ...BASE_EVENT, id: "" },
        booking: BASE_BOOKING,
        staffUserId: "staff-1",
        branchId: "branch-hq",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("idempotency_key in inserted row is deterministic and tied to event + document type", async () => {
    const client = makeClient();
    await issueBookingDepositConfirmationDocument({
      client: client as any,
      heldBalanceEvent: BASE_EVENT,
      booking: BASE_BOOKING,
      staffUserId: "staff-1",
      branchId: "branch-hq",
    });

    expect(client.state.insertedDocs[0].idempotency_key).toBe(
      `rental_held_balance_event:event-1:${BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE}`,
    );
  });
});
