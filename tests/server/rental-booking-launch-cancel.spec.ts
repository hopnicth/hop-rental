/**
 * Tests: launch-era cancellation (K-1, migration 145)
 *
 * Covers:
 *  1. Both actor paths — customer self-serve (ownership enforced) and staff
 *  2. Named-error surfaces: every RPC RAISE -> approved HTTP + Thai copy
 *  3. Slot-freed assertion at the contract level (the RPC is the slot writer;
 *     the real DB slot-release proof ran at the migration-145 gate)
 *  4. ZERO money: no deposit/settlement/ledger table is touched
 *  5. Endpoint pins — customer regime branch, staff auth, POS repointed off
 *     the raw status flip, legacy gated RPCs never called
 *  (the auto/cron path is covered at the DB layer by the 145 acceptance run)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

vi.mock("h3", () => ({
  createError: (o: { statusCode?: number; statusMessage?: string; data?: unknown }) =>
    Object.assign(new Error(o.statusMessage), o),
}));

const { cancelRentalBookingLaunch, launchCancelError } = await import(
  "../../server/utils/rental-booking-launch-cancel"
);

const BOOKING = "11111111-2222-4333-8444-555555555555";
const OWNER = "99999999-2222-4333-8444-555555555555";

function makeClient(
  opts: { rpcError?: { message: string } | null; ownerUserId?: string | null } = {},
) {
  const calls = {
    rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    tables: [] as string[],
  };
  const client: any = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ fn, args });
      return opts.rpcError
        ? { data: null, error: opts.rpcError }
        : {
            data: { ok: true, state: "cancelled", was_already_cancelled: false },
            error: null,
          };
    },
    from(table: string) {
      calls.tables.push(table);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data:
            opts.ownerUserId === null
              ? null
              : { id: BOOKING, user_id: opts.ownerUserId ?? OWNER },
          error: null,
        }),
      };
      return chain;
    },
  };
  return { client, calls };
}

function staffInput(client: any, over: Record<string, unknown> = {}) {
  return {
    client,
    rawBookingId: BOOKING,
    actorUserId: "staff-1",
    actorRole: "staff",
    initiator: "staff" as const,
    source: "admin_rental_detail" as const,
    reason: "ลูกค้าโทรมายกเลิก",
    ...over,
  } as any;
}

// ── 1. Both actor paths ──────────────────────────────────────────────────────

describe("actor paths", () => {
  it("STAFF: calls the lean RPC with the staff actor and admin source", async () => {
    const { client, calls } = makeClient();
    const result = await cancelRentalBookingLaunch(staffInput(client));
    expect(result).toMatchObject({ ok: true, state: "cancelled" });
    expect(calls.rpcs).toHaveLength(1);
    expect(calls.rpcs[0]!.fn).toBe("f_cancel_rental_booking_launch");
    expect(calls.rpcs[0]!.args).toMatchObject({
      p_booking_id: BOOKING,
      p_actor_user_id: "staff-1",
      p_initiator: "staff",
      p_source: "admin_rental_detail",
    });
  });

  it("CUSTOMER: own booking succeeds, ownership checked BEFORE the RPC", async () => {
    const { client, calls } = makeClient({ ownerUserId: OWNER });
    await cancelRentalBookingLaunch(
      staffInput(client, {
        actorUserId: OWNER,
        actorRole: "customer",
        initiator: "customer",
        source: "customer_web",
        requireOwnerUserId: OWNER,
      }),
    );
    expect(calls.tables).toContain("rental_bookings");
    expect(calls.rpcs[0]!.args).toMatchObject({
      p_initiator: "customer",
      p_source: "customer_web",
    });
  });

  it("CUSTOMER: another user's booking -> 403 and the RPC is NEVER called", async () => {
    const { client, calls } = makeClient({ ownerUserId: "someone-else" });
    await expect(
      cancelRentalBookingLaunch(
        staffInput(client, {
          actorUserId: OWNER,
          initiator: "customer",
          source: "customer_web",
          requireOwnerUserId: OWNER,
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("reason is mandatory; a blank reason never reaches the RPC", async () => {
    const { client, calls } = makeClient();
    await expect(
      cancelRentalBookingLaunch(staffInput(client, { reason: "   " })),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("a malformed booking id 404s without touching the RPC", async () => {
    const { client, calls } = makeClient();
    await expect(
      cancelRentalBookingLaunch(staffInput(client, { rawBookingId: "nope" })),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.rpcs).toHaveLength(0);
  });

  it("idempotent replay is surfaced, not treated as an error", async () => {
    const { client } = makeClient();
    client.rpc = async () => ({
      data: { ok: true, state: "cancelled", was_already_cancelled: true },
      error: null,
    });
    const result = await cancelRentalBookingLaunch(staffInput(client));
    expect(result.wasAlreadyCancelled).toBe(true);
  });
});

// ── 2. Named-error surfaces ──────────────────────────────────────────────────

describe("named errors -> HTTP", () => {
  const CASES: Array<[string, number]> = [
    ["LAUNCH_CANCEL_BOOKING_NOT_FOUND", 404],
    ["LAUNCH_CANCEL_BOOKING_ID_REQUIRED", 400],
    ["LAUNCH_CANCEL_BOOKING_NOT_CONFIRMED", 409],
    ["LAUNCH_CANCEL_BOOKING_ALREADY_PICKED_UP", 409],
    ["LAUNCH_CANCEL_BOOKING_ALREADY_RETURNED", 409],
    ["LAUNCH_CANCEL_BOOKING_NO_SHOW", 409],
    ["LAUNCH_CANCEL_BOOKING_NOT_CANCELLABLE", 409],
    ["LAUNCH_CANCEL_SETTLEMENT_EXISTS", 409],
    ["LAUNCH_CANCEL_STATE_CONFLICT", 409],
    ["LAUNCH_CANCEL_REASON_REQUIRED", 422],
    ["LAUNCH_CANCEL_ACTOR_REQUIRED", 422],
    ["LAUNCH_CANCEL_INITIATOR_INVALID", 422],
    ["LAUNCH_CANCEL_SOURCE_INVALID", 422],
  ];

  it.each(CASES)("%s -> %i with Thai copy", (code, status) => {
    const mapped = launchCancelError(code);
    expect(mapped.statusCode).toBe(status);
    expect(mapped.statusMessage.length).toBeGreaterThan(0);
    // Glossary: a launch cancel moves no money, so no deposit vocabulary.
    expect(mapped.statusMessage).not.toContain("มัดจำ");
  });

  it("keys on the leading token (Postgres appends a detail suffix)", () => {
    expect(
      launchCancelError("LAUNCH_CANCEL_BOOKING_NOT_CANCELLABLE: draft").statusCode,
    ).toBe(409);
  });

  it("unknown codes fall back to 500", () => {
    expect(launchCancelError("boom").statusCode).toBe(500);
  });

  it("an RPC RAISE surfaces the mapped status and carries the machine code", async () => {
    const { client } = makeClient({
      rpcError: { message: "LAUNCH_CANCEL_SETTLEMENT_EXISTS" },
    });
    await expect(cancelRentalBookingLaunch(staffInput(client))).rejects.toMatchObject({
      statusCode: 409,
      data: { launchCancelCode: "LAUNCH_CANCEL_SETTLEMENT_EXISTS" },
    });
  });
});

// ── 3/4. Slot writer + ZERO money ────────────────────────────────────────────

describe("slot release + zero money", () => {
  it("the RPC is the ONLY writer the wrapper invokes (slot release is its job)", async () => {
    const { client, calls } = makeClient();
    await cancelRentalBookingLaunch(staffInput(client));
    expect(calls.rpcs.map((c) => c.fn)).toEqual(["f_cancel_rental_booking_launch"]);
  });

  it("touches NO deposit / settlement / ledger table", async () => {
    const { client, calls } = makeClient();
    await cancelRentalBookingLaunch(staffInput(client));
    for (const t of [
      "rental_booking_settlements",
      "rental_held_balance_events",
      "payment_allocations",
      "rental_booking_deposit_proofs",
      "official_documents",
    ]) {
      expect(calls.tables).not.toContain(t);
    }
  });

  it("never calls a 135-gated legacy cancel RPC", async () => {
    const { client, calls } = makeClient();
    await cancelRentalBookingLaunch(staffInput(client));
    const fns = calls.rpcs.map((c) => c.fn);
    expect(fns).not.toContain("f_cancel_rental_booking_admin");
    expect(fns).not.toContain("f_cancel_customer_rental_booking_refund_request");
  });
});

// ── 5. Endpoint pins ─────────────────────────────────────────────────────────

describe("endpoint pins", () => {
  it("staff endpoint uses requirePlatformAdmin and the launch wrapper", () => {
    const src = read("server/api/admin/rental-bookings/[id]/cancel.post.ts");
    expect(src).toContain("requirePlatformAdmin");
    expect(src).toContain("cancelRentalBookingLaunch");
    expect(src).toContain("admin_rental_detail");
  });

  it("customer endpoint branches on the deposit regime (revival-safe)", () => {
    const src = read("server/api/user/rental-bookings/[id]/cancel.post.ts");
    expect(src).toContain("booking_deposit_payment_status");
    expect(src).toContain("cancelRentalBookingLaunch");
    // The deposit-era path is retained for revival, not deleted.
    expect(src).toContain("cancelCustomerRentalBooking");
    // Ownership is enforced on the launch branch.
    expect(src).toContain("requireOwnerUserId");
  });

  it("POS history cancel no longer raw-flips the booking status", () => {
    const src = read("server/api/admin/pos/history/cancel.post.ts");
    expect(src).toContain("cancelRentalBookingLaunch");
    expect(src).toContain("pos_history");
    // The Case-2 B7 raw flip is gone.
    expect(src).not.toContain('.update({ status: "cancelled" })');
  });

  it("migration 145 ships the RPC, the sweep and the cron at 17:05 UTC", () => {
    const sql = read("supabase/migrations/145_launch_cancel_and_auto_cancel_cron.sql");
    expect(sql).toContain("f_cancel_rental_booking_launch");
    expect(sql).toContain("f_auto_cancel_expired_rental_bookings");
    expect(sql).toContain("'5 17 * * *'");
    expect(sql).toContain("rental-launch-auto-cancel");
    // auto/manual distinction lives in the operation value.
    expect(sql).toContain("'auto_no_show_cancel'");
    expect(sql).toContain("'launch_booking_cancel'");
  });
});
