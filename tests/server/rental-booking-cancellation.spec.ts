import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cancelCustomerRentalBooking,
  validateCustomerCancellationPayload,
} from "../../server/utils/rental-booking-cancellation";

type Row = Record<string, unknown>;
type QueryError = { message: string; code?: string } | null;
type ClientOptions = {
  rpc?: (
    name: string,
    params?: Row,
  ) => Promise<{ data: unknown; error: QueryError }>;
  insertErrors?: Record<string, QueryError>;
};

const migration082 = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/082_customer_cancellation_api_hardening.sql",
  ),
  "utf8",
);

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  private action: "select" | "insert" | "update" = "select";
  private payload: Row = {};
  private orderKey: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  constructor(
    private db: Record<string, Row[]>,
    private table: string,
    private options: ClientOptions = {},
  ) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push((r) => String(r[column]) >= String(value));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderKey = column;
    this.orderAscending = options?.ascending !== false;
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  insert(payload: Row) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.action = "update";
    this.payload = payload;
    return this;
  }
  async maybeSingle() {
    const result = await this.exec();
    return { data: result.data[0] ?? null, error: result.error };
  }
  async single() {
    return this.maybeSingle();
  }
  then(resolve: (value: { data: Row[]; error: QueryError }) => void) {
    this.exec().then(resolve);
  }
  private rows() {
    let rows = [...(this.db[this.table] ?? [])].filter((row) =>
      this.filters.every((fn) => fn(row)),
    );
    if (this.orderKey) {
      const key = this.orderKey;
      rows = rows.sort(
        (a, b) =>
          String(a[key]).localeCompare(String(b[key])) *
          (this.orderAscending ? 1 : -1),
      );
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }
  private async exec() {
    this.db[this.table] ??= [];
    if (this.action === "insert") {
      const insertError = this.options.insertErrors?.[this.table];
      if (insertError) return { data: [], error: insertError };
      const row = {
        id: `${this.table}-${this.db[this.table].length + 1}`,
        created_at: "2026-06-07T16:00:00.000Z",
        updated_at: "2026-06-07T16:00:00.000Z",
        print_count: 0,
        last_printed_at: null,
        ...this.payload,
      };
      this.db[this.table].push(row);
      return { data: [row], error: null };
    }
    const matched = this.rows();
    if (this.action === "update")
      matched.forEach((row) => Object.assign(row, this.payload));
    return { data: matched, error: null };
  }
}

function client(db: Record<string, Row[]>, options: ClientOptions = {}) {
  return {
    from: (table: string) => new Chain(db, table, options),
    rpc:
      options.rpc ??
      (async (name: string) => ({
        data: name === "f_next_document_number" ? "CXL-202606-0001" : null,
        error: null,
      })),
  };
}

const validBody = {
  refundBankName: "Kasikorn",
  refundBankAccountNumber: "1234567890",
  refundBankAccountName: "Customer One",
  refundContactPhone: "0812345678",
  refundCustomerNote: " please refund ",
  cancellationReasonCode: "changed_plan",
  cancellationReasonNote: "changed schedule",
  confirmRefundDestinationAccuracy: true,
};

function booking(overrides: Row = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "confirmed",
    start_date: "2026-06-10",
    end_date: "2026-06-12",
    rental_days: 2,
    hub_id: "branch-1",
    currency_code: "THB",
    booking_deposit_payment_status: "paid",
    booking_deposit_paid_amount: 200,
    booking_deposit_payment_attempt_id: "attempt-1",
    booking_deposit_mixed_allocation_id: null,
    ...overrides,
  };
}

function qualifyingEvent(i: number): Row {
  return {
    id: `old-${i}`,
    user_id: "user-1",
    cancelled_at: `2026-0${i + 1}-01T00:00:00.000Z`,
    cancellation_initiator: "customer",
    cancellation_source: "customer_web",
    previous_status: "confirmed",
    previous_booking_deposit_payment_status: "paid",
    qualifies_for_restriction: true,
  };
}

function seed(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    rental_bookings: [booking()],
    rental_booking_payment_attempts: [
      {
        id: "attempt-1",
        booking_id: "booking-1",
        user_id: "user-1",
        gateway: "omise",
        status: "paid",
        amount: 200,
        currency_code: "THB",
        gateway_charge_id: "chrg_1",
        gateway_source_id: "src_1",
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ],
    mixed_payment_allocations: [],
    mixed_payment_attempts: [],
    mixed_checkout_sessions: [],
    rental_booking_cancellation_events: [],
    payment_refunds: [],
    users: [{ id: "user-1", rental_booking_restriction_status: "none" }],
    official_documents: [],
    document_events: [],
    system_configs: [],
    branch_document_settings: [],
    ...overrides,
  } as Record<string, Row[]>;
}

describe("customer rental booking cancellation", () => {
  it("cancels a confirmed paid booking, creates event/refund/document, and stores refund destination", async () => {
    const db = seed();
    const result = await cancelCustomerRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      booking: { status: "cancelled" },
    });
    expect(db.rental_bookings[0]).toMatchObject({
      status: "cancelled",
      cancellation_source: "customer_web",
      cancellation_refund_amount_due: 200,
    });
    expect(db.rental_booking_cancellation_events[0]).toMatchObject({
      refund_eligible: true,
      qualifies_for_restriction: true,
      refund_cutoff_date_snapshot: "2026-06-07",
    });
    expect(db.payment_refunds[0]).toMatchObject({
      status: "pending_admin_review",
      original_payment_source_type: "rental_booking_payment_attempt",
      refund_bank_account_number: "1234567890",
      customer_note: "please refund",
    });
    expect(db.official_documents[0]).toMatchObject({
      document_type: "rental_booking_cancellation_confirmation",
      source_type: "rental_booking_cancellation_event",
    });
    expect(db.document_events[0]).toMatchObject({
      event_type: "issued",
      document_id: db.official_documents[0]?.id,
    });
  });

  it("resolves mixed checkout booking-deposit allocation as the original payment source", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          booking_deposit_payment_attempt_id: null,
          booking_deposit_mixed_allocation_id: "alloc-1",
        }),
      ],
      rental_booking_payment_attempts: [],
      mixed_payment_allocations: [
        {
          id: "alloc-1",
          mixed_checkout_session_id: "mixed-session-1",
          rental_booking_id: "booking-1",
          mixed_payment_attempt_id: "mixed-attempt-1",
          user_id: "user-1",
          allocation_type: "booking_deposit",
          status: "finalized",
          amount: 200,
          currency_code: "THB",
          paid_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      mixed_payment_attempts: [
        {
          id: "mixed-attempt-1",
          mixed_checkout_session_id: "mixed-session-1",
          user_id: "user-1",
          gateway: "omise",
          status: "paid",
          amount: 1200,
          currency_code: "THB",
          gateway_charge_id: "chrg_mixed",
          gateway_source_id: "src_mixed",
        },
      ],
      mixed_checkout_sessions: [
        {
          id: "mixed-session-1",
          user_id: "user-1",
          status: "paid",
          checkout_kind: "rental_deposit_only",
          currency_code: "THB",
          amount_total: 200,
          booking_deposit_total_amount: 200,
        },
      ],
    });
    await cancelCustomerRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
    });
    expect(db.payment_refunds[0]).toMatchObject({
      original_payment_source_type: "mixed_payment_allocation",
      original_mixed_payment_allocation_id: "alloc-1",
      gateway_charge_id: "chrg_mixed",
    });
  });

  it("resolves finalized mixed checkout attempt and session for a finalized booking-deposit allocation", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          booking_deposit_payment_attempt_id: null,
          booking_deposit_mixed_allocation_id: "alloc-finalized",
        }),
      ],
      rental_booking_payment_attempts: [],
      mixed_payment_allocations: [
        {
          id: "alloc-finalized",
          mixed_checkout_session_id: "mixed-session-finalized",
          rental_booking_id: "booking-1",
          mixed_payment_attempt_id: "mixed-attempt-finalized",
          user_id: "user-1",
          allocation_type: "booking_deposit",
          status: "finalized",
          amount: 200,
          currency_code: "THB",
          paid_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      mixed_payment_attempts: [
        {
          id: "mixed-attempt-finalized",
          mixed_checkout_session_id: "mixed-session-finalized",
          user_id: "user-1",
          gateway: "omise",
          status: "finalized",
          amount: 200,
          currency_code: "THB",
          gateway_charge_id: "chrg_finalized",
          gateway_source_id: "src_finalized",
        },
      ],
      mixed_checkout_sessions: [
        {
          id: "mixed-session-finalized",
          user_id: "user-1",
          status: "finalized",
          checkout_kind: "rental_deposit_only",
          currency_code: "THB",
          amount_total: 200,
          booking_deposit_total_amount: 200,
        },
      ],
    });
    await cancelCustomerRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
    });
    expect(db.payment_refunds[0]).toMatchObject({
      status: "pending_admin_review",
      refund_type: "rental_booking_deposit",
      original_payment_source_type: "mixed_payment_allocation",
      original_mixed_payment_allocation_id: "alloc-finalized",
      gateway_charge_id: "chrg_finalized",
    });
  });

  it("applies rental booking restriction when the rolling count crosses more than five", async () => {
    const db = seed({
      rental_booking_cancellation_events: [1, 2, 3, 4, 5].map(qualifyingEvent),
    });
    const result = await cancelCustomerRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
    });
    expect(result.restriction).toMatchObject({
      status: "restricted",
      count: 6,
    });
    expect(db.users[0]).toMatchObject({
      rental_booking_restriction_status: "restricted",
      rental_booking_restriction_cancellation_count: 6,
    });
  });

  it("rejects outside the Bangkok calendar-day refund cutoff without creating records", async () => {
    const db = seed();
    await expect(
      cancelCustomerRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
        body: validBody,
        now: new Date("2026-06-07T17:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      statusMessage: "CANCELLATION_REFUND_CUTOFF_PASSED",
    });
    expect(db.rental_booking_cancellation_events).toHaveLength(0);
    expect(db.payment_refunds).toHaveLength(0);
  });

  it.each([
    ["draft", "paid", "BOOKING_NOT_CONFIRMED"],
    ["confirmed", "unpaid", "BOOKING_DEPOSIT_NOT_PAID"],
    ["confirmed", "pending", "BOOKING_DEPOSIT_NOT_PAID"],
    ["confirmed", "expired", "BOOKING_DEPOSIT_NOT_PAID"],
    ["picked_up", "paid", "BOOKING_ALREADY_FULFILLED"],
    ["returned", "paid", "BOOKING_ALREADY_FULFILLED"],
  ])(
    "rejects invalid state %s / %s",
    async (status, depositStatus, message) => {
      const db = seed({
        rental_bookings: [
          booking({ status, booking_deposit_payment_status: depositStatus }),
        ],
      });
      await expect(
        cancelCustomerRentalBooking({
          client: client(db),
          bookingId: "booking-1",
          userId: "user-1",
          body: validBody,
          now: new Date("2026-06-07T16:00:00.000Z"),
        }),
      ).rejects.toMatchObject({ statusMessage: message });
    },
  );

  it("rejects booking owned by another user", async () => {
    await expect(
      cancelCustomerRentalBooking({
        client: client(seed()),
        bookingId: "booking-1",
        userId: "user-2",
        body: validBody,
        now: new Date("2026-06-07T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ statusMessage: "BOOKING_ACCESS_DENIED" });
  });

  it("treats a second request after success as idempotent-safe", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          status: "cancelled",
          cancellation_source_event_id: "event-1",
          cancelled_at: "2026-06-07T16:00:00.000Z",
        }),
      ],
      rental_booking_cancellation_events: [
        {
          id: "event-1",
          booking_id: "booking-1",
          user_id: "user-1",
          cancellation_initiator: "customer",
          cancellation_source: "customer_web",
          cancelled_at: "2026-06-07T16:00:00.000Z",
          pickup_date_snapshot: "2026-06-10",
          cancellation_local_date_snapshot: "2026-06-07",
          refund_cutoff_date_snapshot: "2026-06-07",
          refund_policy_version: "booking_deposit_refund_calendar_day_v1",
          refund_timezone: "Asia/Bangkok",
          refund_eligible: true,
          refund_amount_due: 200,
          qualifying_cancellation_count_after: 1,
          restriction_window_started_at: "2025-06-07T16:00:00.000Z",
        },
      ],
      payment_refunds: [
        {
          id: "refund-1",
          cancellation_event_id: "event-1",
          status: "pending_admin_review",
          refund_amount: 200,
          currency_code: "THB",
        },
      ],
    });
    const result = await cancelCustomerRentalBooking({
      client: client(db),
      bookingId: "booking-1",
      userId: "user-1",
      body: {},
      now: new Date("2026-06-07T16:00:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      alreadyCancelled: true,
      cancellationEventId: "event-1",
      documentIssueStatus: "available",
    });
    expect(db.rental_booking_cancellation_events).toHaveLength(1);
    expect(db.official_documents[0]).toMatchObject({
      document_type: "rental_booking_cancellation_confirmation",
      source_id: "event-1",
    });
  });

  it("keeps cancellation success truthful when post-transaction document issuance fails", async () => {
    const db = seed();
    const result = await cancelCustomerRentalBooking({
      client: client(db, {
        insertErrors: {
          official_documents: { message: "document insert failed" },
        },
      }),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      booking: { status: "cancelled" },
      refundRequest: { status: "pending_admin_review" },
      document: null,
      documentIssueStatus: "retryable",
    });
    expect(db.payment_refunds).toHaveLength(1);
  });

  it("maps the transactional RPC success path and issues the cancellation document", async () => {
    const db = seed();
    const rpcNames: string[] = [];
    const result = await cancelCustomerRentalBooking({
      client: client(db, {
        rpc: async (name) => {
          rpcNames.push(name);
          if (name === "f_next_document_number")
            return { data: "CXL-202606-0099", error: null };
          return {
            data: {
              ok: true,
              alreadyCancelled: false,
              booking: { ...booking(), status: "cancelled" },
              cancellationEvent: {
                id: "event-rpc-1",
                booking_id: "booking-1",
                cancelled_at: "2026-06-07T16:00:00.000Z",
                pickup_date_snapshot: "2026-06-10",
                refund_cutoff_date_snapshot: "2026-06-07",
                refund_eligible: true,
                refund_amount_due: 200,
              },
              refund: {
                id: "refund-rpc-1",
                status: "pending_admin_review",
                refund_amount: 200,
                currency_code: "THB",
              },
              restriction: {
                status: "none",
                count: 1,
                windowStartedAt: "2025-06-07T16:00:00.000Z",
              },
            },
            error: null,
          };
        },
      }),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
      preferTransactionalRpc: true,
    });
    expect(rpcNames).toContain(
      "f_cancel_customer_rental_booking_refund_request",
    );
    expect(result).toMatchObject({
      ok: true,
      refundRequest: { id: "refund-rpc-1" },
      document: { documentNo: "CXL-202606-0099" },
      documentIssueStatus: "available",
    });
  });

  it("reconciles a transactional RPC already-cancelled response by issuing the missing document", async () => {
    const db = seed({
      rental_booking_cancellation_events: [
        {
          id: "event-rpc-existing",
          booking_id: "booking-1",
          user_id: "user-1",
          cancellation_initiator: "customer",
          cancellation_source: "customer_web",
          cancelled_at: "2026-06-07T16:00:00.000Z",
          pickup_date_snapshot: "2026-06-10",
          cancellation_local_date_snapshot: "2026-06-07",
          refund_cutoff_date_snapshot: "2026-06-07",
          refund_policy_version: "booking_deposit_refund_calendar_day_v1",
          refund_timezone: "Asia/Bangkok",
          refund_eligible: true,
          refund_amount_due: 200,
          qualifying_cancellation_count_after: 1,
          restriction_window_started_at: "2025-06-07T16:00:00.000Z",
        },
      ],
      payment_refunds: [
        {
          id: "refund-rpc-existing",
          cancellation_event_id: "event-rpc-existing",
          status: "pending_admin_review",
          refund_amount: 200,
          currency_code: "THB",
        },
      ],
    });
    const result = await cancelCustomerRentalBooking({
      client: client(db, {
        rpc: async (name) =>
          name === "f_next_document_number"
            ? { data: "CXL-202606-0100", error: null }
            : {
                data: {
                  ok: true,
                  alreadyCancelled: true,
                  cancellationEventId: "event-rpc-existing",
                },
                error: null,
              },
      }),
      bookingId: "booking-1",
      userId: "user-1",
      body: validBody,
      now: new Date("2026-06-07T16:00:00.000Z"),
      preferTransactionalRpc: true,
    });
    expect(result).toMatchObject({
      ok: true,
      alreadyCancelled: true,
      cancellationEventId: "event-rpc-existing",
      document: { documentNo: "CXL-202606-0100" },
      documentIssueStatus: "available",
    });
  });

  it("maps known transactional RPC conflict errors to safe 409 responses", async () => {
    await expect(
      cancelCustomerRentalBooking({
        client: client(seed(), {
          rpc: async (name) =>
            name === "f_next_document_number"
              ? { data: "CXL-202606-0101", error: null }
              : {
                  data: null,
                  error: { message: "BOOKING_CANCELLATION_CONFLICT" },
                },
        }),
        bookingId: "booking-1",
        userId: "user-1",
        body: validBody,
        now: new Date("2026-06-07T16:00:00.000Z"),
        preferTransactionalRpc: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "BOOKING_CANCELLATION_CONFLICT",
    });
  });

  it("keeps database idempotency guards for duplicate customer cancellation/refund rows", () => {
    expect(migration082).toContain(
      "idx_rental_booking_cancellation_events_one_customer_web_per_booking",
    );
    expect(migration082).toContain(
      "idx_payment_refunds_one_booking_deposit_per_booking",
    );
    expect(migration082).toContain(
      "f_cancel_customer_rental_booking_refund_request",
    );
    expect(migration082).toContain("FOR UPDATE");
    expect(migration082).toContain("FROM public.users");
    expect(migration082).toContain("CANCELLATION_REFUND_CUTOFF_PASSED");
  });

  it("validates refund destination fields and confirmation checkbox", () => {
    expect(
      validateCustomerCancellationPayload({
        ...validBody,
        refundBankAccountNumber: "123-456 7890",
      }).refundBankAccountNumber,
    ).toBe("1234567890");
    expect(() =>
      validateCustomerCancellationPayload({
        ...validBody,
        refundBankName: " ",
      }),
    ).toThrow(/REFUND_BANK_NAME_REQUIRED/);
    expect(() =>
      validateCustomerCancellationPayload({
        ...validBody,
        refundBankAccountNumber: "abc",
      }),
    ).toThrow(/REFUND_BANK_ACCOUNT_NUMBER_INVALID/);
    expect(() =>
      validateCustomerCancellationPayload({
        ...validBody,
        refundBankAccountName: "",
      }),
    ).toThrow(/REFUND_BANK_ACCOUNT_NAME_REQUIRED/);
    expect(() =>
      validateCustomerCancellationPayload({
        ...validBody,
        refundContactPhone: "123",
      }),
    ).toThrow(/REFUND_CONTACT_PHONE_INVALID/);
    expect(() =>
      validateCustomerCancellationPayload({
        ...validBody,
        confirmRefundDestinationAccuracy: false,
      }),
    ).toThrow(/REFUND_DESTINATION_CONFIRMATION_REQUIRED/);
  });

  it("fails safely when a paid booking has no resolvable original payment source", async () => {
    const db = seed({ rental_booking_payment_attempts: [] });
    await expect(
      cancelCustomerRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
        body: validBody,
        now: new Date("2026-06-07T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
    });
    expect(db.rental_booking_cancellation_events).toHaveLength(0);
  });

  it("does not use a direct payment attempt that belongs to another booking/user", async () => {
    const db = seed({
      rental_bookings: [
        booking({ booking_deposit_payment_attempt_id: "attempt-wrong" }),
      ],
      rental_booking_payment_attempts: [
        {
          id: "attempt-wrong",
          booking_id: "booking-other",
          user_id: "user-other",
          gateway: "omise",
          status: "paid",
          amount: 200,
          currency_code: "THB",
          gateway_charge_id: "chrg_wrong",
          gateway_source_id: "src_wrong",
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    await expect(
      cancelCustomerRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
        body: validBody,
        now: new Date("2026-06-07T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
    });
  });

  it("does not use a mixed allocation unless it is a booking_deposit allocation", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          booking_deposit_payment_attempt_id: null,
          booking_deposit_mixed_allocation_id: "alloc-wrong-type",
        }),
      ],
      rental_booking_payment_attempts: [],
      mixed_payment_allocations: [
        {
          id: "alloc-wrong-type",
          mixed_checkout_session_id: "mixed-session-1",
          rental_booking_id: "booking-1",
          mixed_payment_attempt_id: "mixed-attempt-1",
          user_id: "user-1",
          allocation_type: "sale_product",
          status: "finalized",
          amount: 200,
          currency_code: "THB",
          paid_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      mixed_payment_attempts: [
        {
          id: "mixed-attempt-1",
          mixed_checkout_session_id: "mixed-session-1",
          user_id: "user-1",
          gateway: "omise",
          status: "paid",
          amount: 200,
          currency_code: "THB",
        },
      ],
    });
    await expect(
      cancelCustomerRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
        body: validBody,
        now: new Date("2026-06-07T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
    });
  });

  it("rejects a mixed booking-deposit allocation when the mixed payment attempt is not paid", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          booking_deposit_payment_attempt_id: null,
          booking_deposit_mixed_allocation_id: "alloc-1",
        }),
      ],
      rental_booking_payment_attempts: [],
      mixed_payment_allocations: [
        {
          id: "alloc-1",
          mixed_checkout_session_id: "mixed-session-1",
          rental_booking_id: "booking-1",
          mixed_payment_attempt_id: "mixed-attempt-1",
          user_id: "user-1",
          allocation_type: "booking_deposit",
          status: "finalized",
          amount: 200,
          currency_code: "THB",
          paid_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      mixed_payment_attempts: [
        {
          id: "mixed-attempt-1",
          mixed_checkout_session_id: "mixed-session-1",
          user_id: "user-1",
          gateway: "omise",
          status: "failed",
          amount: 200,
          currency_code: "THB",
        },
      ],
    });
    await expect(
      cancelCustomerRentalBooking({
        client: client(db),
        bookingId: "booking-1",
        userId: "user-1",
        body: validBody,
        now: new Date("2026-06-07T16:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      statusMessage: "ORIGINAL_PAYMENT_SOURCE_NOT_RESOLVED",
    });
  });
});
