/**
 * Tests: POST /api/admin/kyc/profiles/lookup
 *
 * Covers:
 *  1. Auth — requirePlatformAdmin enforced (401/403 propagate)
 *  2. Server-side hashing via hashKycIdentity (never hashIdentity on raw input)
 *  3. national_id / juristic_id / passport normalization (whitespace + dash family)
 *  4. Validation — bad type / empty value / invalid format → 400, no raw PII in error
 *  5. No match → { profile: null }; exact match → safe shape; multiple → selectBestKycProfile
 *  6. Never returns identity_hash; never logs/returns the raw identity value
 *  7. Read-only — never inserts kyc_profiles, never touches rental_bookings
 *  8. KYC_HASH_SECRET missing → 500 fail-safe, no PII leak
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  adminError: null as any,
  client: null as any,
  body: {} as any,
}));

vi.mock("h3", () => ({
  defineEventHandler: (handler: any) => handler,
  readBody: async () => mockState.body,
  createError: (opts: { statusCode?: number; statusMessage?: string }) =>
    Object.assign(new Error(opts.statusMessage), opts),
}));

vi.mock("~~/server/utils/admin", () => ({
  requirePlatformAdmin: async () => {
    if (mockState.adminError) throw mockState.adminError;
    return {
      adminClient: mockState.client,
      userId: "staff-1",
      platformRole: "staff",
    };
  },
}));

const lookupPost = (
  await import("../../server/api/admin/kyc/profiles/lookup.post")
).default;

// Real hash function to compute expected hashes (KYC_HASH_SECRET set in beforeEach).
const { hashKycIdentity } = await import("../../server/utils/kyc");

const SECRET = "test-secret-for-lookup-spec";

// ── Mock admin client ─────────────────────────────────────────────────────────

function makeClient(
  rows: Array<Record<string, unknown>>,
  opts: { error?: { message: string } } = {},
) {
  const calls = {
    fromTables: [] as string[],
    eq: [] as Array<{ col: string; val: unknown }>,
    mutated: false,
  };
  const client = {
    from(table: string) {
      calls.fromTables.push(table);
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          calls.eq.push({ col, val });
          return chain;
        },
        order: () => chain,
        insert: () => {
          calls.mutated = true;
          throw new Error("insert must not be called by a read-only lookup");
        },
        update: () => {
          calls.mutated = true;
          throw new Error("update must not be called by a read-only lookup");
        },
        delete: () => {
          calls.mutated = true;
          throw new Error("delete must not be called by a read-only lookup");
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            opts.error ? { data: null, error: opts.error } : { data: rows, error: null },
          ).then(resolve),
      };
      return chain;
    },
  };
  return { client, calls };
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: "kyc-1",
    user_id: null,
    customer_type: "individual",
    identity_type: "national_id",
    identity_last4: "0123",
    status: "verified",
    valid_until: "2027-01-01T00:00:00.000Z",
    branch_id: "branch-hq",
    created_at: "2026-01-01T00:00:00.000Z",
    verified_at: "2026-01-01T00:00:00.000Z",
    verified_branch_id: "branch-hq",
    // A sensitive column that MUST never reach the response:
    identity_hash: "SENSITIVE_HASH_MUST_NOT_LEAK",
    ...over,
  };
}

function authError(statusCode: number, statusMessage: string) {
  return Object.assign(new Error(statusMessage), { statusCode, statusMessage });
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.KYC_HASH_SECRET;
  process.env.KYC_HASH_SECRET = SECRET;
  mockState.adminError = null;
  mockState.body = {};
  const { client } = makeClient([]);
  mockState.client = client;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.KYC_HASH_SECRET;
  else process.env.KYC_HASH_SECRET = savedSecret;
  vi.restoreAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — auth", () => {
  it("propagates 401 when not authenticated", async () => {
    mockState.adminError = authError(401, "Authentication required");
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };
    await expect(lookupPost({} as any)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("propagates 403 when not an admin", async () => {
    mockState.adminError = authError(403, "Admin access required");
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };
    await expect(lookupPost({} as any)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("the route source uses requirePlatformAdmin (not a public guard)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "server/api/admin/kyc/profiles/lookup.post.ts"),
      "utf8",
    );
    expect(src).toContain("requirePlatformAdmin");
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — validation", () => {
  it("rejects a missing/invalid identityType with 400", async () => {
    mockState.body = { identityType: "drivers_license", identityValue: "1234567890123" };
    await expect(lookupPost({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "INVALID_IDENTITY_TYPE",
    });
  });

  it("rejects an empty identityValue with 400", async () => {
    mockState.body = { identityType: "national_id", identityValue: "   " };
    await expect(lookupPost({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "IDENTITY_VALUE_REQUIRED",
    });
  });

  it("invalid identity format returns 400 with NO raw identity in the error", async () => {
    const raw = "not-13-digits-XYZ";
    mockState.body = { identityType: "national_id", identityValue: raw };
    try {
      await lookupPost({} as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.statusMessage).toBe("INVALID_IDENTITY_FORMAT");
      // The error must not leak the raw identity value.
      expect(err.statusMessage).not.toContain(raw);
      expect(String(err.message)).not.toContain(raw);
    }
  });
});

// ── Hashing ───────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — server-side hashing", () => {
  it("queries kyc_profiles by the hashKycIdentity hash, not the raw value", async () => {
    const { client, calls } = makeClient([]);
    mockState.client = client;
    const raw = "1234567890123";
    mockState.body = { identityType: "national_id", identityValue: raw };

    await lookupPost({} as any);

    const expectedHash = hashKycIdentity("national_id", raw);
    const idHashEq = calls.eq.find((c) => c.col === "identity_hash");
    expect(idHashEq).toBeDefined();
    expect(idHashEq?.val).toBe(expectedHash);
    // The raw value must never be used as a query parameter.
    expect(calls.eq.some((c) => c.val === raw)).toBe(false);
    // Only kyc_profiles is read; rental_bookings is never touched.
    expect(calls.fromTables).toEqual(["kyc_profiles"]);
  });

  it("national_id normalization: dashes/whitespace hash to the same value", async () => {
    const { client, calls } = makeClient([]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1-234 567-890123" };

    await lookupPost({} as any);

    const expectedHash = hashKycIdentity("national_id", "1234567890123");
    expect(calls.eq.find((c) => c.col === "identity_hash")?.val).toBe(expectedHash);
  });

  it("juristic_id normalization: dashes/whitespace hash to the same value", async () => {
    const { client, calls } = makeClient([]);
    mockState.client = client;
    mockState.body = { identityType: "juristic_id", identityValue: " 0105-536 016671 " };

    await lookupPost({} as any);

    const expectedHash = hashKycIdentity("juristic_id", "0105536016671");
    expect(calls.eq.find((c) => c.col === "identity_hash")?.val).toBe(expectedHash);
  });

  it("passport normalization: lowercase/whitespace/dashes hash to the same value", async () => {
    const { client, calls } = makeClient([]);
    mockState.client = client;
    mockState.body = { identityType: "passport", identityValue: " ab-12 34567 " };

    await lookupPost({} as any);

    const expectedHash = hashKycIdentity("passport", "AB1234567");
    expect(calls.eq.find((c) => c.col === "identity_hash")?.val).toBe(expectedHash);
  });
});

// ── Results ───────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — results", () => {
  it("returns { profile: null } when no profile matches", async () => {
    const { client } = makeClient([]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };

    const result = await lookupPost({} as any);
    expect(result.profile).toBeNull();
  });

  it("returns a safe profile shape on exact match", async () => {
    const { client } = makeClient([dbRow()]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };

    const result = await lookupPost({} as any);
    expect(result.profile).toEqual({
      id: "kyc-1",
      customerType: "individual",
      identityType: "national_id",
      identityLast4: "0123",
      status: "verified",
      validUntil: "2027-01-01T00:00:00.000Z",
      branchId: "branch-hq",
      createdAt: "2026-01-01T00:00:00.000Z",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      verifiedBranchId: "branch-hq",
      hasUserId: false,
    });
  });

  it("hasUserId is true when the profile is owned by a registered user", async () => {
    const { client } = makeClient([dbRow({ user_id: "user-9" })]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };

    const result = await lookupPost({} as any);
    expect(result.profile?.hasUserId).toBe(true);
    // The actual user_id must not be exposed.
    expect(JSON.stringify(result)).not.toContain("user-9");
  });

  it("with multiple matches, returns the selectBestKycProfile winner (verified, latest valid_until)", async () => {
    const rows = [
      dbRow({ id: "pending-newer", status: "pending", valid_until: null, created_at: "2026-06-01T00:00:00.000Z" }),
      dbRow({ id: "verified-sooner", status: "verified", valid_until: "2026-12-01T00:00:00.000Z", created_at: "2026-05-01T00:00:00.000Z" }),
      dbRow({ id: "verified-later", status: "verified", valid_until: "2027-12-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }),
    ];
    const { client } = makeClient(rows);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };

    const result = await lookupPost({} as any);
    expect(result.profile?.id).toBe("verified-later");
  });
});

// ── Sensitive-data safety ─────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — sensitive data", () => {
  it("never returns identity_hash even when the DB row contains it", async () => {
    const { client } = makeClient([dbRow()]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };

    const result = await lookupPost({} as any);
    expect(result.profile).not.toHaveProperty("identity_hash");
    expect(JSON.stringify(result)).not.toContain("SENSITIVE_HASH_MUST_NOT_LEAK");
  });

  it("uses the shared PII whitelist boundary (KYC_PROFILE_SAFE_SELECT + toSafeKycProfile)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "server/api/admin/kyc/profiles/lookup.post.ts"),
      "utf8",
    );
    // The route must source the select + mapper from the shared util — not a local copy.
    expect(src).toContain('from "~~/server/utils/kyc-profile-view"');
    expect(src).toContain("KYC_PROFILE_SAFE_SELECT");
    expect(src).toContain("toSafeKycProfile");
    // The route must NOT re-declare its own safe select string.
    expect(src).not.toMatch(/const\s+KYC_LOOKUP_SELECT\s*=/);
    // (The SELECT-content exclusions are verified directly in kyc-profile-view.spec.ts.)
  });

  it("does not log the raw identity value", async () => {
    const raw = "1234567890123";
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
    ];
    const { client } = makeClient([dbRow()]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: raw };

    await lookupPost({} as any);

    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(raw);
      }
    }
  });
});

// ── Read-only guarantees ──────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — read-only", () => {
  it("never inserts/updates/deletes kyc_profiles and never touches rental_bookings", async () => {
    const { client, calls } = makeClient([dbRow()]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: "1234567890123" };

    await lookupPost({} as any);

    expect(calls.mutated).toBe(false);
    expect(calls.fromTables).not.toContain("rental_bookings");
    expect(calls.fromTables).toEqual(["kyc_profiles"]);
  });
});

// ── Fail-safe on missing secret ───────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles/lookup — KYC_HASH_SECRET missing", () => {
  it("returns 500 fail-safe with no raw identity in the error", async () => {
    delete process.env.KYC_HASH_SECRET;
    const raw = "1234567890123";
    const { client, calls } = makeClient([]);
    mockState.client = client;
    mockState.body = { identityType: "national_id", identityValue: raw };

    try {
      await lookupPost({} as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(500);
      expect(err.statusMessage).toBe("KYC_HASH_UNAVAILABLE");
      expect(String(err.message)).not.toContain(raw);
      // Must fail before any DB query runs.
      expect(calls.fromTables).toHaveLength(0);
    }
  });
});
