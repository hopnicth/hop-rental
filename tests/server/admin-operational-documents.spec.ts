import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOperationalDocumentUiState } from "../../app/utils/admin-documents";

type Row = Record<string, unknown>;

const mockLoader = vi.hoisted(() => ({
  status: "picked_up",
  payloadOverrides: {} as Row,
  calls: 0,
}));

vi.mock("~~/server/utils/admin-rental-print-form-loader", () => ({
  loadAdminRentalPrintFormData: async (input: {
    type: "pickup" | "return";
  }) => {
    mockLoader.calls += 1;
    const payload = {
      type: input.type,
      generatedAt: "2026-05-13T01:00:00.000Z",
      company: { name: "HOPNIC", logoUrl: null },
      booking: {
        id: "booking-1",
        code: "CAM-001",
        status: mockLoader.status,
        startDate: "2026-05-13",
        endDate: "2026-05-14",
        rentalDays: 1,
        qrValue: "booking:booking-1",
      },
      customer: {
        name: "Customer One",
        phone: "0812345678",
        type: "user",
        companyName: null,
        companyTaxId: null,
        kycStatus: "verified",
        idEvidenceRef: "id-card.png",
      },
      branch: { id: "branch-1", name: "Bangkok" },
      event: {
        label: input.type === "pickup" ? "Pickup / Handover" : "Return",
        at: "2026-05-13T02:00:00.000Z",
        signatureUrl: "https://cdn.example/signature.png",
        staffName: "Staff One",
        notes: null,
      },
      items: [
        { name: "Camera", assetCode: "CAM-001", skuId: "sku-1", quantity: 1 },
      ],
      checklist: null,
      money: {
        currencyCode: "THB",
        paymentLines: [],
        hasStoredPaymentLines: true,
        whtRateDisplay: "0%",
        grossTotal: 0,
        whtTotal: 0,
        netPayableTotal: 0,
        refundableDepositTotal: 5000,
        securityDepositRequired: 5000,
        bookingDepositDueNow: 200,
        remainingSecurityDepositDueAtPickup: 4800,
        rentalFeeDue: 1000,
        netPayableNow: 200,
        netPayableAtPickup: 5800,
        rentalFee: 1000,
        deposit: 5000,
        depositPaid: 200,
        paymentMethod: "cash",
        paymentStatus: "paid",
        coverage: null,
        totalDeductions: 0,
        refundAmount: 0,
        additionalChargeAmount: 0,
        refundStatus: "not_refunded",
        refundMethod: null,
        summary: {},
        notices: {
          bookingDeposit: { label: "Booking Deposit", en: "", th: "" },
          refundableSecurityDeposit: {
            label: "Security Deposit",
            en: "",
            th: "",
          },
        },
      },
      deductions: [],
      returnConditionNotes: null,
      disclaimer: {
        th: "ไม่ใช่ใบเสร็จรับเงิน",
        en: "not an official receipt or tax invoice",
      },
      ...mockLoader.payloadOverrides,
    };
    return {
      booking: {
        id: "booking-1",
        userId: "user-1",
        walkInPhone: null,
        status: mockLoader.status,
        storageBranchId: "branch-1",
        currencyCode: "THB",
      },
      fulfillment: { branchId: "branch-1" },
      payload,
    };
  },
}));

const { issueOperationalRentalDocument, previewOperationalRentalDocument } =
  await import("../../server/utils/admin-rental-operational-documents");
const { loadOfficialDocument, recordDocumentPrintEvent } =
  await import("../../server/utils/admin-documents");

function makeDocument(overrides: Row = {}) {
  return {
    id: "doc-existing",
    document_type: "rental_pickup_form",
    document_no: "PICK-202605-0001",
    status: "issued",
    branch_id: "branch-1",
    source_type: "rental_booking",
    source_id: "booking-1",
    issued_at: "2026-05-13T01:00:00.000Z",
    subtotal: 0,
    vat_amount: 0,
    total_amount: 0,
    currency_code: "THB",
    template_key: "rental_pickup_form_a5",
    template_version: 1,
    snapshot: { frozen: true, payload: { booking: { code: "OLD" } } },
    print_count: 0,
    last_printed_at: null,
    created_at: "2026-05-13T01:00:00.000Z",
    updated_at: "2026-05-13T01:00:00.000Z",
    ...overrides,
  };
}

function makeClient(input: { documents?: Row[] } = {}) {
  const state = {
    documents: [...(input.documents ?? [])],
    events: [] as Row[],
    rpcCalls: [] as Row[],
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
      const filters: Array<(row: Row) => boolean> = [];
      let inFilter: { key: string; values: unknown[] } | null = null;
      let insertPayload: Row | null = null;
      let updatePayload: Row | null = null;
      const rows = () => {
        const source = table === "official_documents" ? state.documents : [];
        return source.filter(
          (row) =>
            filters.every((fn) => fn(row)) &&
            (!inFilter || inFilter.values.includes(row[inFilter.key])),
        );
      };
      const chain: any = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return chain;
        },
        in: (key: string, values: unknown[]) => {
          inFilter = { key, values };
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        insert: (payload: Row) => {
          insertPayload = payload;
          if (table === "document_events") state.events.push(payload);
          if (table === "official_documents") {
            const row = makeDocument({
              id: `doc-${state.documents.length + 1}`,
              ...payload,
              created_at: "2026-05-13T01:00:00.000Z",
              updated_at: "2026-05-13T01:00:00.000Z",
              print_count: 0,
              last_printed_at: null,
            });
            state.documents.push(row);
          }
          return chain;
        },
        update: (payload: Row) => {
          updatePayload = payload;
          return chain;
        },
        maybeSingle: async () => {
          if (
            table === "system_configs" ||
            table === "branch_document_settings"
          ) {
            return { data: null, error: null };
          }
          if (table === "official_documents" && updatePayload) {
            const row = rows()[0];
            Object.assign(row, updatePayload, {
              updated_at: "2026-05-13T02:00:00.000Z",
            });
            return { data: row, error: null };
          }
          if (insertPayload && table === "official_documents") {
            return { data: state.documents.at(-1), error: null };
          }
          return { data: rows()[0] ?? null, error: null };
        },
      };
      return chain;
    },
  };
}

beforeEach(() => {
  mockLoader.status = "picked_up";
  mockLoader.payloadOverrides = {};
  mockLoader.calls = 0;
});

describe("operational rental document issuance", () => {
  it("computes explicit pickup and return preview/issue eligibility from fulfillment presence", () => {
    expect(
      getOperationalDocumentUiState({
        documentType: "rental_pickup_form",
        bookingStatus: "picked_up",
        fulfillmentStatus: { pickupExists: false, returnExists: false },
      }),
    ).toMatchObject({ canPreview: false, canIssue: false });
    expect(
      getOperationalDocumentUiState({
        documentType: "rental_pickup_form",
        bookingStatus: "picked_up",
        fulfillmentStatus: { pickupExists: true, returnExists: false },
      }),
    ).toMatchObject({ canPreview: true, canIssue: true });
    expect(
      getOperationalDocumentUiState({
        documentType: "rental_return_form",
        bookingStatus: "returned",
        fulfillmentStatus: { pickupExists: true, returnExists: false },
      }),
    ).toMatchObject({ canPreview: false, canIssue: false });
    expect(
      getOperationalDocumentUiState({
        documentType: "rental_return_form",
        bookingStatus: "returned",
        fulfillmentStatus: { pickupExists: true, returnExists: true },
      }),
    ).toMatchObject({ canPreview: true, canIssue: true });
  });

  it("previews live payload without allocating a number or inserting rows", async () => {
    const client = makeClient();
    const result = await previewOperationalRentalDocument({
      adminClient: client as any,
      sourceType: "rental_booking",
      sourceId: "booking-1",
      documentType: "rental_pickup_form",
    });
    expect(result.snapshotPreview.document.document_number).toBeNull();
    expect(client.state.rpcCalls).toHaveLength(0);
    expect(client.state.documents).toHaveLength(0);
    expect(client.state.events).toHaveLength(0);
  });

  it("issues an immutable official_documents snapshot and calls the existing sequence RPC", async () => {
    const client = makeClient();
    const result = await issueOperationalRentalDocument({
      adminClient: client as any,
      userId: "staff-1",
      sourceType: "rental_booking",
      sourceId: "booking-1",
      documentType: "rental_pickup_form",
    });
    expect(result.alreadyIssued).toBe(false);
    expect(client.state.rpcCalls[0]).toMatchObject({
      name: "f_next_document_number",
      params: { p_document_type: "rental_pickup_form", p_prefix: "PICK" },
    });
    expect(client.state.documents[0]).toMatchObject({
      document_type: "rental_pickup_form",
      status: "issued",
      template_key: "rental_pickup_form_a5",
      subtotal: 0,
      vat_amount: 0,
      total_amount: 0,
    });
    expect(
      (client.state.documents[0].snapshot as any).payload.booking.code,
    ).toBe("CAM-001");
    expect(client.state.events[0]).toMatchObject({ event_type: "issued" });
  });

  it("returns an existing issued document instead of creating a duplicate", async () => {
    const client = makeClient({ documents: [makeDocument()] });
    const result = await issueOperationalRentalDocument({
      adminClient: client as any,
      userId: "staff-1",
      sourceType: "rental_booking",
      sourceId: "booking-1",
      documentType: "rental_pickup_form",
    });
    expect(result.alreadyIssued).toBe(true);
    expect(client.state.documents).toHaveLength(1);
    expect(client.state.rpcCalls).toHaveLength(0);
  });

  it("blocks pickup and return issue before authoritative fulfillment state is complete", async () => {
    mockLoader.status = "confirmed";
    await expect(
      issueOperationalRentalDocument({
        adminClient: makeClient() as any,
        userId: "staff-1",
        sourceType: "rental_booking",
        sourceId: "booking-1",
        documentType: "rental_pickup_form",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    mockLoader.status = "picked_up";
    await expect(
      issueOperationalRentalDocument({
        adminClient: makeClient() as any,
        userId: "staff-1",
        sourceType: "rental_booking",
        sourceId: "booking-1",
        documentType: "rental_return_form",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("serves and prints from the stored snapshot without mutating it", async () => {
    const storedSnapshot = {
      frozen: true,
      payload: { booking: { code: "ISSUED" } },
    };
    const client = makeClient({
      documents: [makeDocument({ id: "doc-1", snapshot: storedSnapshot })],
    });
    mockLoader.payloadOverrides = { booking: { code: "LIVE-CHANGED" } };
    const loaded = await loadOfficialDocument({
      adminClient: client as any,
      documentId: "doc-1",
    });
    expect(loaded.snapshot).toEqual(storedSnapshot);
    const printed = await recordDocumentPrintEvent({
      adminClient: client as any,
      document: loaded,
      eventType: "printed",
      staffUserId: "staff-1",
    });
    expect(printed.printCount).toBe(1);
    expect(printed.snapshot).toEqual(storedSnapshot);
    expect(client.state.events[0]).toMatchObject({ event_type: "printed" });
  });

  it("requires a reason for reprint and does not mutate snapshot", async () => {
    const snapshot = { frozen: true };
    const client = makeClient({
      documents: [
        makeDocument({
          id: "doc-1",
          status: "printed",
          print_count: 1,
          snapshot,
        }),
      ],
    });
    const doc = await loadOfficialDocument({
      adminClient: client as any,
      documentId: "doc-1",
    });
    await expect(
      recordDocumentPrintEvent({
        adminClient: client as any,
        document: doc,
        eventType: "reprinted",
        staffUserId: "staff-1",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const updated = await recordDocumentPrintEvent({
      adminClient: client as any,
      document: doc,
      eventType: "reprinted",
      staffUserId: "staff-1",
      reason: "Customer requested another copy",
    });
    expect(updated.printCount).toBe(2);
    expect(updated.snapshot).toEqual(snapshot);
    expect(client.state.events.at(-1)).toMatchObject({
      event_type: "reprinted",
    });
  });

  it("records print events for no-show forfeiture official documents", async () => {
    const client = makeClient({
      documents: [
        makeDocument({
          id: "doc-forfeiture-receipt",
          document_type: "booking_deposit_forfeiture_ordinary_receipt",
          source_type: "financial_recognition_event",
          source_id: "recognition-1",
          snapshot: {
            document: {
              document_type: "booking_deposit_forfeiture_ordinary_receipt",
            },
          },
        }),
      ],
    });
    const doc = await loadOfficialDocument({
      adminClient: client as any,
      documentId: "doc-forfeiture-receipt",
    });
    const printed = await recordDocumentPrintEvent({
      adminClient: client as any,
      document: doc,
      eventType: "printed",
      staffUserId: "staff-1",
      metadata: { copyMode: "browser_print" },
    });
    expect(printed.printCount).toBe(1);
    expect(client.state.events[0]).toMatchObject({
      event_type: "printed",
      metadata: { copyMode: "browser_print" },
    });
  });

  it("B2: BDC print template — recognizes rental_booking_deposit_confirmation_v1 and renders Thai-only content", () => {
    const issuedPrint = readFileSync(
      resolve(process.cwd(), "app/pages/admin/documents/[id]/print.vue"),
      "utf8",
    );

    // 1. BDC template key is recognized — isBdcDocument computed gates the new article branch
    expect(issuedPrint).toContain("rental_booking_deposit_confirmation_v1");
    expect(issuedPrint).toContain("isBdcDocument");

    // 2. Thai customer-facing document title is rendered for BDC
    expect(issuedPrint).toContain("เอกสารยืนยันการรับเงินมัดจำการจอง");

    // 3. Key snapshot fields from A3 contract are rendered
    //    document section
    expect(issuedPrint).toContain("snapshot.document.document_number");
    expect(issuedPrint).toContain("snapshot.document.issued_at");
    //    held_balance_event section
    expect(issuedPrint).toContain("held_balance_event?.amount");
    expect(issuedPrint).toContain("held_balance_event?.currency_code");
    expect(issuedPrint).toContain("held_balance_event?.occurred_at");
    expect(issuedPrint).toContain("held_balance_event?.payment_method");
    //    booking section
    expect(issuedPrint).toContain("booking.reference");
    expect(issuedPrint).toContain("booking.start_date");
    expect(issuedPrint).toContain("booking.end_date");
    expect(issuedPrint).toContain("booking.rental_days");
    //    customer section
    expect(issuedPrint).toContain("customer.display_name");
    expect(issuedPrint).toContain("customer.walk_in_phone");

    // 4. No new live booking fetch added — BDC renders purely from official_documents snapshot
    //    The page has exactly 2 $fetch calls: load() and recordAndPrint() — no more
    const fetchCount = (issuedPrint.match(/\$fetch/g) ?? []).length;
    expect(fetchCount).toBeLessThanOrEqual(2);

    // 5. BDC renders only Thai disclaimer — uses snapshot.disclaimer?.th, not disclaimer.en
    expect(issuedPrint).toContain("snapshot.disclaimer?.th");

    // 6. Existing operational document templates are not regressed
    expect(issuedPrint).toContain(
      "booking_deposit_forfeiture_ordinary_receipt",
    );
    expect(issuedPrint).toContain("rental_booking_no_show_forfeiture_notice");
    expect(issuedPrint).toContain(
      "ใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า",
    );
    expect(issuedPrint).toContain(
      "หนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า",
    );
    expect(issuedPrint).toContain("window.print()");
    expect(issuedPrint).toContain("OfficialDocumentHeader");
    // pickup/return article branch still present
    expect(issuedPrint).toContain(
      "snapshot && payload && !isNoShowForfeitureDocument",
    );

    // 7. BDC is a separate article branch — not merged with pickup/return or no-show
    expect(issuedPrint).toContain("snapshot && isBdcDocument");

    // 8. D-enhancement: "รายการของที่จอง" booked-items section is present
    expect(issuedPrint).toContain("รายการของที่จอง");
    expect(issuedPrint).toContain("bookedItem");
    expect(issuedPrint).toContain("bookedItem.asset_name");

    // 9. D-enhancement: Booking ID QR code — qr_value passed to OfficialDocumentHeader
    expect(issuedPrint).toContain("booking.qr_value");
    expect(issuedPrint).toContain("qr-value");

    // 10. D-enhancement: OfficialDocumentHeader now accepts optional qrValue prop
    const officialHeaderSrc = readFileSync(
      resolve(
        process.cwd(),
        "app/components/documents/OfficialDocumentHeader.vue",
      ),
      "utf8",
    );
    expect(officialHeaderSrc).toContain("qrValue");
    expect(officialHeaderSrc).toContain("QrcodeVue");
    expect(officialHeaderSrc).toContain("รหัสการจอง");
  });

  it("wires admin-only APIs, booking ops metadata, issued print UI, and legacy preview route", () => {
    const files = [
      "server/api/admin/documents/preview.post.ts",
      "server/api/admin/documents/issue.post.ts",
      "server/api/admin/documents/[id].get.ts",
      "server/api/admin/documents/[id]/events.post.ts",
    ];
    for (const file of files) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8")).toContain(
        "requirePlatformAdmin",
      );
    }
    expect(
      readFileSync(
        resolve(process.cwd(), "server/utils/admin-bookings-ops.ts"),
        "utf8",
      ),
    ).toContain("fulfillmentStatus");
    expect(
      readFileSync(
        resolve(process.cwd(), "server/utils/admin-bookings-ops.ts"),
        "utf8",
      ),
    ).toContain("fetchIssuedNoShowForfeitureDocuments");
    const detailPage = readFileSync(
      resolve(process.cwd(), "app/pages/admin/rental-bookings/[id].vue"),
      "utf8",
    );
    expect(detailPage).toContain("Operational Documents");
    expect(detailPage).toContain("Issue & Print");
    expect(detailPage).toContain("Reprint");
    // Phase 2E-B2 (commit e546a25) removed the Preview button from the
    // operational-documents card — the current contract is Issue & Print /
    // Reprint only. Assert the preview wiring stays removed.
    expect(detailPage).not.toContain("previewDocument(docType)");
    expect(detailPage).not.toContain("Preview Pickup Form");
    expect(detailPage).not.toContain("Preview Return Form");
    expect(detailPage).toContain(
      "fulfillmentStatus: ops.value?.fulfillmentStatus",
    );
    expect(detailPage).toContain("No-show Forfeiture Documents");
    expect(detailPage).toContain("Issue missing no-show documents");
    expect(detailPage).toContain("/no-show-documents/issue");
    expect(detailPage).toContain("noShowForfeitureDocuments");
    const documentUtils = readFileSync(
      resolve(process.cwd(), "app/utils/admin-documents.ts"),
      "utf8",
    );
    expect(documentUtils).toContain(
      "Pickup fulfillment record not found yet. Complete pickup before previewing or issuing the Pickup Form.",
    );
    expect(documentUtils).toContain(
      "Return fulfillment record not found yet. Complete return before previewing or issuing the Return Form.",
    );
    const issuedPrint = readFileSync(
      resolve(process.cwd(), "app/pages/admin/documents/[id]/print.vue"),
      "utf8",
    );
    const officialHeader = readFileSync(
      resolve(
        process.cwd(),
        "app/components/documents/OfficialDocumentHeader.vue",
      ),
      "utf8",
    );
    expect(issuedPrint).toContain(
      "/api/admin/documents/${documentRow.value.id}/events",
    );
    expect(issuedPrint).toContain("window.print()");
    expect(issuedPrint).toContain(
      "booking_deposit_forfeiture_ordinary_receipt",
    );
    expect(issuedPrint).toContain("rental_booking_no_show_forfeiture_notice");
    expect(issuedPrint).toContain(
      "ใบรับเงินค่าริบเงินมัดจำจองกรณีไม่มารับสินค้า",
    );
    expect(issuedPrint).toContain(
      "หนังสือแจ้งการริบเงินมัดจำจองกรณีไม่มารับสินค้า",
    );
    expect(issuedPrint).toContain("OfficialDocumentHeader");
    expect(officialHeader).toContain("0105564155415");
    expect(officialHeader).toContain("เลขประจำตัวผู้เสียภาษี");
    expect(officialHeader).toContain("รหัสสาขา");
    expect(officialHeader).toContain("document-block");
    expect(issuedPrint).toContain(
      "เงินจำนวนนี้ได้รับชำระไว้แล้วในวันจอง และถูกริบตามเงื่อนไขการจอง ณ วันที่ระบุในเอกสารฉบับนี้",
    );
    expect(issuedPrint).not.toContain("No-show Forfeiture Notice");
    expect(issuedPrint).not.toContain(
      "Booking Deposit Forfeiture Ordinary Receipt",
    );
    expect(issuedPrint).not.toContain("Not a tax invoice · VAT 0");
    expect(
      readFileSync(
        resolve(
          process.cwd(),
          "app/pages/admin/rental-bookings/[id]/print.vue",
        ),
        "utf8",
      ),
    ).toContain("/api/admin/rental-bookings/${bookingId.value}/print-form");
  });

  it("C2: fetchBookingDepositConfirmationDocument — returns not_applicable for non-confirmed bookings", async () => {
    const { fetchBookingDepositConfirmationDocument } =
      await import("../../server/utils/admin-bookings-ops");

    function makeOpsClient(
      bookingRow: Record<string, unknown> | null,
      taskRow: Record<string, unknown> | null = null,
      docRow: Record<string, unknown> | null = null,
    ) {
      return {
        from(table: string) {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => {
              if (table === "rental_bookings")
                return { data: bookingRow, error: null };
              if (table === "pos_document_issuance_tasks")
                return { data: taskRow, error: null };
              if (table === "official_documents")
                return { data: docRow, error: null };
              return { data: null, error: null };
            },
          };
          return chain;
        },
      };
    }

    // Non-confirmed booking → not_applicable
    const r1 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient({
        status: "draft",
        booking_deposit_payment_status: "unpaid",
      }) as any,
      "booking-1",
    );
    expect(r1.state).toBe("not_applicable");
    expect(r1.canRetry).toBe(false);

    // Confirmed but deposit not paid → not_applicable
    const r2 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient({
        status: "confirmed",
        booking_deposit_payment_status: "unpaid",
      }) as any,
      "booking-1",
    );
    expect(r2.state).toBe("not_applicable");

    // Confirmed + paid, no task → missing + canRetry
    const r3 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient({
        status: "confirmed",
        booking_deposit_payment_status: "paid",
      }) as any,
      "booking-1",
    );
    expect(r3.state).toBe("missing");
    expect(r3.canRetry).toBe(true);

    // Confirmed + paid_confirm_failed, no task → missing + canRetry
    const r4 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient({
        status: "confirmed",
        booking_deposit_payment_status: "paid_confirm_failed",
      }) as any,
      "booking-1",
    );
    expect(r4.state).toBe("missing");
    expect(r4.canRetry).toBe(true);

    // Task status = failed → failed + canRetry
    const r5 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient(
        { status: "confirmed", booking_deposit_payment_status: "paid" },
        {
          id: "task-1",
          status: "failed",
          official_document_id: null,
          issued_at: null,
          error_code: "HTTP_500",
        },
      ) as any,
      "booking-1",
    );
    expect(r5.state).toBe("failed");
    expect(r5.errorCode).toBe("HTTP_500");
    expect(r5.canRetry).toBe(true);

    // Task status = pending → pending + !canRetry
    const r6 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient(
        { status: "confirmed", booking_deposit_payment_status: "paid" },
        {
          id: "task-1",
          status: "pending",
          official_document_id: null,
          issued_at: null,
          error_code: null,
        },
      ) as any,
      "booking-1",
    );
    expect(r6.state).toBe("pending");
    expect(r6.canRetry).toBe(false);

    // Task status = issued with official doc → issued state
    const r7 = await fetchBookingDepositConfirmationDocument(
      makeOpsClient(
        { status: "confirmed", booking_deposit_payment_status: "paid" },
        {
          id: "task-1",
          status: "issued",
          official_document_id: "doc-1",
          issued_at: "2026-05-13T01:00:00Z",
          error_code: null,
        },
        {
          document_no: "BDC-202605-0001",
          print_count: 2,
          issued_at: "2026-05-13T01:00:00Z",
        },
      ) as any,
      "booking-1",
    );
    expect(r7.state).toBe("issued");
    expect(r7.officialDocumentId).toBe("doc-1");
    expect(r7.documentNo).toBe("BDC-202605-0001");
    expect(r7.printCount).toBe(2);
    expect(r7.canRetry).toBe(false);
  });

  it("C2: booking detail page — BDC card wiring and retry endpoint file structure", () => {
    const detailPage = readFileSync(
      resolve(process.cwd(), "app/pages/admin/rental-bookings/[id].vue"),
      "utf8",
    );

    // BDC card present in template
    expect(detailPage).toContain("Booking Deposit Confirmation Document");
    expect(detailPage).toContain("เอกสารยืนยันการรับเงินมัดจำการจอง");
    expect(detailPage).toContain("showBdcCard");
    expect(detailPage).toContain("bdcDocument");
    expect(detailPage).toContain("retryBdcDocument");
    expect(detailPage).toContain("retryingBdc");

    // All 4 BDC states rendered
    expect(detailPage).toContain("bdcDocument?.state === 'issued'");
    expect(detailPage).toContain("bdcDocument?.state === 'failed'");
    expect(detailPage).toContain("bdcDocument?.state === 'missing'");
    expect(detailPage).toContain("bdcDocument?.state === 'pending'");

    // Print and retry actions wired
    expect(detailPage).toContain("bdcPrintUrl()");
    expect(detailPage).toContain("bdcDocument?.canRetry");
    expect(detailPage).toContain("booking-deposit-confirmation/retry");

    // ops payload includes bookingDepositConfirmationDocument
    const opsSrc = readFileSync(
      resolve(process.cwd(), "server/utils/admin-bookings-ops.ts"),
      "utf8",
    );
    expect(opsSrc).toContain("fetchBookingDepositConfirmationDocument");
    expect(opsSrc).toContain("bookingDepositConfirmationDocument");
    expect(opsSrc).toContain("BOOKING_DEPOSIT_CONFIRMATION_DOCUMENT_TYPE");

    // Retry endpoint exists and gates on requirePlatformAdmin
    const retryEndpoint = readFileSync(
      resolve(
        process.cwd(),
        "server/api/admin/rental-bookings/[id]/documents/booking-deposit-confirmation/retry.post.ts",
      ),
      "utf8",
    );
    expect(retryEndpoint).toContain("requirePlatformAdmin");
    expect(retryEndpoint).toContain("BOOKING_NOT_ELIGIBLE_FOR_DOCUMENT_RETRY");
    expect(retryEndpoint).toContain("issueBookingDepositConfirmationDocument");
    expect(retryEndpoint).toContain("HELD_BALANCE_EVENT_NOT_FOUND");
    expect(retryEndpoint).toContain("pos_document_issuance_tasks");

    // Canonical held-balance resolution: payment-method agnostic.
    // Must use rental_booking_id + event_type — NOT booking_deposit_pos_attempt_id.
    expect(retryEndpoint).toContain("rental_booking_id");
    expect(retryEndpoint).toContain("BOOKING_DEPOSIT_COLLECTION_EVENT");
    expect(retryEndpoint).not.toContain("booking_deposit_pos_attempt_id");
    expect(retryEndpoint).not.toContain("POS_BOOKING_DEPOSIT_SOURCE_TYPE");
  });
});
