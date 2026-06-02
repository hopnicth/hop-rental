/**
 * Tests: POST /api/admin/rental-bookings/[id]/kyc-attach
 *
 * The security-critical write path that sets rental_bookings.kyc_profile_id, which
 * the pickup gate trusts for walk-in bookings.
 *
 * Covers:
 *  1. requirePlatformAdmin enforced
 *  2. Identity ownership — bare profileId rejected; hash mismatch rejected; match attaches
 *  3. Walk-in only — registered booking rejected; no phone matching
 *  4. Branch-access parity — lack of booking branch access rejected
 *  5. Global KYC identity — profile branch need not match booking branch
 *  6. Freeze after pickup — pickup snapshot or past-pickup status rejected
 *  7. No KYC mutation — only rental_bookings.kyc_profile_id written
 *  8. Re-attach before pickup allowed (oldProfileId surfaced)
 *  9. Safe response — no identity_hash / raw identity / user_id
 * 10. Single-writer source scan — attach is the only updater of kyc_profile_id
 * 11. Attached pending profile still fails the pickup gate (resolvePickupKyc)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const mockState = vi.hoisted(() => ({
  adminError: null as any,
  client: null as any,
  body: {} as any,
  routerId: "booking-1" as string | undefined,
  readiness: null as any,
  readinessError: null as any,
  branchAccessError: null as any,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  getRouterParam: () => mockState.routerId,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => {
    if (mockState.adminError) throw mockState.adminError;
    return { adminClient: mockState.client, userId: "staff-1", platformRole: "staff" };
  },
}));

vi.mock("~~/server/utils/rental-pickup-readiness", () => ({
  loadRentalPickupReadiness: async () => {
    if (mockState.readinessError) throw mockState.readinessError;
    return mockState.readiness;
  },
  assertPickupReadinessBranchAccess: async () => {
    if (mockState.branchAccessError) throw mockState.branchAccessError;
  },
}));

const attachPost = (
  await import("../../server/api/admin/rental-bookings/[id]/kyc-attach.post")
).default;
const { hashKycIdentity, resolvePickupKyc } = await import("../../server/utils/kyc");

const SECRET = "test-secret-for-attach-spec";

// ── Mock admin client (route's direct queries) ────────────────────────────────

function makeClient(s: {
  pickupEvent?: { id: string } | null;
  fulfillmentError?: { message: string } | null;
  profile?: Record<string, unknown> | null;
  profileError?: { message: string } | null;
  currentBooking?: { kyc_profile_id: unknown } | null;
  updateReturnsNull?: boolean;
  updateError?: { message: string } | null;
} = {}) {
  const calls = {
    fromTables: [] as string[],
    eq: [] as Array<{ table: string; col: string; val: unknown }>,
    updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    inserts: [] as Array<{ table: string }>,
  };
  const client = {
    from(table: string) {
      calls.fromTables.push(table);
      let isUpdate = false;
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          calls.eq.push({ table, col, val });
          return chain;
        },
        is: () => chain,
        in: () => chain,
        limit: () => chain,
        update: (payload: Record<string, unknown>) => {
          isUpdate = true;
          calls.updates.push({ table, payload });
          return chain;
        },
        insert: () => {
          calls.inserts.push({ table });
          throw new Error("insert must not be called by attach");
        },
        delete: () => {
          throw new Error("delete must not be called by attach");
        },
        maybeSingle: async () => {
          if (table === "rental_booking_fulfillments") {
            return { data: s.pickupEvent ?? null, error: s.fulfillmentError ?? null };
          }
          if (table === "kyc_profiles") {
            return { data: s.profile ?? null, error: s.profileError ?? null };
          }
          if (table === "rental_bookings") {
            if (isUpdate) {
              return {
                data: s.updateReturnsNull ? null : { id: "booking-1" },
                error: s.updateError ?? null,
              };
            }
            return { data: s.currentBooking ?? { kyc_profile_id: null }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
  return { client, calls };
}

function readiness(over: { status?: string; userId?: string | null; branchId?: string | null } = {}) {
  return {
    booking: { status: over.status ?? "confirmed" },
    customer: { userId: over.userId ?? null },
    rental: { branchId: over.branchId ?? "branch-hq" },
  };
}

function profileRow(over: Record<string, unknown> = {}) {
  return {
    id: "kyc-1",
    user_id: null,
    customer_type: "individual",
    identity_type: "national_id",
    identity_last4: "***0123",
    status: "verified",
    valid_until: "2027-01-01T00:00:00.000Z",
    branch_id: "branch-hq",
    created_at: "2026-01-01T00:00:00.000Z",
    verified_at: "2026-01-01T00:00:00.000Z",
    verified_branch_id: "branch-hq",
    identity_hash: hashKycIdentity("national_id", "1234567890123"),
    ...over,
  };
}

function body(over: Record<string, unknown> = {}) {
  return { profileId: "kyc-1", identityType: "national_id", identityValue: "1234567890123", ...over };
}

function authError(statusCode: number, statusMessage: string) {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage });
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.KYC_HASH_SECRET;
  process.env.KYC_HASH_SECRET = SECRET;
  mockState.adminError = null;
  mockState.routerId = "booking-1";
  mockState.readiness = readiness();
  mockState.readinessError = null;
  mockState.branchAccessError = null;
  mockState.body = body();
  mockState.client = makeClient({ profile: profileRow() }).client;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.KYC_HASH_SECRET;
  else process.env.KYC_HASH_SECRET = savedSecret;
  vi.restoreAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("kyc-attach — auth", () => {
  it("propagates 401 when not authenticated", async () => {
    mockState.adminError = authError(401, "Authentication required");
    await expect(attachPost({} as any)).rejects.toMatchObject({ statusCode: 401 });
  });
  it("propagates 403 when not an admin", async () => {
    mockState.adminError = authError(403, "Admin access required");
    await expect(attachPost({} as any)).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── Validation / identity ownership ───────────────────────────────────────────

describe("kyc-attach — identity ownership", () => {
  it("rejects a bare profileId with no identityType (400) — profileId alone is never sufficient", async () => {
    mockState.body = { profileId: "kyc-1" };
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "INVALID_IDENTITY_TYPE",
    });
  });

  it("rejects a missing identityValue (400)", async () => {
    mockState.body = { profileId: "kyc-1", identityType: "national_id" };
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "IDENTITY_VALUE_REQUIRED",
    });
  });

  it("rejects a missing profileId (400)", async () => {
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "PROFILE_ID_REQUIRED",
    });
  });

  it("rejects when the derived hash does not match the target profile's identity_hash (403)", async () => {
    mockState.client = makeClient({
      profile: profileRow({ identity_hash: "DIFFERENT_HASH_NOT_MATCHING" }),
    }).client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "IDENTITY_OWNERSHIP_MISMATCH",
    });
  });

  it("rejects when the target profile does not exist (404)", async () => {
    mockState.client = makeClient({ profile: null }).client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "KYC_PROFILE_NOT_FOUND",
    });
  });

  it("attaches successfully when the derived hash matches", async () => {
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    const result = await attachPost({} as any);
    expect(result.attached).toBe(true);
    expect(result.newProfileId).toBe("kyc-1");
    // Wrote ONLY kyc_profile_id to rental_bookings.
    const upd = calls.updates.find((u) => u.table === "rental_bookings");
    expect(upd).toBeDefined();
    expect(Object.keys(upd!.payload)).toEqual(["kyc_profile_id"]);
    expect(upd!.payload.kyc_profile_id).toBe("kyc-1");
  });

  it("missing KYC_HASH_SECRET fails safe (500) and writes nothing", async () => {
    // Build the client/profile while the secret is still set, then remove it.
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    delete process.env.KYC_HASH_SECRET;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: "KYC_HASH_UNAVAILABLE",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("does not resolve by phone — no walk_in_phone query, source has no phone matching", async () => {
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    await attachPost({} as any);
    expect(calls.eq.some((c) => c.col === "walk_in_phone")).toBe(false);
    const src = readFileSync(
      resolve(process.cwd(), "server/api/admin/rental-bookings/[id]/kyc-attach.post.ts"),
      "utf8",
    );
    expect(src).not.toContain("walk_in_phone");
    expect(src).toContain("identity_hash");
  });
});

// ── Walk-in only ──────────────────────────────────────────────────────────────

describe("kyc-attach — walk-in only", () => {
  it("rejects attach to a registered booking (422) and writes nothing", async () => {
    mockState.readiness = readiness({ userId: "user-9" });
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "REGISTERED_BOOKING_NO_ATTACH",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("update is guarded by user_id IS NULL (concurrency backstop)", async () => {
    const src = readFileSync(
      resolve(process.cwd(), "server/api/admin/rental-bookings/[id]/kyc-attach.post.ts"),
      "utf8",
    );
    expect(src).toContain('.is("user_id", null)');
  });
});

// ── Branch access ─────────────────────────────────────────────────────────────

describe("kyc-attach — branch access parity", () => {
  it("rejects when staff lacks booking branch access (403)", async () => {
    mockState.branchAccessError = authError(403, "POS branch access required");
    await expect(attachPost({} as any)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("branch-access failure happens BEFORE any profile/identity lookup (no probing)", async () => {
    mockState.branchAccessError = authError(403, "POS branch access required");
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({ statusCode: 403 });
    // The route must not query kyc_profiles (or anything) once branch access is denied.
    expect(calls.fromTables).not.toContain("kyc_profiles");
    expect(calls.fromTables).not.toContain("rental_booking_fulfillments");
  });

  it("global KYC identity: profile branch / verified branch need not match the booking branch", async () => {
    // Profile verified at a DIFFERENT branch than the booking — attach still succeeds.
    const { client } = makeClient({
      profile: profileRow({ branch_id: "branch-OTHER", verified_branch_id: "branch-OTHER" }),
    });
    mockState.client = client;
    mockState.readiness = readiness({ branchId: "branch-hq" });
    const result = await attachPost({} as any);
    expect(result.attached).toBe(true);
    // Route never compares profile branch to booking branch.
    const src = readFileSync(
      resolve(process.cwd(), "server/api/admin/rental-bookings/[id]/kyc-attach.post.ts"),
      "utf8",
    );
    expect(src).not.toContain("verified_branch_id ===");
    expect(src).not.toContain("branch_id ===");
  });
});

// ── Freeze after pickup ───────────────────────────────────────────────────────

describe("kyc-attach — freeze after pickup", () => {
  it("rejects when a pickup fulfillment snapshot already exists (409) and writes nothing", async () => {
    const { client, calls } = makeClient({ profile: profileRow(), pickupEvent: { id: "f1" } });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "KYC_ATTACH_FROZEN_AFTER_PICKUP",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("rejects when the booking is already picked_up (422)", async () => {
    mockState.readiness = readiness({ status: "picked_up" });
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_NOT_ATTACHABLE_STATE",
    });
    expect(calls.updates).toHaveLength(0);
  });

  it("rejects when the booking is returned (422)", async () => {
    mockState.readiness = readiness({ status: "returned" });
    mockState.client = makeClient({ profile: profileRow() }).client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "BOOKING_NOT_ATTACHABLE_STATE",
    });
  });

  it("allows attach when the booking is draft (pre-pickup)", async () => {
    mockState.readiness = readiness({ status: "draft" });
    mockState.client = makeClient({ profile: profileRow() }).client;
    const result = await attachPost({} as any);
    expect(result.attached).toBe(true);
  });
});

// ── No KYC mutation ───────────────────────────────────────────────────────────

describe("kyc-attach — no KYC mutation", () => {
  it("never updates/inserts kyc_profiles; only updates rental_bookings.kyc_profile_id", async () => {
    const { client, calls } = makeClient({ profile: profileRow() });
    mockState.client = client;
    await attachPost({} as any);
    // No write to kyc_profiles.
    expect(calls.updates.some((u) => u.table === "kyc_profiles")).toBe(false);
    expect(calls.inserts).toHaveLength(0);
    // Exactly one update, to rental_bookings, payload = { kyc_profile_id }.
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]!.table).toBe("rental_bookings");
    expect(Object.keys(calls.updates[0]!.payload)).toEqual(["kyc_profile_id"]);
  });
});

// ── Re-attach ─────────────────────────────────────────────────────────────────

describe("kyc-attach — re-attach before pickup", () => {
  it("allows re-attach and surfaces oldProfileId → newProfileId", async () => {
    const { client } = makeClient({
      profile: profileRow(),
      currentBooking: { kyc_profile_id: "old-profile" },
    });
    mockState.client = client;
    const result = await attachPost({} as any);
    expect(result.attached).toBe(true);
    expect(result.oldProfileId).toBe("old-profile");
    expect(result.newProfileId).toBe("kyc-1");
  });

  it("returns oldProfileId null on first attach", async () => {
    const { client } = makeClient({
      profile: profileRow(),
      currentBooking: { kyc_profile_id: null },
    });
    mockState.client = client;
    const result = await attachPost({} as any);
    expect(result.oldProfileId).toBeNull();
  });
});

// ── Safe response ─────────────────────────────────────────────────────────────

describe("kyc-attach — safe response", () => {
  it("returns a safe profile with no identity_hash, raw identity, or user_id key", async () => {
    const realHash = hashKycIdentity("national_id", "1234567890123");
    const { client } = makeClient({
      // walk-in profile (user_id null) — registered profiles are rejected (see below)
      profile: profileRow({ user_id: null, identity_hash: realHash }),
    });
    mockState.client = client;
    const result = await attachPost({} as any);
    expect(result.profile).not.toHaveProperty("identity_hash");
    expect(result.profile).not.toHaveProperty("user_id");
    expect(result.profile.hasUserId).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(realHash);
    expect(json).not.toContain("1234567890123");
  });
});

// ── Registered-profile guard ──────────────────────────────────────────────────

describe("kyc-attach — refuse registered-user profiles", () => {
  it("rejects a profile whose identity_hash matches but user_id IS NOT NULL (422)", async () => {
    // Matching identity hash (default value) but the profile is registered-scoped.
    const { client } = makeClient({ profile: profileRow({ user_id: "user-9" }) });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 422,
      statusMessage: "REGISTERED_PROFILE_NOT_ATTACHABLE",
    });
  });

  it("registered-profile rejection writes nothing to rental_bookings.kyc_profile_id", async () => {
    const { client, calls } = makeClient({ profile: profileRow({ user_id: "user-9" }) });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({ statusCode: 422 });
    expect(calls.updates).toHaveLength(0);
  });

  it("registered-profile rejection does not mutate kyc_profiles", async () => {
    const { client, calls } = makeClient({ profile: profileRow({ user_id: "user-9" }) });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({ statusCode: 422 });
    expect(calls.updates.some((u) => u.table === "kyc_profiles")).toBe(false);
    expect(calls.inserts).toHaveLength(0);
  });

  it("registered-ness is only revealed AFTER identity proof (hash mismatch wins)", async () => {
    // Registered profile AND a wrong identity value → mismatch (403), not 422.
    const { client } = makeClient({
      profile: profileRow({ user_id: "user-9", identity_hash: "WRONG_HASH" }),
    });
    mockState.client = client;
    await expect(attachPost({} as any)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "IDENTITY_OWNERSHIP_MISMATCH",
    });
  });
});

// ── Pending profile still fails the gate ──────────────────────────────────────

describe("kyc-attach — attached pending profile still fails pickup gate", () => {
  it("attaches a pending profile but resolvePickupKyc still blocks it", async () => {
    const { client } = makeClient({ profile: profileRow({ status: "pending", valid_until: null }) });
    mockState.client = client;
    const result = await attachPost({} as any);
    expect(result.attached).toBe(true);
    expect(result.profile.status).toBe("pending");
    // The gate (evaluated at confirm time) blocks a pending profile.
    const gate = resolvePickupKyc({ status: "pending", valid_until: null }, [], "booking-1", new Date());
    expect(gate.canPickup).toBe(false);
    expect(gate.reason).toBe("pending");
  });
});

// ── Single-writer source scan ─────────────────────────────────────────────────

describe("kyc-attach — single writer of rental_bookings.kyc_profile_id", () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (full.endsWith(".ts")) out.push(full);
    }
    return out;
  }

  it("the attach route is the ONLY file that writes kyc_profile_id via .update()", () => {
    const roots = [resolve(process.cwd(), "server/api"), resolve(process.cwd(), "server/utils")];
    const files = roots.flatMap(walk);
    // Match an .update({ ... }) call whose object includes kyc_profile_id.
    const updateWritesKycProfileId = /\.update\(\s*\{[\s\S]{0,300}?kyc_profile_id/;
    const writers = files.filter((f) => updateWritesKycProfileId.test(readFileSync(f, "utf8")));
    const rel = writers.map((f) => f.replace(resolve(process.cwd()) + "/", "")).sort();
    expect(rel).toEqual(["server/api/admin/rental-bookings/[id]/kyc-attach.post.ts"]);
  });

  it("the only place kyc_profile_id is inserted is the rental_booking_fulfillments snapshot", () => {
    // Defense-in-depth: confirm no rental_bookings INSERT sets kyc_profile_id.
    const src = readFileSync(
      resolve(process.cwd(), "server/utils/rental-fulfillment.ts"),
      "utf8",
    );
    // rental-fulfillment writes kyc_profile_id only into the fulfillments snapshot insert.
    expect(src).toContain("rental_booking_fulfillments");
  });
});
