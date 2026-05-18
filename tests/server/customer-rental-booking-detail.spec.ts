import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCustomerRefundProofAccess,
  getCustomerRentalBookingDetail,
  issueCustomerRentalDocument,
  listCustomerRefundTrackingStatuses,
  loadCustomerOfficialDocument,
} from "../../server/utils/customer-rental-booking-detail";

type Row = Record<string, unknown>;

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row | null = null;
  private orderKey: string | null = null;
  private asc = true;
  private max: number | null = null;
  constructor(
    private db: Record<string, Row[]>,
    private table: string,
  ) {}
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  order(key: string, options?: { ascending?: boolean }) {
    this.orderKey = key;
    this.asc = options?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  insert(payload: Row) {
    this.payload = payload;
    return this;
  }
  private rows() {
    let rows = [...(this.db[this.table] ?? [])].filter((row) =>
      this.filters.every((fn) => fn(row)),
    );
    if (this.orderKey)
      rows = rows.sort(
        (a, b) =>
          String(a[this.orderKey!]).localeCompare(String(b[this.orderKey!])) *
          (this.asc ? 1 : -1),
      );
    return this.max === null ? rows : rows.slice(0, this.max);
  }
  async maybeSingle() {
    if (this.payload) {
      const row = {
        id: `${this.table}-${(this.db[this.table] ?? []).length + 1}`,
        print_count: 0,
        last_printed_at: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        ...this.payload,
      };
      this.db[this.table] ??= [];
      this.db[this.table].push(row);
      return { data: row, error: null };
    }
    return { data: this.rows()[0] ?? null, error: null };
  }
  then(resolve: (value: { data: Row[]; error: null }) => void) {
    resolve({ data: this.rows(), error: null });
  }
}

function booking(overrides: Row = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "confirmed",
    product_name: "Camera",
    asset_code: "CAM-1",
    start_date: "2026-06-10",
    end_date: "2026-06-13",
    rental_days: 3,
    hub_id: "branch-1",
    hub_name: "Bangkok",
    booker_name: "Customer",
    booker_phone: "0812345678",
    rental_total: 900,
    deposit_amount: 5000,
    currency_code: "THB",
    booking_deposit_payment_status: "paid",
    booking_deposit_paid_amount: 200,
    booking_deposit_paid_at: "2026-06-01T00:00:00.000Z",
    booking_deposit_payment_attempt_id: "attempt-1",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function seed(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    rental_bookings: [booking()],
    rental_booking_no_show_events: [],
    rental_booking_deposit_disposition_events: [],
    financial_recognition_events: [],
    rental_booking_payment_attempts: [
      {
        id: "attempt-1",
        booking_id: "booking-1",
        method: "promptpay",
        status: "paid",
        amount: 200,
        currency_code: "THB",
        gateway_charge_id: "chrg_1",
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ],
    rental_booking_cancellation_events: [],
    payment_refunds: [],
    official_documents: [],
    document_events: [],
    system_configs: [],
    branch_document_settings: [],
    ...overrides,
  } as Record<string, Row[]>;
}

function client(db: Record<string, Row[]>) {
  return {
    from: (table: string) => new Chain(db, table),
    rpc: async (_name: string, params: Row) => ({
      data: `${params.p_prefix}-${params.p_period}-0001`,
      error: null,
    }),
  };
}
function clientWithStorage(db: Record<string, Row[]>) {
  return {
    ...client(db),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => ({
          data: {
            signedUrl: `https://signed.example/${bucket}/${path}?ttl=${ttl}`,
          },
          error: null,
        }),
      }),
    },
  };
}

describe("customer rental booking detail and documents", () => {
  it("loads customer-safe detail for the booking owner", async () => {
    const detail = await getCustomerRentalBookingDetail(
      client(seed()) as any,
      "booking-1",
      "user-1",
      new Date("2026-06-07T16:00:00.000Z"),
    );
    expect(detail.booking).toMatchObject({
      id: "booking-1",
      itemName: "Camera",
      qrValue: "booking:booking-1",
    });
    expect(detail.money).toMatchObject({
      bookingDepositPaid: 200,
      rentalFeeDueAtPickup: 900,
      remainingRefundableSecurityDepositDueAtPickup: 4800,
      totalDueAtPickup: 5700,
    });
    expect(detail.eligibility?.eligible).toBe(true);
  });

  it("blocks non-owner access", async () => {
    await expect(
      getCustomerRentalBookingDetail(
        client(seed()) as any,
        "booking-1",
        "user-2",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("shows cancelled refund pending state and cancellation document", async () => {
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
          refund_eligible: true,
          refund_amount_due: 200,
          refund_cutoff_date_snapshot: "2026-06-07",
        },
      ],
      payment_refunds: [
        {
          id: "refund-1",
          cancellation_event_id: "event-1",
          status: "pending_admin_review",
          refund_amount: 200,
          currency_code: "THB",
          requested_at: "2026-06-07T16:00:00.000Z",
        },
      ],
      official_documents: [
        {
          id: "doc-refund-early",
          source_type: "payment_refund",
          source_id: "refund-1",
          document_type: "rental_booking_deposit_refund_confirmation",
          status: "issued",
          document_no: "RF-early",
          issued_at: "2026-06-07T16:00:00.000Z",
        },
        {
          id: "doc-cxl",
          document_type: "rental_booking_cancellation_confirmation",
          document_no: "CXL-1",
          status: "issued",
          source_type: "rental_booking_cancellation_event",
          source_id: "event-1",
          issued_at: "2026-06-07T16:01:00.000Z",
          template_key: "x",
          template_version: 1,
          snapshot: {},
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          currency_code: "THB",
          print_count: 0,
          last_printed_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const detail = await getCustomerRentalBookingDetail(
      client(db) as any,
      "booking-1",
      "user-1",
    );
    expect(detail.refundRequest).toMatchObject({
      status: "pending_admin_review",
      amount: 200,
    });
    expect(detail.documents.cancellationConfirmation).toMatchObject({
      id: "doc-cxl",
    });
    expect(detail.documents.refundConfirmation).toBeNull();
  });

  it("exposes customer-safe refund proof metadata without raw storage fields", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          status: "cancelled",
          cancellation_source_event_id: "event-1",
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
          refund_eligible: true,
          refund_amount_due: 200,
        },
      ],
      payment_refunds: [
        {
          id: "refund-1",
          booking_id: "booking-1",
          user_id: "user-1",
          cancellation_event_id: "event-1",
          refund_type: "rental_booking_deposit",
          status: "refunded",
          refund_amount: 200,
          currency_code: "THB",
          refund_proof_id: "proof-1",
          requested_at: "2026-06-07T16:00:00.000Z",
          refunded_at: "2026-06-08T00:00:00.000Z",
        },
      ],
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          created_at: "2026-06-08T00:00:00.000Z",
        },
      ],
      official_documents: [
        {
          id: "doc-refund",
          source_type: "payment_refund",
          source_id: "refund-1",
          document_type: "rental_booking_deposit_refund_confirmation",
          status: "issued",
          document_no: "RF-1",
          issued_at: "2026-06-08T00:00:00.000Z",
        },
      ],
    });
    const detail = await getCustomerRentalBookingDetail(
      client(db) as any,
      "booking-1",
      "user-1",
    );
    expect(detail.refundProof).toMatchObject({
      exists: true,
      id: "proof-1",
      mimeType: "image/jpeg",
    });
    expect(detail.documents.refundConfirmation).toMatchObject({
      id: "doc-refund",
    });
    expect(JSON.stringify(detail.refundProof)).not.toContain("storage_path");
    expect(JSON.stringify(detail.refundProof)).not.toContain("deposit-proofs");
  });

  it("returns signed refund proof URL only for the booking owner", async () => {
    const db = seed({
      payment_refunds: [
        {
          id: "refund-1",
          booking_id: "booking-1",
          user_id: "user-1",
          refund_type: "rental_booking_deposit",
          refund_proof_id: "proof-1",
          requested_at: "2026-06-07T16:00:00.000Z",
        },
      ],
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          created_at: "2026-06-08T00:00:00.000Z",
        },
      ],
    });
    const own = await getCustomerRefundProofAccess({
      client: clientWithStorage(db) as any,
      bookingId: "booking-1",
      userId: "user-1",
    });
    expect(own.signedUrl).toContain("https://signed.example/catalog-media/");
    expect(own.proof).toMatchObject({ exists: true, id: "proof-1" });
    await expect(
      getCustomerRefundProofAccess({
        client: clientWithStorage(db) as any,
        bookingId: "booking-1",
        userId: "user-2",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lists customer refund tracking history without leaking proof storage", async () => {
    const db = seed({
      rental_bookings: [
        booking({
          status: "cancelled",
          cancellation_source_event_id: "event-1",
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
          refund_eligible: true,
          refund_amount_due: 200,
        },
      ],
      payment_refunds: [
        {
          id: "refund-1",
          booking_id: "booking-1",
          user_id: "user-1",
          cancellation_event_id: "event-1",
          refund_type: "rental_booking_deposit",
          status: "refunded",
          refund_amount: 200,
          currency_code: "THB",
          refund_proof_id: "proof-1",
          requested_at: "2026-06-07T16:00:00.000Z",
          refunded_at: "2026-06-08T00:00:00.000Z",
        },
      ],
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
        },
      ],
      official_documents: [
        {
          id: "doc-cxl",
          source_type: "rental_booking_cancellation_event",
          source_id: "event-1",
          document_type: "rental_booking_cancellation_confirmation",
          status: "issued",
          document_no: "CXL-1",
          issued_at: "2026-06-07T16:00:00.000Z",
        },
        {
          id: "doc-refund",
          source_type: "payment_refund",
          source_id: "refund-1",
          document_type: "rental_booking_deposit_refund_confirmation",
          status: "issued",
          document_no: "RF-1",
          issued_at: "2026-06-08T00:00:00.000Z",
        },
      ],
    });
    const result = await listCustomerRefundTrackingStatuses({
      client: client(db) as any,
      bookingIds: ["booking-1"],
      userId: "user-1",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      bookingId: "booking-1",
      refundRequest: { status: "refunded" },
      documents: {
        cancellationConfirmation: { id: "doc-cxl" },
        refundConfirmation: { id: "doc-refund" },
      },
      refundProof: { exists: true },
    });
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("storage_path");
    expect(payload).not.toContain("storage_bucket");
    expect(payload).not.toContain("deposit-proofs");
    const otherUser = await listCustomerRefundTrackingStatuses({
      client: client(db) as any,
      bookingIds: ["booking-1"],
      userId: "user-2",
    });
    expect(otherUser.items).toEqual([]);
  });

  it("issues booking and Booking Deposit Payment confirmation documents idempotently", async () => {
    const db = seed();
    const first = await issueCustomerRentalDocument({
      client: client(db) as any,
      bookingId: "booking-1",
      userId: "user-1",
      documentType: "rental_booking_confirmation",
    });
    const second = await issueCustomerRentalDocument({
      client: client(db) as any,
      bookingId: "booking-1",
      userId: "user-1",
      documentType: "rental_booking_confirmation",
    });
    const payment = await issueCustomerRentalDocument({
      client: client(db) as any,
      bookingId: "booking-1",
      userId: "user-1",
      documentType: "rental_booking_deposit_payment_confirmation",
    });
    expect(first.alreadyIssued).toBe(false);
    expect(second.alreadyIssued).toBe(true);
    expect(payment.document.documentType).toBe(
      "rental_booking_deposit_payment_confirmation",
    );
    expect(
      db.official_documents.filter(
        (d) => d.document_type === "rental_booking_confirmation",
      ),
    ).toHaveLength(1);
  });

  it("customer document access enforces ownership and serves stored snapshot", async () => {
    const db = seed({
      official_documents: [
        {
          id: "doc-1",
          document_type: "rental_booking_confirmation",
          document_no: "RBK-1",
          status: "issued",
          source_type: "rental_booking",
          source_id: "booking-1",
          customer_user_id: "user-1",
          issued_at: "2026-06-01T00:00:00.000Z",
          template_key: "x",
          template_version: 1,
          snapshot: { frozen: true, booking: { itemName: "OLD" } },
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          currency_code: "THB",
          print_count: 0,
          last_printed_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const doc = await loadCustomerOfficialDocument(
      client(db) as any,
      "doc-1",
      "user-1",
    );
    expect(doc.snapshot).toMatchObject({ frozen: true });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-1", "user-2"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("exposes and authorizes no-show forfeiture documents by source traversal", async () => {
    const db = seed({
      rental_bookings: [
        booking({ status: "no_show", no_show_source_event_id: "no-show-1" }),
      ],
      rental_booking_no_show_events: [
        { id: "no-show-1", booking_id: "booking-1", marked_at: "2026-06-12" },
      ],
      rental_booking_deposit_disposition_events: [
        {
          id: "disposition-1",
          booking_id: "booking-1",
          source_event_type: "no_show",
          no_show_event_id: "no-show-1",
        },
      ],
      financial_recognition_events: [
        {
          id: "recognition-1",
          booking_id: "booking-1",
          source_type: "rental_booking_deposit_disposition_event",
          source_id: "disposition-1",
          recognition_type: "booking_deposit_forfeiture_income",
        },
      ],
      official_documents: [
        {
          id: "doc-receipt",
          document_type: "booking_deposit_forfeiture_ordinary_receipt",
          document_no: "BDFR-1",
          status: "issued",
          source_type: "financial_recognition_event",
          source_id: "recognition-1",
          customer_user_id: null,
          issued_at: "2026-06-12T00:00:00.000Z",
          snapshot: { financial_recognition: { recognized_amount: 200 } },
          currency_code: "THB",
        },
        {
          id: "doc-notice",
          document_type: "rental_booking_no_show_forfeiture_notice",
          document_no: "NSFN-1",
          status: "issued",
          source_type: "rental_booking_no_show_event",
          source_id: "no-show-1",
          customer_user_id: null,
          issued_at: "2026-06-12T00:00:00.000Z",
          snapshot: { no_show: { marked_at: "2026-06-12T00:00:00.000Z" } },
          currency_code: "THB",
        },
      ],
    });
    const detail = await getCustomerRentalBookingDetail(
      client(db) as any,
      "booking-1",
      "user-1",
    );
    expect(detail.documents.bookingDepositForfeitureReceipt).toMatchObject({
      id: "doc-receipt",
      documentNo: "BDFR-1",
    });
    expect(detail.documents.noShowForfeitureNotice).toMatchObject({
      id: "doc-notice",
      documentNo: "NSFN-1",
    });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-receipt", "user-1"),
    ).resolves.toMatchObject({ id: "doc-receipt" });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-notice", "user-1"),
    ).resolves.toMatchObject({ id: "doc-notice" });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-receipt", "user-2"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-notice", "user-2"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("denies admin operational documents through the customer document route", async () => {
    const db = seed({
      rental_booking_cancellation_events: [
        { id: "event-1", booking_id: "booking-1", user_id: "user-1" },
      ],
      official_documents: [
        {
          id: "doc-booking",
          document_type: "rental_booking_confirmation",
          document_no: "RBK-1",
          status: "issued",
          source_type: "rental_booking",
          source_id: "booking-1",
          customer_user_id: "user-1",
          issued_at: "2026-06-01T00:00:00.000Z",
          template_key: "x",
          template_version: 1,
          snapshot: { ok: true },
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          currency_code: "THB",
          print_count: 0,
          last_printed_at: null,
          created_at: "",
          updated_at: "",
        },
        {
          id: "doc-cxl",
          document_type: "rental_booking_cancellation_confirmation",
          document_no: "CXL-1",
          status: "issued",
          source_type: "rental_booking_cancellation_event",
          source_id: "event-1",
          customer_user_id: "user-1",
          issued_at: "2026-06-01T00:00:00.000Z",
          template_key: "x",
          template_version: 1,
          snapshot: { ok: true },
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          currency_code: "THB",
          print_count: 0,
          last_printed_at: null,
          created_at: "",
          updated_at: "",
        },
        {
          id: "doc-pickup",
          document_type: "rental_pickup_form",
          document_no: "PU-1",
          status: "issued",
          source_type: "rental_booking",
          source_id: "booking-1",
          customer_user_id: "user-1",
          issued_at: "2026-06-01T00:00:00.000Z",
          template_key: "x",
          template_version: 1,
          snapshot: { adminOnly: true },
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          currency_code: "THB",
          print_count: 0,
          last_printed_at: null,
          created_at: "",
          updated_at: "",
        },
        {
          id: "doc-return",
          document_type: "rental_return_form",
          document_no: "RT-1",
          status: "issued",
          source_type: "rental_booking",
          source_id: "booking-1",
          customer_user_id: null,
          issued_at: "2026-06-01T00:00:00.000Z",
          template_key: "x",
          template_version: 1,
          snapshot: { adminOnly: true },
          subtotal: 0,
          vat_amount: 0,
          total_amount: 0,
          currency_code: "THB",
          print_count: 0,
          last_printed_at: null,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-booking", "user-1"),
    ).resolves.toMatchObject({ id: "doc-booking" });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-cxl", "user-1"),
    ).resolves.toMatchObject({ id: "doc-cxl" });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-pickup", "user-1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      loadCustomerOfficialDocument(client(db) as any, "doc-return", "user-1"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("gates customer refund confirmation print access until refunded with proof", async () => {
    const baseDocument = {
      id: "doc-refund",
      document_type: "rental_booking_deposit_refund_confirmation",
      document_no: "RF-1",
      status: "issued",
      source_type: "payment_refund",
      source_id: "refund-1",
      customer_user_id: "user-1",
      issued_at: "2026-06-08T00:00:00.000Z",
      template_key: "x",
      template_version: 1,
      snapshot: { ok: true },
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
      currency_code: "THB",
      print_count: 0,
      last_printed_at: null,
      created_at: "",
      updated_at: "",
    };
    const pendingDb = seed({
      payment_refunds: [
        {
          id: "refund-1",
          booking_id: "booking-1",
          user_id: "user-1",
          refund_type: "rental_booking_deposit",
          status: "pending_admin_review",
          requested_at: "2026-06-07T16:00:00.000Z",
        },
      ],
      official_documents: [baseDocument],
    });
    await expect(
      loadCustomerOfficialDocument(
        client(pendingDb) as any,
        "doc-refund",
        "user-1",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    const readyDb = seed({
      payment_refunds: [
        {
          id: "refund-1",
          booking_id: "booking-1",
          user_id: "user-1",
          refund_type: "rental_booking_deposit",
          status: "refunded",
          refund_proof_id: "proof-1",
          requested_at: "2026-06-07T16:00:00.000Z",
        },
      ],
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
        },
      ],
      official_documents: [baseDocument],
    });
    await expect(
      loadCustomerOfficialDocument(
        client(readyDb) as any,
        "doc-refund",
        "user-1",
      ),
    ).resolves.toMatchObject({ id: "doc-refund" });
  });

  it("rejects unsupported and unavailable customer document issuance", async () => {
    await expect(
      issueCustomerRentalDocument({
        client: client(seed()) as any,
        bookingId: "booking-1",
        userId: "user-1",
        documentType: "rental_pickup_form",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      issueCustomerRentalDocument({
        client: client(
          seed({
            rental_bookings: [
              booking({
                status: "draft",
                booking_deposit_payment_status: "unpaid",
                booking_deposit_paid_amount: 0,
              }),
            ],
          }),
        ) as any,
        bookingId: "booking-1",
        userId: "user-1",
        documentType: "rental_booking_confirmation",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      issueCustomerRentalDocument({
        client: client(
          seed({
            rental_bookings: [
              booking({
                booking_deposit_payment_status: "unpaid",
                booking_deposit_paid_amount: 0,
              }),
            ],
          }),
        ) as any,
        bookingId: "booking-1",
        userId: "user-1",
        documentType: "rental_booking_deposit_payment_confirmation",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("wires the C.1C pages and replaces the old rentals cancel shortcut", () => {
    const detailPage = readFileSync(
      resolve(process.cwd(), "app/pages/user/rentals/[bookingId].vue"),
      "utf8",
    );
    expect(detailPage).toContain(
      "/api/user/rental-bookings/${encodeURIComponent(bookingId.value)}/cancel",
    );
    expect(detailPage).toContain("cancelOpen.value = false");
    expect(detailPage).toContain("refreshBookings");
    expect(detailPage).toContain("cancelling.value");
    expect(detailPage).toContain("documentIssueStatus");
    expect(detailPage).toContain('id="cancel-refund"');
    expect(detailPage).toContain("rentalsPage.detail.cancelRefundTitle");
    expect(detailPage).toContain("rentalsPage.detail.cancelEligibleTitle");
    expect(detailPage).toContain("rentalsPage.detail.cancelSubmitOpen");
    expect(detailPage).toContain("cancelOpen = true");
    expect(detailPage).toContain("rentalsPage.detail.outsideCutoffTitle");
    expect(detailPage).toContain("rentalsPage.detail.notCancellable");
    expect(detailPage).toContain(
      "rentalsPage.detail.cancelledPendingRefundTitle",
    );
    expect(detailPage).toContain("canIssueBookingConfirmation");
    expect(detailPage).toContain(
      'detail.value?.booking.status === "confirmed"',
    );
    expect(detailPage).not.toContain(
      "canIssueBookingDepositPaymentConfirmation",
    );
    expect(detailPage).not.toContain(
      'type: "rental_booking_deposit_payment_confirmation"',
    );
    expect(detailPage).toContain('v-else-if="canIssueDocument(entry.type)"');
    expect(detailPage).toContain(
      "rentalsPage.documents.unavailable.bookingConfirmation",
    );
    expect(detailPage).not.toContain(
      "rentalsPage.documents.unavailable.depositPaymentConfirmation",
    );
    expect(detailPage).toContain("refundBankAccountNumberModel");
    expect(detailPage).toContain("normalizeRefundBankAccountNumber(value)");
    expect(detailPage).toContain("onRefundBankAccountNumberInput");
    expect(detailPage).toContain("input.value = normalized");
    expect(detailPage).toContain('type="text"');
    expect(detailPage).toContain('inputmode="numeric"');
    expect(detailPage).toContain('autocomplete="off"');
    expect(detailPage).toContain('@input="onRefundBankAccountNumberInput"');
    expect(detailPage).toContain("digitsOnly(value)");
    expect(detailPage).toContain("REFUND_BANK_ACCOUNT_NUMBER_INVALID");
    expect(detailPage).toContain(
      "rentalsPage.detail.refundBankAccountNumberHelper",
    );
    expect(detailPage).toContain("/refund-proof");
    expect(detailPage).toContain('id="refund-proof"');
    expect(detailPage).toContain("noShowDocumentEntries");
    expect(detailPage).toContain("bookingDepositForfeitureReceipt");
    expect(detailPage).toContain("noShowForfeitureNotice");
    expect(detailPage).toContain("rentalsPage.documents.noShowForfeitureTitle");
    expect(detailPage).toContain("booking_deposit_forfeiture_ordinary_receipt");
    expect(detailPage).toContain("rental_booking_no_show_forfeiture_notice");
    const oldListPagePath = resolve(
      process.cwd(),
      "app/pages/user/rentals.vue",
    );
    const listPagePath = resolve(
      process.cwd(),
      "app/pages/user/rentals/index.vue",
    );
    expect(existsSync(oldListPagePath)).toBe(false);
    expect(existsSync(listPagePath)).toBe(true);
    const listPage = readFileSync(listPagePath, "utf8");
    expect(listPage).toContain("detailPath(booking)");
    expect(listPage).toContain("goToDetail(booking)");
    expect(listPage).toContain("goToCancelRefund(booking)");
    expect(listPage).toContain("navigateTo(detailPath(booking))");
    expect(listPage).toContain("navigateTo(cancelRefundPath(booking))");
    expect(listPage).toContain("rentalsPage.detailAction");
    expect(listPage).not.toContain("รายละเอียด / เอกสาร / ยกเลิก");
    expect(listPage).toContain("canRequestCancellationRefund(booking)");
    expect(listPage).toContain("cancelRefundPath(booking)");
    expect(listPage).toContain("#cancel-refund");
    expect(listPage).toContain("rentalsPage.cancelRefundAction");
    expect(listPage).toContain("/api/user/rental-bookings/refund-proof-status");
    expect(listPage).toContain("goToRefundProof(booking)");
    expect(listPage).toContain("rentalsPage.detail.viewRefundProof");
    expect(listPage).toContain("pickupSortDirection");
    expect(listPage).toContain("compareBookingsByPickupDate");
    expect(listPage).toContain("togglePickupSort");
    expect(listPage).toContain("rentalsPage.sortByPickup");
    expect(listPage).toContain("rentalsPage.sortPickupEarliest");
    expect(listPage).toContain("rentalsPage.sortPickupLatest");
    expect(listPage).toContain("pickupDayNumber(booking)");
    expect(listPage).toContain("pickupDayClass(booking)");
    expect(listPage).toContain("isPickupTomorrow(booking)");
    expect(listPage).toContain("rentalsPage.pickupTomorrowBadge");
    expect(listPage).toContain("border-error/80");
    expect(listPage).toContain('timeZone: "Asia/Bangkok"');
    expect(listPage).toContain('color="error"');
    expect(listPage).toContain('variant="outline"');
    expect(listPage).not.toContain(
      'updateBookingStatus(target.bookingId, "cancelled")',
    );
    const ordersPage = readFileSync(
      resolve(process.cwd(), "app/pages/user/orders.vue"),
      "utf8",
    );
    expect(ordersPage).toContain(
      "/api/user/rental-bookings/refund-tracking-status",
    );
    expect(ordersPage).toContain("ordersPage.rentalHistory.refundStatusLine");
    expect(ordersPage).toContain(
      "ordersPage.rentalHistory.refundStatus.${key}",
    );
    expect(ordersPage).toContain("ordersPage.rentalHistory.actions.detail");
    expect(ordersPage).toContain(
      "ordersPage.rentalHistory.actions.trackRefund",
    );
    expect(ordersPage).toContain(
      "ordersPage.rentalHistory.actions.cancellationDocument",
    );
    expect(ordersPage).toContain(
      "ordersPage.rentalHistory.actions.refundDocument",
    );
    expect(ordersPage).toContain(
      "ordersPage.rentalHistory.actions.refundProof",
    );
    expect(ordersPage).toContain("hasCancellationConfirmation(booking)");
    expect(ordersPage).toContain("hasRefundConfirmation(booking)");
    expect(ordersPage).toContain("hasHistoryRefundProof(booking)");
    expect(ordersPage).not.toContain("storage_path");
    expect(ordersPage).not.toContain("storage_bucket");
    const printPage = readFileSync(
      resolve(process.cwd(), "app/pages/user/documents/[id]/print.vue"),
      "utf8",
    );
    const officialHeader = readFileSync(
      resolve(
        process.cwd(),
        "app/components/documents/OfficialDocumentHeader.vue",
      ),
      "utf8",
    );
    expect(printPage).toContain("/api/user/documents/${documentId.value}");
    expect(printPage).toContain("snapshot.value");
    expect(printPage).toContain("window.print()");
    expect(printPage).toContain("printDocument");
    expect(printPage).toContain("pickup_date_snapshot");
    expect(printPage).toContain("refund_cutoff_date_snapshot");
    expect(printPage).toContain("refund_eligible");
    expect(printPage).toContain("refund_amount_due");
    expect(printPage).toContain("start_date");
    expect(printPage).toContain("end_date");
    expect(printPage).toContain("ใบยืนยันการจองเช่า");
    expect(printPage).toContain("ใบยืนยันการชำระเงินมัดจำจอง");
    expect(printPage).toContain("ใบยืนยันการยกเลิกการจองเช่า");
    expect(printPage).toContain("ใบยืนยันการคืนเงินมัดจำจอง");
    expect(printPage).toContain(
      "ใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า",
    );
    expect(printPage).toContain(
      "หนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า",
    );
    expect(printPage).toContain("booking_deposit_forfeiture_ordinary_receipt");
    expect(printPage).toContain("rental_booking_no_show_forfeiture_notice");
    expect(printPage).toContain("OfficialDocumentHeader");
    expect(officialHeader).toContain("0105564155415");
    expect(officialHeader).toContain("เลขประจำตัวผู้เสียภาษี");
    expect(officialHeader).toContain("รหัสสาขา");
    expect(officialHeader).toContain("document-block");
    expect(printPage).toContain(
      "เงินจำนวนนี้ได้รับชำระไว้แล้วในวันจอง และถูกริบตามเงื่อนไขการจอง ณ วันที่ระบุในเอกสารฉบับนี้",
    );
    expect(printPage).toContain("ไม่อยู่ในฐานภาษีมูลค่าเพิ่ม");
    expect(printPage).not.toContain("Tax treatment");
    expect(printPage).not.toContain("WHT treatment");
    expect(printPage).not.toContain(
      "ใบรับเงินธรรมดา — Booking Deposit ที่ถูกริบ",
    );
    expect(printPage).not.toContain(
      "หนังสือแจ้งการไม่มารับสินค้าและการดำเนินการ Booking Deposit",
    );
    expect(printPage).toContain("ไม่ใช่ใบเสร็จรับเงิน");
    expect(printPage).toContain("สถานะเงินมัดจำจอง");
    expect(printPage).toContain("จำนวนเงินมัดจำจองที่ชำระแล้ว");
    expect(printPage).toContain(
      "เงินมัดจำจองนี้เป็นส่วนหนึ่งของเงินมัดจำประกัน",
    );
    expect(printPage).toContain("วันที่ยกเลิกการจอง");
    expect(printPage).toContain("ช่องทางการคืนเงิน");
    expect(printPage).toContain("หมายเหตุ");
    expect(officialHeader).toContain("HOPNIC Co., Ltd.");
    expect(officialHeader).toContain("สำนักงานใหญ่");
    expect(printPage).toContain("ไม่ใช่ใบเสร็จรับเงิน");
    expect(printPage).toContain("ไม่ใช่ใบกำกับภาษี");
  });
});
