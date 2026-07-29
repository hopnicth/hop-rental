import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertBookingCanBeMarkedNoShow,
  markRentalBookingNoShow,
} from "../../server/utils/rental-booking-no-show";
import {
  FORFEITURE_RECEIPT_DOCUMENT_TYPE,
  NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
  ensureNoShowForfeitureDocuments,
} from "../../server/utils/rental-booking-no-show-documents";
import { RENTAL_BOOKING_STATUS_TRANSITIONS } from "../../app/utils/admin-order-transitions";

type Row = Record<string, any>;

function baseBooking(overrides: Row = {}): Row {
  return {
    id: "booking-1",
    user_id: "user-1",
    walk_in_phone: null,
    status: "confirmed",
    asset_id: "asset-1",
    asset_code: "A-1",
    asset_name: "Camera",
    asset_thumbnail: null,
    product_id: "product-1",
    sku_id: "sku-1",
    product_name: "Camera",
    thumbnail: null,
    hub_id: "hub-1",
    hub_name: "HQ",
    start_date: "2026-06-10",
    end_date: "2026-06-12",
    rental_days: 2,
    pricing_model: "daily",
    currency_code: "THB",
    daily_rate: 100,
    weekly_rate: null,
    monthly_rate: null,
    rental_total: 200,
    deposit_amount: 500,
    deposit_paid_amount: 500,
    booking_deposit_paid_amount: 200,
    booking_deposit_payment_attempt_id: "attempt-1",
    booking_deposit_mixed_allocation_id: null,
    booking_deposit_policy_version: "fixed_booking_deposit_v1",
    booking_deposit_terms_accepted_at: "2026-06-01T00:00:00.000Z",
    booking_deposit_terms_version: "booking_deposit_terms_v1",
    deposit_payment_method: "qr_transfer",
    deposit_payment_status: "paid",
    deposit_refund_status: "not_refunded",
    deposit_refund_amount: 0,
    deposit_refund_notes: null,
    no_show_at: null,
    no_show_marked_by_user_id: null,
    no_show_reason: null,
    no_show_source_event_id: null,
    pricing_breakdown: {},
    booker_name: "Customer One",
    booker_phone: "0812345678",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    asset: { storage_branch_id: "branch-1", store_branches: null },
    ...overrides,
  };
}

function client(db: {
  rental_bookings: Row[];
  rental_booking_no_show_events: Row[];
  rental_booking_deposit_disposition_events: Row[];
  financial_recognition_events: Row[];
  rental_booking_deposit_agreements?: Row[];
  official_documents?: Row[];
  document_events?: Row[];
  system_configs?: Row[];
  branch_document_settings?: Row[];
  users: Row[];
  payment_refunds: Row[];
  _onDuplicateNoShowEvent?: () => void;
}) {
  return {
    rpc: async (_name: string, params: Row) => ({
      data: `${params.p_prefix}-${params.p_period}-0001`,
      error: null,
    }),
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let selectColumns = "";
      let insertPayload: Row | null = null;
      let updatePayload: Row | null = null;
      let deleteMode = false;
      const rows = () => ((db as any)[table] ??= []) as Row[];
      const matching = () =>
        rows().filter((row) => filters.every(([k, v]) => row[k] === v));
      const chain: any = {
        select: (columns = "") => {
          selectColumns = String(columns);
          return chain;
        },
        eq: (key: string, value: unknown) => (
          filters.push([key, value]),
          chain
        ),
        insert: (payload: Row) => {
          insertPayload = payload;
          return chain;
        },
        update: (payload: Row) => {
          updatePayload = payload;
          return chain;
        },
        delete: () => {
          deleteMode = true;
          return chain;
        },
        maybeSingle: async () => {
          if (
            table === "users" &&
            selectColumns
              .split(",")
              .map((column) => column.trim())
              .includes("email")
          ) {
            return {
              data: null,
              error: { message: "column users.email does not exist" },
            };
          }
          if (insertPayload) {
            if (
              table === "rental_booking_no_show_events" &&
              rows().some((r) => r.booking_id === insertPayload?.booking_id)
            ) {
              db._onDuplicateNoShowEvent?.();
              return {
                data: null,
                error: { code: "23505", message: "duplicate" },
              };
            }
            if (
              table === "rental_booking_deposit_disposition_events" &&
              rows().some(
                (r) =>
                  r.booking_id === insertPayload?.booking_id ||
                  r.no_show_event_id === insertPayload?.no_show_event_id,
              )
            ) {
              return {
                data: null,
                error: { code: "23505", message: "duplicate" },
              };
            }
            if (
              table === "financial_recognition_events" &&
              rows().some(
                (r) =>
                  r.source_type === insertPayload?.source_type &&
                  r.source_id === insertPayload?.source_id &&
                  r.recognition_type === insertPayload?.recognition_type,
              )
            ) {
              return {
                data: null,
                error: { code: "23505", message: "duplicate" },
              };
            }
            if (
              table === "official_documents" &&
              rows().some(
                (r) =>
                  r.source_type === insertPayload?.source_type &&
                  r.source_id === insertPayload?.source_id &&
                  r.document_type === insertPayload?.document_type &&
                  r.idempotency_key === insertPayload?.idempotency_key,
              )
            ) {
              return {
                data: null,
                error: { code: "23505", message: "duplicate" },
              };
            }
            const row = {
              id: `${table}-${rows().length + 1}`,
              created_at: "2026-06-12T00:00:00.000Z",
              updated_at: "2026-06-12T00:00:00.000Z",
              print_count: 0,
              last_printed_at: null,
              ...insertPayload,
            };
            rows().push(row);
            return { data: row, error: null };
          }
          if (updatePayload) {
            const found = matching()[0] ?? null;
            if (!found) return { data: null, error: null };
            Object.assign(found, updatePayload);
            return { data: found, error: null };
          }
          if (deleteMode) {
            const keep = rows().filter(
              (row) => !filters.every(([k, v]) => row[k] === v),
            );
            rows().splice(0, rows().length, ...keep);
            return { data: null, error: null };
          }
          return { data: matching()[0] ?? null, error: null };
        },
        then: (resolveFn: any) => resolveFn({ data: matching(), error: null }),
      };
      return chain;
    },
  };
}

function noShowChainDb(
  overrides: {
    booking?: Row;
    officialDocuments?: Row[];
  } = {},
) {
  return {
    rental_bookings: [
      baseBooking({
        status: "no_show",
        no_show_source_event_id: "no-show-1",
        ...overrides.booking,
      }),
    ],
    rental_booking_no_show_events: [
      {
        id: "no-show-1",
        booking_id: "booking-1",
        admin_user_id: "staff-1",
        marked_at: "2026-06-12T00:00:00.000Z",
        pickup_date_snapshot: "2026-06-10",
        deposit_outcome: "booking_deposit_forfeited_no_refund",
        reason: "customer did not arrive",
      },
    ],
    rental_booking_deposit_disposition_events: [
      {
        id: "disposition-1",
        booking_id: "booking-1",
        source_event_type: "no_show",
        no_show_event_id: "no-show-1",
        occurred_at: "2026-06-12T00:00:00.000Z",
        disposition: "forfeited",
        forfeited_amount: 200,
        currency_code: "THB",
        accepted_terms_version: "booking_deposit_terms_v1",
        terms_accepted_at: "2026-06-01T00:00:00.000Z",
        policy_version: "booking_deposit_forfeiture_no_show_v1",
      },
    ],
    financial_recognition_events: [
      {
        id: "recognition-1",
        recognition_type: "booking_deposit_forfeiture_income",
        source_type: "rental_booking_deposit_disposition_event",
        source_id: "disposition-1",
        booking_id: "booking-1",
        recognized_at: "2026-06-12T00:00:00.000Z",
        recognized_amount: 200,
        currency_code: "THB",
        revenue_category: "contractual_penalty_damage_deposit_forfeiture",
        tax_treatment: "non_vat_contractual_penalty",
        vat_rate: 0,
        vat_amount: 0,
        wht_treatment: "not_subject_to_wht",
        wht_rate: 0,
        wht_amount: 0,
        related_document_id: null,
      },
    ],
    rental_booking_deposit_agreements: [] as Row[],
    official_documents: overrides.officialDocuments ?? ([] as Row[]),
    document_events: [] as Row[],
    system_configs: [] as Row[],
    branch_document_settings: [] as Row[],
    users: [{ id: "user-1", full_name: "Customer One" }],
    payment_refunds: [] as Row[],
  };
}

function existingForfeitureReceipt(): Row {
  return {
    id: "receipt-existing",
    document_type: FORFEITURE_RECEIPT_DOCUMENT_TYPE,
    document_no: "BDFR-202606-0001",
    status: "issued",
    branch_id: "hub-1",
    source_type: "financial_recognition_event",
    source_id: "recognition-1",
    issued_at: "2026-06-12T00:00:00.000Z",
    subtotal: 200,
    vat_amount: 0,
    total_amount: 200,
    currency_code: "THB",
    template_key: `${FORFEITURE_RECEIPT_DOCUMENT_TYPE}_v1`,
    template_version: 1,
    snapshot: {},
    idempotency_key:
      "financial_recognition_event:recognition-1:booking_deposit_forfeiture_ordinary_receipt",
    print_count: 0,
    last_printed_at: null,
    created_at: "2026-06-12T00:00:00.000Z",
    updated_at: "2026-06-12T00:00:00.000Z",
  };
}

describe("rental booking no-show lifecycle", () => {
  it("marks overdue confirmed booking as no_show and records no-refund outcome", async () => {
    const db = {
      rental_bookings: [baseBooking()],
      rental_booking_no_show_events: [] as Row[],
      rental_booking_deposit_disposition_events: [] as Row[],
      financial_recognition_events: [] as Row[],
      rental_booking_deposit_agreements: [
        {
          id: "agreement-1",
          booking_id: "booking-1",
          agreement_version_id: "agreement-version-1",
          agreement_acceptance_log_id: "acceptance-1",
          accepted_terms_version: "booking_deposit_terms_v1",
          accepted_at: "2026-06-01T00:00:00.000Z",
          content_hash: "hash-1",
          rendered_text_hash: "rendered-1",
        },
      ],
      official_documents: [] as Row[],
      document_events: [] as Row[],
      system_configs: [] as Row[],
      branch_document_settings: [] as Row[],
      users: [
        { id: "user-1", full_name: "Customer One", email: "c@example.com" },
      ],
      payment_refunds: [] as Row[],
    };

    const result = await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      reason: "customer did not arrive",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(result.status).toBe("no_show");
    expect(db.rental_bookings[0]).toMatchObject({
      status: "no_show",
      deposit_refund_status: "forfeited",
      deposit_refund_amount: 0,
      no_show_marked_by_user_id: "staff-1",
      no_show_reason: "customer did not arrive",
    });
    expect(db.rental_booking_no_show_events[0]).toMatchObject({
      booking_id: "booking-1",
      admin_user_id: "staff-1",
      pickup_date_snapshot: "2026-06-10",
      deposit_outcome: "booking_deposit_forfeited_no_refund",
    });
    expect(db.rental_booking_deposit_disposition_events[0]).toMatchObject({
      booking_id: "booking-1",
      source_event_type: "no_show",
      no_show_event_id: "rental_booking_no_show_events-1",
      disposition: "forfeited",
      forfeited_amount: 200,
      accepted_terms_version: "booking_deposit_terms_v1",
    });
    expect(db.financial_recognition_events[0]).toMatchObject({
      recognition_type: "booking_deposit_forfeiture_income",
      source_type: "rental_booking_deposit_disposition_event",
      source_id: "rental_booking_deposit_disposition_events-1",
      recognized_amount: 200,
      tax_treatment: "non_vat_contractual_penalty",
      vat_amount: 0,
      wht_amount: 0,
    });
    const receipt = db.official_documents.find(
      (doc) => doc.document_type === FORFEITURE_RECEIPT_DOCUMENT_TYPE,
    );
    const notice = db.official_documents.find(
      (doc) => doc.document_type === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
    );
    expect(receipt).toMatchObject({
      source_type: "financial_recognition_event",
      source_id: "financial_recognition_events-1",
      subtotal: 200,
      vat_amount: 0,
      total_amount: 200,
      currency_code: "THB",
      idempotency_key:
        "financial_recognition_event:financial_recognition_events-1:booking_deposit_forfeiture_ordinary_receipt",
    });
    expect(receipt?.snapshot.financial_recognition).toMatchObject({
      financial_recognition_event_id: "financial_recognition_events-1",
      tax_treatment: "non_vat_contractual_penalty",
      vat_rate: 0,
      vat_amount: 0,
      wht_treatment: "not_subject_to_wht",
      wht_rate: 0,
      wht_amount: 0,
      is_tax_invoice: false,
      tax_invoice_convertible: false,
    });
    expect(receipt?.snapshot.tax).toMatchObject({
      is_tax_invoice: false,
      tax_invoice_convertible: false,
    });
    expect(receipt?.snapshot.customer).toMatchObject({ email: null });
    expect(notice).toMatchObject({
      source_type: "rental_booking_no_show_event",
      source_id: "rental_booking_no_show_events-1",
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      idempotency_key:
        "rental_booking_no_show_event:rental_booking_no_show_events-1:rental_booking_no_show_forfeiture_notice",
    });
    expect(notice?.snapshot.no_show).toMatchObject({
      rental_booking_no_show_event_id: "rental_booking_no_show_events-1",
      pickup_date_snapshot: "2026-06-10",
    });
    expect(notice?.snapshot.deposit_disposition).toMatchObject({
      rental_booking_deposit_disposition_event_id:
        "rental_booking_deposit_disposition_events-1",
      forfeited_amount: 200,
    });
    expect(notice?.snapshot.financial_recognition).toMatchObject({
      financial_recognition_event_id: "financial_recognition_events-1",
      recognized_amount: 200,
      tax_treatment: "non_vat_contractual_penalty",
    });
    expect(notice?.snapshot.terms).toMatchObject({
      resolution_source: "rental_booking_deposit_agreement",
      agreement_version_id: "agreement-version-1",
      agreement_acceptance_log_id: "acceptance-1",
      fallback_used: true,
    });
    expect(notice?.snapshot.customer).toMatchObject({ email: null });
    expect(db.financial_recognition_events[0].related_document_id).toBe(
      receipt?.id,
    );
    expect(db.document_events).toHaveLength(2);
    expect(db.payment_refunds).toHaveLength(0);
  });

  it("repairs missing no-show forfeiture documents idempotently", async () => {
    const db = {
      rental_bookings: [
        baseBooking({
          status: "no_show",
          no_show_source_event_id: "no-show-1",
        }),
      ],
      rental_booking_no_show_events: [
        {
          id: "no-show-1",
          booking_id: "booking-1",
          admin_user_id: "staff-1",
          marked_at: "2026-06-12T00:00:00.000Z",
          pickup_date_snapshot: "2026-06-10",
          deposit_outcome: "booking_deposit_forfeited_no_refund",
          reason: "customer did not arrive",
        },
      ],
      rental_booking_deposit_disposition_events: [
        {
          id: "disposition-1",
          booking_id: "booking-1",
          source_event_type: "no_show",
          no_show_event_id: "no-show-1",
          occurred_at: "2026-06-12T00:00:00.000Z",
          disposition: "forfeited",
          forfeited_amount: 200,
          currency_code: "THB",
          agreement_version_id: "agreement-version-1",
          agreement_acceptance_log_id: "acceptance-1",
          accepted_terms_version: "booking_deposit_terms_v1",
          terms_accepted_at: "2026-06-01T00:00:00.000Z",
          policy_version: "booking_deposit_forfeiture_no_show_v1",
        },
      ],
      financial_recognition_events: [
        {
          id: "recognition-1",
          recognition_type: "booking_deposit_forfeiture_income",
          source_type: "rental_booking_deposit_disposition_event",
          source_id: "disposition-1",
          booking_id: "booking-1",
          recognized_at: "2026-06-12T00:00:00.000Z",
          recognized_amount: 200,
          currency_code: "THB",
          revenue_category: "contractual_penalty_damage_deposit_forfeiture",
          tax_treatment: "non_vat_contractual_penalty",
          vat_rate: 0,
          vat_amount: 0,
          wht_treatment: "not_subject_to_wht",
          wht_rate: 0,
          wht_amount: 0,
          related_document_id: null,
        },
      ],
      rental_booking_deposit_agreements: [] as Row[],
      official_documents: [] as Row[],
      document_events: [] as Row[],
      system_configs: [] as Row[],
      branch_document_settings: [] as Row[],
      users: [{ id: "user-1", full_name: "Customer One" }],
      payment_refunds: [] as Row[],
    };
    const first = await ensureNoShowForfeitureDocuments({
      client: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
    });
    const second = await ensureNoShowForfeitureDocuments({
      client: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
    });
    expect(first.receipt.alreadyIssued).toBe(false);
    expect(second.receipt.alreadyIssued).toBe(true);
    expect(second.notice.alreadyIssued).toBe(true);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === FORFEITURE_RECEIPT_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
  });

  it("repair issuance rejects bookings without a valid no-show chain", async () => {
    const db = {
      rental_bookings: [baseBooking({ status: "confirmed" })],
      rental_booking_no_show_events: [] as Row[],
      rental_booking_deposit_disposition_events: [] as Row[],
      financial_recognition_events: [] as Row[],
      rental_booking_deposit_agreements: [] as Row[],
      official_documents: [] as Row[],
      document_events: [] as Row[],
      system_configs: [] as Row[],
      branch_document_settings: [] as Row[],
      users: [] as Row[],
      payment_refunds: [] as Row[],
    };
    await expect(
      ensureNoShowForfeitureDocuments({
        client: client(db),
        bookingId: "booking-1",
        adminUserId: "staff-1",
      }),
    ).rejects.toMatchObject({ statusMessage: "BOOKING_NOT_NO_SHOW" });
    db.rental_bookings[0].status = "no_show";
    await expect(
      ensureNoShowForfeitureDocuments({
        client: client(db),
        bookingId: "booking-1",
        adminUserId: "staff-1",
      }),
    ).rejects.toMatchObject({ statusMessage: "NO_SHOW_EVENT_NOT_FOUND" });
  });

  it("rejects future/today pickup dates using Bangkok calendar day", () => {
    expect(() =>
      assertBookingCanBeMarkedNoShow({
        booking: baseBooking({ start_date: "2026-06-10" }),
        now: new Date("2026-06-09T17:00:00.000Z"),
      }),
    ).toThrow(/BOOKING_PICKUP_DATE_NOT_PASSED/);
  });

  it.each(["picked_up", "returned", "cancelled", "draft"])(
    "rejects %s booking",
    async (status) => {
      const db = {
        rental_bookings: [baseBooking({ status })],
        rental_booking_no_show_events: [] as Row[],
        rental_booking_deposit_disposition_events: [] as Row[],
        financial_recognition_events: [] as Row[],
        users: [] as Row[],
        payment_refunds: [] as Row[],
      };
      await expect(
        markRentalBookingNoShow({
          adminClient: client(db),
          bookingId: "booking-1",
          adminUserId: "staff-1",
          now: new Date("2026-06-12T00:00:00.000Z"),
        }),
      ).rejects.toMatchObject({
        statusMessage: "BOOKING_NOT_CONFIRMED_FOR_NO_SHOW",
      });
    },
  );

  it("self-heals missing documents when already no_show mark flow is re-entered", async () => {
    const db = noShowChainDb();

    const result = await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(result.status).toBe("no_show");
    expect(db.rental_booking_no_show_events).toHaveLength(1);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === FORFEITURE_RECEIPT_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
  });

  it("keeps already no_show mark re-entry document issuance idempotent", async () => {
    const db = noShowChainDb();

    await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });
    await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === FORFEITURE_RECEIPT_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
    expect(db.document_events).toHaveLength(2);
  });

  it("issues only the missing no-show document on already no_show re-entry", async () => {
    const existingReceipt = existingForfeitureReceipt();
    const db = noShowChainDb({ officialDocuments: [existingReceipt] });

    await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });

    const receipts = db.official_documents.filter(
      (doc) => doc.document_type === FORFEITURE_RECEIPT_DOCUMENT_TYPE,
    );
    const notices = db.official_documents.filter(
      (doc) => doc.document_type === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0].id).toBe(existingReceipt.id);
    expect(notices).toHaveLength(1);
    expect(db.financial_recognition_events[0].related_document_id).toBe(
      existingReceipt.id,
    );
  });

  it("self-heals documents on no-show event retry conflict after booking is no_show", async () => {
    const db = noShowChainDb({ booking: { status: "confirmed" } });
    (
      db as typeof db & { _onDuplicateNoShowEvent?: () => void }
    )._onDuplicateNoShowEvent = () => {
      db.rental_bookings[0].status = "no_show";
    };

    const result = await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });

    expect(result.status).toBe("no_show");
    expect(db.rental_booking_no_show_events).toHaveLength(1);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === FORFEITURE_RECEIPT_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
    expect(
      db.official_documents.filter(
        (doc) => doc.document_type === NO_SHOW_FORFEITURE_NOTICE_DOCUMENT_TYPE,
      ),
    ).toHaveLength(1);
  });

  it("rejects already no_show booking without a valid event chain", async () => {
    const db = {
      rental_bookings: [baseBooking({ status: "no_show" })],
      rental_booking_no_show_events: [] as Row[],
      rental_booking_deposit_disposition_events: [] as Row[],
      financial_recognition_events: [] as Row[],
      users: [] as Row[],
      payment_refunds: [] as Row[],
    };
    await expect(
      markRentalBookingNoShow({
        adminClient: client(db),
        bookingId: "booking-1",
        adminUserId: "staff-1",
        now: new Date("2026-06-12T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ statusMessage: "NO_SHOW_EVENT_NOT_FOUND" });
    expect(db.rental_booking_no_show_events).toHaveLength(0);
  });

  it("keeps no_show out of generic status patch transitions", () => {
    expect(RENTAL_BOOKING_STATUS_TRANSITIONS.confirmed).not.toContain(
      "no_show",
    );
    expect(RENTAL_BOOKING_STATUS_TRANSITIONS.no_show).toEqual([]);
  });

  it("adds database idempotency guards for disposition and recognition events", () => {
    const source = readFileSync(
      resolve(
        "supabase/migrations/085_booking_deposit_terms_forfeiture_event_chain.sql",
      ),
      "utf8",
    );
    expect(source).toContain("booking_deposit_terms");
    expect(source).toContain("rental_booking_deposit_disposition_events");
    expect(source).toContain("financial_recognition_events");
    expect(source).toContain("idx_booking_deposit_disposition_one_per_booking");
    expect(source).toContain("idx_financial_recognition_source_type");
    expect(source).toContain("non_vat_contractual_penalty");
    expect(source).toContain("not_subject_to_wht");
  });

  it("admin endpoint requires platform admin authorization", () => {
    const source = readFileSync(
      resolve("server/api/admin/rental-bookings/[id]/mark-no-show.post.ts"),
      "utf8",
    );
    const repairSource = readFileSync(
      resolve(
        "server/api/admin/rental-bookings/[id]/no-show-documents/issue.post.ts",
      ),
      "utf8",
    );
    expect(source).toContain("requirePlatformAdmin");
    expect(source).toContain("markRentalBookingNoShow");
    expect(repairSource).toContain("requirePlatformAdmin");
    expect(repairSource).toContain("ensureNoShowForfeitureDocuments");
    expect(repairSource).toContain('getRouterParam(event, "id")');
  });

  it("keeps forfeiture receipt out of tax invoice conversion paths", () => {
    const utility = readFileSync(
      resolve("server/utils/rental-booking-no-show-documents.ts"),
      "utf8",
    );
    expect(utility).toContain("BDFR");
    expect(utility).toContain("NSFN");
    expect(utility).toContain("tax_invoice_convertible: false");
    expect(utility).not.toContain("tax_invoice_requests");
    expect(utility).not.toContain("advance_tax_invoice");
    expect(utility).not.toContain("abbreviated_tax_invoice");
  });

  it("does not query non-existent public users email for no-show documents", () => {
    const utility = readFileSync(
      resolve("server/utils/rental-booking-no-show-documents.ts"),
      "utf8",
    );
    expect(utility).not.toContain("full_name, email");
    expect(utility).not.toContain("email, phone");
    expect(utility).toContain("id, full_name, phone");
  });

  it("admin detail page exposes only the dedicated no-show action for overdue confirmed bookings", () => {
    const source = readFileSync(
      resolve("app/pages/admin/rental-bookings/[id].vue"),
      "utf8",
    );
    expect(source).toContain("isOverdueConfirmed");
    expect(source).toContain(
      "Pickup date has passed and this booking is still confirmed",
    );
    expect(source).toContain("/mark-no-show");
    expect(source).toContain("Mark as No-show");
  });

  it("customer detail page renders no-show state without refund/proof actions", () => {
    const source = readFileSync(
      resolve("app/pages/user/rentals/[bookingId].vue"),
      "utf8",
    );
    expect(source).toContain('detail.value?.booking.status === "no_show"');
    expect(source).toContain("noShowRefundTitle");
    expect(source).toContain("noShowRefundDesc");
    expect(source).toContain("!hasCancelled && !hasNoShow");
    expect(source).toContain('v-else-if="canCancel"');
  });
});

// ── T2: manual no-show writes the held-balance FORFEITURE event ───────────────

describe("no-show held-balance forfeiture (T2, §b addendum item 2)", () => {
  it("writes a ledger forfeiture for the FULL held total (ledger-derived), idempotent on the no-show event id", async () => {
    const db: any = {
      rental_bookings: [baseBooking()],
      rental_booking_no_show_events: [] as Row[],
      rental_booking_deposit_disposition_events: [] as Row[],
      financial_recognition_events: [] as Row[],
      rental_held_balance_events: [
        {
          rental_booking_id: "booking-1",
          event_type: "booking_deposit_collection",
          amount: 200,
          currency_code: "THB",
          status: "posted",
        },
      ],
      official_documents: [] as Row[],
      document_events: [] as Row[],
      system_configs: [] as Row[],
      branch_document_settings: [] as Row[],
      users: [{ id: "user-1", full_name: "Customer One" }],
      payment_refunds: [] as Row[],
    };
    await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      reason: "customer did not arrive",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });
    const forfeitures = db.rental_held_balance_events.filter(
      (e: Row) => e.event_type === "forfeiture",
    );
    expect(forfeitures).toHaveLength(1);
    expect(forfeitures[0]).toMatchObject({
      amount: 200,
      source_type: "no_show_forfeiture",
      status: "posted",
    });
    expect(String(forfeitures[0].idempotency_key)).toMatch(/^no-show-forfeiture-/);
  });

  it("skips the ledger event when nothing is held (legacy booking, empty ledger)", async () => {
    const db: any = {
      rental_bookings: [baseBooking()],
      rental_booking_no_show_events: [] as Row[],
      rental_booking_deposit_disposition_events: [] as Row[],
      financial_recognition_events: [] as Row[],
      rental_held_balance_events: [] as Row[],
      official_documents: [] as Row[],
      document_events: [] as Row[],
      system_configs: [] as Row[],
      branch_document_settings: [] as Row[],
      users: [{ id: "user-1", full_name: "Customer One" }],
      payment_refunds: [] as Row[],
    };
    await markRentalBookingNoShow({
      adminClient: client(db),
      bookingId: "booking-1",
      adminUserId: "staff-1",
      reason: "no ledger",
      now: new Date("2026-06-12T00:00:00.000Z"),
    });
    expect(
      db.rental_held_balance_events.filter((e: Row) => e.event_type === "forfeiture"),
    ).toHaveLength(0);
  });
});

// ── [batch-1, CHiP 2026-07-27] AUTO-CANCEL ONLY at launch ────────────────────
// The manual no-show path is deposit-era machinery: it forfeits a deposit,
// recognises the forfeiture as income, and issues two numbered CUSTOMER-VISIBLE
// forfeiture documents. On a launch booking all of that is fiction, so the path
// is GATED — endpoint and button — rather than restructured. Nothing can reach
// the writer while deposits are off, and the deposit-era code stays intact.
describe("[batch-1] manual no-show is gated to the deposit era", () => {
  const readSrc = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8");
  const endpoint = readSrc(
    "server/api/admin/rental-bookings/[id]/mark-no-show.post.ts",
  );
  const page = readSrc("app/pages/admin/rental-bookings/[id].vue");
  const detailEndpoint = readSrc(
    "server/api/admin/rental-bookings/[id].get.ts",
  );

  it("the endpoint refuses while deposits are off, and fails closed", () => {
    expect(endpoint).toContain('adminClient.rpc("f_deposits_enabled")');
    // Strict !== true: an rpc error, a null, or any non-boolean refuses.
    expect(endpoint).toContain("depositsEnabled !== true");
    expect(endpoint).toContain("NO_SHOW_DISABLED_DEPOSITS_OFF");
  });

  it("the refusal is a 409, not a silent no-op", () => {
    const guard = endpoint.slice(endpoint.indexOf("depositsEnabled !== true"));
    expect(guard).toContain("statusCode: 409");
  });

  it("the admin button is hidden behind the SERVER flag, not a client guess", () => {
    // Whitespace-insensitive: the call is prettier-wrapped across lines.
    expect(detailEndpoint.replace(/\s+/g, " ")).toContain(
      'adminClient.rpc( "f_deposits_enabled", )',
    );
    expect(detailEndpoint).toContain("depositsEnabled: depositsEnabled === true");
    expect(page).toContain("booking.value?.depositsEnabled === true");
    // Both render sites and the action itself go through the same predicate.
    expect(page).not.toContain('v-if="isOverdueConfirmed"');
    expect((page.match(/v-if="canMarkNoShow"/g) || []).length).toBe(2);
    expect(page).toContain("!canMarkNoShow.value || markingNoShow.value");
  });

  it("HIDE-NOT-DELETE: the deposit-era path and its markup are preserved", () => {
    // The util keeps its writer, the endpoint keeps calling it, and the button
    // markup survives — revival is a config flip, not a rebuild.
    expect(endpoint).toContain("markRentalBookingNoShow");
    expect(page).toContain("markNoShow");
    const util = readSrc("server/utils/rental-booking-no-show.ts");
    expect(util).toContain("rental_booking_deposit_disposition_events");
    expect(util).toContain("financial_recognition_events");
  });

  it("the parked deposit revenue vocabulary is untouched (do-not-sweep)", () => {
    const util = readSrc("server/utils/rental-booking-no-show.ts");
    expect(util).toContain("contractual_penalty_damage_deposit_forfeiture");
    expect(util).toContain("non_vat_contractual_penalty");
  });
});
