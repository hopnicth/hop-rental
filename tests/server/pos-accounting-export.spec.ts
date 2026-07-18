/**
 * Tests: GET /api/admin/pos/accounting-export — T2 settlement-first read
 * (decisions.md §b addendum item 7)
 *
 * Covers:
 *  1. Settled booking exports the SETTLEMENT figures (refund_amount, derived
 *     status, additional collection, settlement ref) — never the legacy
 *     deposit_refund_* columns
 *  2. Legacy booking (no settlement row) exports the legacy columns unchanged
 *  3. COLLECT-case settlement reconcilable: additional collection exposed in
 *     its own column with status collected_additional
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  rentals: [] as any[],
  settlements: [] as any[],
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  getQuery: () => ({}),
  setHeader: () => undefined,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => ({ adminClient: makeClient() }),
}));

vi.mock("~~/server/utils/admin-orders", () => ({
  isMissingRentalBookingColumn: () => false,
}));

function makeClient(): any {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        gte: () => chain,
        lte: () => chain,
        eq: () => chain,
        in: async () =>
          table === "rental_booking_settlements"
            ? { data: mockState.settlements, error: null }
            : { data: [], error: null },
        then: (resolveFn: (v: unknown) => unknown) => {
          const data =
            table === "orders" ? [] : table === "rental_bookings" ? mockState.rentals : [];
          return Promise.resolve({ data, error: null }).then(resolveFn);
        },
      };
      return chain;
    },
  };
}

const handler = (
  await import("../../server/api/admin/pos/accounting-export.get")
).default;

function rental(over: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    created_at: "2026-07-15T10:00:00Z",
    walk_in_phone: "0800000001",
    asset_code: "AST-1",
    asset_name: "Excavator",
    rental_days: 3,
    rental_total: 1500,
    deposit_paid_amount: 1800,
    deposit_payment_method: "cash",
    deposit_refund_status: "refunded",
    deposit_refund_amount: 1800, // legacy security-deposit-scoped figure
    checkout_total_amount: 0,
    checkout_paid_amount: 0,
    pos_branch_name: "HQ",
    ...over,
  };
}

function parseCsv(csvText: string): string[][] {
  return csvText
    .replace(/^﻿/, "")
    .split("\n")
    .map((line) => line.split(","));
}

beforeEach(() => {
  mockState.rentals = [];
  mockState.settlements = [];
});

describe("accounting export — settlement-first (T2)", () => {
  it("SETTLED booking: refund figure comes from the settlement row, with ref", async () => {
    mockState.rentals = [rental()];
    mockState.settlements = [
      {
        id: "settle-1",
        booking_id: "booking-1",
        refund_amount: 2000, // ledger truth (BDC 200 + security 1800)
        additional_collection_amount: 0,
        settlement_applied_amount: 0,
      },
    ];
    const csv = parseCsv(await handler({ node: { req: {} } } as any));
    const header = csv[0]!;
    const row = csv[1]!;
    const col = (name: string) => row[header.indexOf(name)];
    expect(col("Refund Status")).toBe("refunded");
    expect(col("Refund Amount")).toBe("2000.00"); // NOT the legacy 1800
    expect(col("Additional Collection")).toBe("0.00");
    expect(col("Settlement Ref")).toBe("settle-1");
  });

  it("LEGACY booking (no settlement): legacy columns exported unchanged", async () => {
    mockState.rentals = [rental()];
    const csv = parseCsv(await handler({ node: { req: {} } } as any));
    const header = csv[0]!;
    const row = csv[1]!;
    const col = (name: string) => row[header.indexOf(name)];
    expect(col("Refund Status")).toBe("refunded");
    expect(col("Refund Amount")).toBe("1800.00"); // legacy figure preserved
    expect(col("Additional Collection")).toBe("0.00");
    expect(col("Settlement Ref")).toBe("");
  });

  it("COLLECT-case settlement: additional collection exposed, status collected_additional", async () => {
    mockState.rentals = [rental({ deposit_refund_status: "not_refunded", deposit_refund_amount: 0 })];
    mockState.settlements = [
      {
        id: "settle-2",
        booking_id: "booking-1",
        refund_amount: 0,
        additional_collection_amount: 500,
        settlement_applied_amount: 2500,
      },
    ];
    const csv = parseCsv(await handler({ node: { req: {} } } as any));
    const header = csv[0]!;
    const row = csv[1]!;
    const col = (name: string) => row[header.indexOf(name)];
    expect(col("Refund Status")).toBe("collected_additional");
    expect(col("Refund Amount")).toBe("0.00");
    expect(col("Additional Collection")).toBe("500.00");
    expect(col("Settlement Ref")).toBe("settle-2");
  });
});
