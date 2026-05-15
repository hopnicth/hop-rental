import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAdminRefundDetail,
  getAdminRefundSummary,
  issueRefundConfirmationDocument,
  linkRefundProof,
  listAdminRefunds,
  transitionAdminRefund,
} from "../../server/utils/admin-refunds";

type Row = Record<string, unknown>;

class Chain {
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row | null = null;
  private patch: Row | null = null;
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
  order() {
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
  update(payload: Row) {
    this.patch = payload;
    return this;
  }
  private rows() {
    const rows = [...(this.db[this.table] ?? [])].filter((row) =>
      this.filters.every((fn) => fn(row)),
    );
    return this.max === null ? rows : rows.slice(0, this.max);
  }
  async maybeSingle() {
    if (this.payload) {
      const row = {
        id: `${this.table}-${(this.db[this.table] ?? []).length + 1}`,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
        print_count: 0,
        last_printed_at: null,
        ...this.payload,
      };
      this.db[this.table] ??= [];
      this.db[this.table].push(row);
      return { data: row, error: null };
    }
    if (this.patch) {
      const row = this.rows()[0] ?? null;
      if (row) Object.assign(row, this.patch);
      return { data: row, error: null };
    }
    return { data: this.rows()[0] ?? null, error: null };
  }
  then(resolve: (value: { data: Row[]; error: null }) => void) {
    resolve({ data: this.rows(), error: null });
  }
}

function refund(overrides: Row = {}) {
  return {
    id: "refund-1",
    refund_type: "rental_booking_deposit",
    booking_id: "booking-1",
    user_id: "user-1",
    cancellation_event_id: "event-1",
    original_payment_source_type: "rental_booking_payment_attempt",
    original_rental_booking_payment_attempt_id: "attempt-1",
    original_mixed_payment_allocation_id: null,
    gateway: "omise",
    gateway_charge_id: "chrg_1",
    gateway_payment_reference: "src_1",
    refund_amount: 200,
    currency_code: "THB",
    refund_bank_name: "Bank",
    refund_bank_account_number: "1234567890",
    refund_bank_account_name: "Customer",
    refund_contact_phone: "0812345678",
    customer_note: "please refund",
    customer_confirmed_destination_at: "2026-06-01T00:00:00.000Z",
    status: "pending_admin_review",
    requested_at: "2026-06-01T00:00:00.000Z",
    processing_at: null,
    needs_customer_contact_at: null,
    refunded_at: null,
    failed_at: null,
    processed_by_user_id: null,
    admin_note: null,
    manual_transfer_reference: null,
    refund_proof_id: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}
function seed(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    payment_refunds: [refund()],
    rental_bookings: [
      {
        id: "booking-1",
        user_id: "user-1",
        status: "cancelled",
        product_name: "Camera",
        asset_name: "Camera",
        asset_code: "CAM-1",
        start_date: "2026-06-10",
        end_date: "2026-06-13",
        rental_days: 3,
        hub_id: "branch-1",
        hub_name: "Bangkok",
        booker_name: "Customer",
        booker_phone: "0812345678",
        deposit_amount: 5000,
        booking_deposit_paid_amount: 200,
        booking_deposit_payment_status: "paid",
        currency_code: "THB",
      },
    ],
    rental_booking_cancellation_events: [
      {
        id: "event-1",
        booking_id: "booking-1",
        user_id: "user-1",
        cancelled_at: "2026-06-01T00:00:00.000Z",
        cancellation_initiator: "customer",
        cancellation_source: "customer_web",
        pickup_date_snapshot: "2026-06-10",
        refund_cutoff_date_snapshot: "2026-06-07",
        refund_eligible: true,
        refund_amount_due: 200,
      },
    ],
    users: [
      {
        id: "user-1",
        full_name: "Customer",
        phone: "0812345678",
        kyc_status: "verified",
        id_card_url: null,
      },
    ],
    rental_booking_deposit_proofs: [],
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

describe("admin refund queue workflow", () => {
  it("lists and loads Booking Deposit refund requests", async () => {
    const db = seed();
    const list = await listAdminRefunds(client(db) as any, {
      status: "pending_admin_review",
    });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id: "refund-1",
      status: "pending_admin_review",
      refundAmount: 200,
    });
    const detail = await getAdminRefundDetail(client(db) as any, "refund-1");
    expect(detail.booking).toMatchObject({
      id: "booking-1",
      itemName: "Camera",
    });
    expect(detail.destination).toMatchObject({
      bankName: "Bank",
      contactPhone: "0812345678",
    });
  });

  it("returns refund status counts and unresolved work total", async () => {
    const db = seed({
      payment_refunds: [
        refund({ id: "refund-pending-1", status: "pending_admin_review" }),
        refund({ id: "refund-pending-2", status: "pending_admin_review" }),
        refund({ id: "refund-processing", status: "processing" }),
        refund({ id: "refund-contact", status: "needs_customer_contact" }),
        refund({ id: "refund-refunded", status: "refunded" }),
        refund({ id: "refund-failed", status: "failed" }),
      ],
    });

    const summary = await getAdminRefundSummary(client(db) as any);
    expect(summary).toEqual({
      pending_admin_review: 2,
      processing: 1,
      needs_customer_contact: 1,
      refunded: 1,
      failed: 1,
      unresolved_total: 4,
    });

    const list = await listAdminRefunds(client(db) as any, {
      status: "processing",
    });
    expect(list.items).toHaveLength(1);
    expect(list.summary).toMatchObject({
      processing: 1,
      refunded: 1,
      failed: 1,
      unresolved_total: 4,
    });
  });

  it("validates admin status transitions", async () => {
    const db = seed();
    await transitionAdminRefund({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "start-processing",
    });
    expect(db.payment_refunds[0]).toMatchObject({
      status: "processing",
      processed_by_user_id: "admin-1",
    });
    await transitionAdminRefund({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "needs-customer-contact",
      adminNote: "bad bank info",
    });
    expect(db.payment_refunds[0]).toMatchObject({
      status: "needs_customer_contact",
      admin_note: "bad bank info",
    });
    await transitionAdminRefund({
      client: client(
        seed({
          payment_refunds: [
            refund({
              status: "processing",
              processing_at: "2026-06-01T00:00:00.000Z",
            }),
          ],
        }),
      ) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "mark-failed",
      adminNote: "bank rejected",
    });
    await expect(
      transitionAdminRefund({
        client: client(db) as any,
        refundId: "refund-1",
        adminUserId: "admin-1",
        action: "start-processing",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("links refund proof rows from rental_booking_deposit_proofs", async () => {
    const db = seed({
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          amount: 200,
          payment_method: "bank_transfer",
          file_url: "https://cdn/proof.jpg",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          notes: "proof",
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    const detail = await linkRefundProof({
      client: client(db) as any,
      refundId: "refund-1",
      proofId: "proof-1",
      adminUserId: "admin-1",
    });
    expect(db.payment_refunds[0].refund_proof_id).toBe("proof-1");
    expect(detail.proof).toMatchObject({
      id: "proof-1",
      storagePath: "deposit-proofs/booking-1/refund.jpg",
    });
    await expect(
      linkRefundProof({
        client: client(
          seed({
            rental_booking_deposit_proofs: [
              {
                id: "proof-payment",
                booking_id: "booking-1",
                proof_kind: "payment",
                amount: 200,
                payment_method: "bank_transfer",
                file_url: "https://cdn/payment.jpg",
                storage_bucket: "catalog-media",
                storage_path: "deposit-proofs/booking-1/payment.jpg",
                mime_type: "image/jpeg",
                file_size_bytes: 100,
                created_at: "2026-06-01T00:00:00.000Z",
              },
            ],
          }),
        ) as any,
        refundId: "refund-1",
        proofId: "proof-payment",
        adminUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("marks refunded and issues refund confirmation idempotently", async () => {
    const db = seed({
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          amount: 200,
          payment_method: "bank_transfer",
          file_url: "https://cdn/proof.jpg",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    const first = await transitionAdminRefund({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "mark-refunded",
      manualTransferReference: "TR-1",
      refundProofId: "proof-1",
    });
    const second = await transitionAdminRefund({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "mark-refunded",
      manualTransferReference: "TR-1",
    });
    expect(first.detail).toMatchObject({
      status: "refunded",
      manualTransferReference: "TR-1",
    });
    expect(second.document?.alreadyIssued).toBe(true);
    expect(
      db.official_documents.filter(
        (row) =>
          row.document_type === "rental_booking_deposit_refund_confirmation",
      ),
    ).toHaveLength(1);
  });

  it("marks refunded without exposing refund confirmation until proof is linked", async () => {
    const db = seed({
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          amount: 200,
          payment_method: "bank_transfer",
          file_url: "https://cdn/proof.jpg",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    const marked = await transitionAdminRefund({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "mark-refunded",
      manualTransferReference: "TR-1",
    });
    expect(marked.document).toBeNull();
    expect(db.official_documents).toHaveLength(0);
    await linkRefundProof({
      client: client(db) as any,
      refundId: "refund-1",
      proofId: "proof-1",
      adminUserId: "admin-1",
    });
    expect(
      db.official_documents.filter(
        (row) =>
          row.document_type === "rental_booking_deposit_refund_confirmation",
      ),
    ).toHaveLength(1);
  });

  it("reconciles missing refund confirmation for already-refunded records", async () => {
    const db = seed({
      payment_refunds: [
        refund({
          status: "refunded",
          refunded_at: "2026-06-02T00:00:00.000Z",
          manual_transfer_reference: "TR-1",
          refund_proof_id: "proof-1",
        }),
      ],
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          amount: 200,
          payment_method: "bank_transfer",
          file_url: "https://cdn/proof.jpg",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    const result = await issueRefundConfirmationDocument({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
    });
    expect(result.alreadyIssued).toBe(false);
    expect(db.official_documents).toHaveLength(1);
    expect(JSON.stringify(db.official_documents[0].snapshot)).not.toContain(
      "storage_path",
    );
  });

  it("does not issue refund confirmation before proof upload", async () => {
    const db = seed({
      payment_refunds: [
        refund({
          status: "refunded",
          refunded_at: "2026-06-02T00:00:00.000Z",
          manual_transfer_reference: "TR-1",
        }),
      ],
    });
    await expect(
      issueRefundConfirmationDocument({
        client: client(db) as any,
        refundId: "refund-1",
        adminUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.official_documents).toHaveLength(0);
  });

  it("returns fresh admin detail after already-refunded reconciliation", async () => {
    const db = seed({
      payment_refunds: [
        refund({
          status: "refunded",
          refunded_at: "2026-06-02T00:00:00.000Z",
          manual_transfer_reference: "TR-1",
          refund_proof_id: "proof-1",
        }),
      ],
      rental_booking_deposit_proofs: [
        {
          id: "proof-1",
          booking_id: "booking-1",
          proof_kind: "refund",
          amount: 200,
          payment_method: "bank_transfer",
          file_url: "https://cdn/proof.jpg",
          storage_bucket: "catalog-media",
          storage_path: "deposit-proofs/booking-1/refund.jpg",
          mime_type: "image/jpeg",
          file_size_bytes: 100,
          created_at: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    const result = await transitionAdminRefund({
      client: client(db) as any,
      refundId: "refund-1",
      adminUserId: "admin-1",
      action: "mark-refunded",
      manualTransferReference: "TR-1",
    });
    expect(result.document?.alreadyIssued).toBe(false);
    expect(result.detail.documents.refundConfirmation).toMatchObject({
      documentType: "rental_booking_deposit_refund_confirmation",
    });
  });

  it("wires admin refund APIs/page and source guards", () => {
    const page = readFileSync(
      resolve(process.cwd(), "app/pages/admin/refunds.vue"),
      "utf8",
    );
    const adminLayout = readFileSync(
      resolve(process.cwd(), "app/layouts/admin.vue"),
      "utf8",
    );
    expect(page).toContain("/api/admin/refunds");
    expect(page).toContain("start-processing");
    expect(page).toContain("needs-customer-contact");
    expect(page).toContain("mark-failed");
    expect(page).toContain("mark-refunded");
    expect(page).toContain("proofUploading");
    expect(page).toContain("proofError");
    expect(page).toContain("await loadQueue()");
    expect(page).toContain("adminRefunds.title");
    expect(page).toContain("adminRefunds.subtitle");
    expect(page).toContain("adminRefunds.filters.label");
    expect(page).toContain("adminRefunds.status.${status}");
    expect(page).toContain('role="tablist"');
    expect(page).toContain('role="tab"');
    expect(page).toContain("statusCount(s)");
    expect(page).toContain("setRefundWorkSummary(res.summary)");
    expect(page).toContain("adminRefunds.proof.title");
    expect(page).toContain("adminRefunds.proof.uploadAction");
    expect(page).toContain("adminRefunds.proof.emptyTitle");
    expect(page).toContain("adminRefunds.proof.existsTitle");
    expect(page).toContain("selected.proof?.fileUrl");
    expect(page).toContain(
      'accept="application/pdf,image/jpeg,image/png,image/webp"',
    );
    expect(page).toContain('ref="proofInput"');
    expect(page).toContain('class="sr-only"');
    expect(page).toContain('@input="onProofFile"');
    expect(page).toContain('@change="onProofFile"');
    expect(page).toContain("function selectProofFile()");
    expect(page).toContain("proofInput.value?.click()");
    expect(page).toContain('@click="selectProofFile"');
    expect(page).toContain("proofSelectLabel");
    expect(page).toContain("adminRefunds.proof.selectFile");
    expect(page).toContain("adminRefunds.proof.selectNewFile");
    expect(page).toContain("adminRefunds.proof.selectedFile");
    expect(page).toContain("proofFileName");
    expect(page).toContain("canUploadProof");
    expect(page).toContain(':disabled="!canUploadProof"');
    expect(page).toContain("adminRefunds.actions.markRefunded");
    expect(page).not.toContain("Admin Refund Queue");
    expect(page).not.toContain("Manual Booking Deposit refund processing");
    expect(adminLayout).toContain("Refunds");
    expect(adminLayout).toContain("/admin/refunds");
    expect(adminLayout).toContain("route.path === item.to");
    for (const file of [
      "server/api/admin/refunds/index.get.ts",
      "server/api/admin/refunds/[id].get.ts",
      "server/api/admin/refunds/[id]/start-processing.post.ts",
      "server/api/admin/refunds/[id]/needs-customer-contact.post.ts",
      "server/api/admin/refunds/[id]/mark-failed.post.ts",
      "server/api/admin/refunds/[id]/mark-refunded.post.ts",
      "server/api/admin/refunds/[id]/proof.post.ts",
      "server/api/admin/refunds/summary.get.ts",
    ]) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8")).toContain(
        "requirePlatformAdmin",
      );
    }
    const adminRefundWork = readFileSync(
      resolve(process.cwd(), "app/composables/useAdminRefundWork.ts"),
      "utf8",
    );
    expect(adminRefundWork).toContain("/api/admin/refunds/summary");
    expect(adminRefundWork).toContain("admin-refund-work");
    expect(adminRefundWork).toContain('table: "payment_refunds"');
    expect(adminLayout).toContain("useAdminRefundWork()");
    expect(adminLayout).toContain("refundsBadge");
    expect(adminLayout).toContain(
      '{ label: "Refunds", to: "/admin/refunds", badge: refundsBadge.value }',
    );
  });
});
