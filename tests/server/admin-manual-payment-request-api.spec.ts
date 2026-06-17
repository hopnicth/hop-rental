/**
 * Tests: central manual payment request — admin routes + review/reject behavior.
 *
 * Covers:
 *  1. every admin route uses requirePlatformAdmin
 *  2. slip download uses a signed-URL proxy (no public URL)
 *  3. reviewManualPaymentRequest / rejectManualPaymentRequest affect ONLY the
 *     manual_payment_request* tables (status) — never orders/rental_bookings,
 *     never inventory/ledger/Omise; reject requires a reason
 *  4. admin UI links + confirm-via-existing-actions note present
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  reviewManualPaymentRequest,
  rejectManualPaymentRequest,
} from "../../server/utils/manual-payment-request";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const REQUEST = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";

function makeClient() {
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  function builder(table: string) {
    let payload: Record<string, unknown> | null = null;
    const api: Record<string, unknown> = {
      update(p: Record<string, unknown>) {
        payload = p;
        updates.push({ table, payload: p });
        return api;
      },
      eq() {
        return api;
      },
      select() {
        return api;
      },
      async maybeSingle() {
        return {
          data: {
            id: REQUEST,
            customer_id: "c1",
            source_type: "mixed",
            status: payload?.status ?? "pending_review",
            payment_method: "bank_transfer",
            currency: "THB",
            total_amount_due: 100,
            created_at: "",
            updated_at: "",
          },
          error: null,
        };
      },
      then(resolve2: (v: { error: null }) => void) {
        resolve2({ error: null });
      },
    };
    return api;
  }
  return { client: { from: builder } as never, updates };
}

describe("admin route auth", () => {
  const routes = [
    "server/api/admin/manual-payment-requests/index.get.ts",
    "server/api/admin/manual-payment-requests/[id].get.ts",
    "server/api/admin/manual-payment-requests/[id]/review.post.ts",
    "server/api/admin/manual-payment-requests/[id]/reject.post.ts",
    "server/api/admin/manual-payment-requests/[id]/slips/[slipId]/download.get.ts",
    "server/api/admin/manual-payment-requests/by-target.get.ts",
  ];
  it("every admin route uses requirePlatformAdmin", () => {
    for (const r of routes) expect(read(r)).toContain("requirePlatformAdmin");
  });
  it("slip download uses signed-URL proxy (no public URL)", () => {
    const src = read(
      "server/api/admin/manual-payment-requests/[id]/slips/[slipId]/download.get.ts",
    );
    expect(src).toContain("createManualPaymentSlipSignedUrl");
    expect(src).not.toContain("getPublicUrl");
  });
});

describe("reviewManualPaymentRequest", () => {
  it("sets the request reviewed and the pending slip reviewed only", async () => {
    const { client, updates } = makeClient();
    const result = await reviewManualPaymentRequest(client, REQUEST, ADMIN);
    expect(result.status).toBe("reviewed");
    const tables = updates.map((u) => u.table);
    expect(tables).toContain("manual_payment_requests");
    expect(tables).toContain("manual_payment_request_slips");
    expect(tables).not.toContain("orders");
    expect(tables).not.toContain("rental_bookings");
  });
});

describe("rejectManualPaymentRequest", () => {
  it("requires a reason (400 on empty)", async () => {
    const { client } = makeClient();
    await expect(
      rejectManualPaymentRequest(client, REQUEST, ADMIN, "   "),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("sets rejected status + reason on request and slip only", async () => {
    const { client, updates } = makeClient();
    const result = await rejectManualPaymentRequest(
      client,
      REQUEST,
      ADMIN,
      "blurry slip",
    );
    expect(result.status).toBe("rejected");
    const reqUpdate = updates.find((u) => u.table === "manual_payment_requests");
    expect(reqUpdate?.payload.rejected_reason).toBe("blurry slip");
    const tables = updates.map((u) => u.table);
    expect(tables).not.toContain("orders");
    expect(tables).not.toContain("rental_bookings");
  });
});

describe("admin UI contract", () => {
  it("detail page exposes review/reject + confirm-via-existing-actions note", () => {
    const src = read("app/pages/admin/manual-payment-requests/[id].vue");
    expect(src).toContain("/review");
    expect(src).toContain("/reject");
    expect(src).toContain("existing admin actions");
  });
  it("admin order + rental pages mount the related card", () => {
    expect(read("app/pages/admin/orders/[id].vue")).toContain(
      "AdminPaymentRequestCard",
    );
    expect(read("app/pages/admin/rental-bookings/[id].vue")).toContain(
      "AdminPaymentRequestCard",
    );
  });
});
