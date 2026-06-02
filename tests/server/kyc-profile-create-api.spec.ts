/**
 * Tests: POST /api/admin/kyc/profiles (create PENDING profile only)
 *
 * Covers:
 *  1. Auth — requirePlatformAdmin enforced
 *  2. Valid national_id / passport / juristic_id create a pending profile
 *  3. Server-side hashing via hashKycIdentity (never hashIdentity on raw)
 *  4. identity_last4 derived from normalized value
 *  5. Invalid identity → 400 with no raw PII; KYC_HASH_SECRET missing → 500, creates nothing
 *  6. Inserted status is ALWAYS 'pending'; verified/rejection/revocation fields never set
 *  7. Never mutates rental_bookings; never attaches a profile to a booking
 *  8. walk_in_phone stored as metadata only; not used as identity match
 *  9. Lookup-before-insert reuses an existing walk-in profile (user_id NULL)
 * 10. Registered profile (user_id NOT NULL) is NEVER reused for walk-in create
 * 11. Duplicate walk-in profiles resolved via selectBestKycProfile semantics
 * 12. Response includes id; never returns identity_hash or raw identity; no raw logging
 * 13. A freshly-created pending profile does NOT pass the pickup gate (resolvePickupKyc)
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
    return { adminClient: mockState.client, userId: "staff-1", platformRole: "staff" };
  },
}));

const createPost = (
  await import("../../server/api/admin/kyc/profiles/index.post")
).default;
const { hashKycIdentity, resolvePickupKyc } = await import("../../server/utils/kyc");

const SECRET = "test-secret-for-create-spec";

// ── Mock admin client (dedupe SELECT + insert) ────────────────────────────────

function makeClient(opts: {
  existing?: Array<Record<string, unknown>>;
  insertError?: { code?: string; message: string } | null;
  lookupError?: { message: string } | null;
} = {}) {
  const existing = opts.existing ?? [];
  const calls = {
    fromTables: [] as string[],
    eq: [] as Array<{ col: string; val: unknown }>,
    inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    mutatedOther: false,
  };
  const client = {
    from(table: string) {
      calls.fromTables.push(table);
      let pendingInsert: Record<string, unknown> | null = null;
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          calls.eq.push({ col, val });
          return chain;
        },
        order: () => chain,
        is: () => chain,
        insert: (payload: Record<string, unknown>) => {
          pendingInsert = payload;
          calls.inserts.push({ table, payload });
          return chain;
        },
        update: () => {
          calls.mutatedOther = true;
          throw new Error("update must not be called by create");
        },
        delete: () => {
          calls.mutatedOther = true;
          throw new Error("delete must not be called by create");
        },
        single: async () => {
          if (pendingInsert) {
            if (opts.insertError) return { data: null, error: opts.insertError };
            // Simulate DB-generated id/created_at + NULL audit defaults.
            return {
              data: {
                id: "new-id",
                created_at: "2026-06-03T00:00:00.000Z",
                user_id: null,
                valid_until: null,
                verified_at: null,
                verified_branch_id: null,
                ...pendingInsert,
              },
              error: null,
            };
          }
          return { data: existing[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            opts.lookupError
              ? { data: null, error: opts.lookupError }
              : { data: existing, error: null },
          ).then(resolve),
      };
      return chain;
    },
  };
  return { client, calls };
}

function existingRow(over: Record<string, unknown> = {}) {
  return {
    id: "existing-1",
    user_id: null,
    customer_type: "individual",
    identity_type: "national_id",
    identity_last4: "***0123",
    status: "pending",
    valid_until: null,
    branch_id: "branch-hq",
    created_at: "2026-01-01T00:00:00.000Z",
    verified_at: null,
    verified_branch_id: null,
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
  mockState.client = makeClient().client;
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.KYC_HASH_SECRET;
  else process.env.KYC_HASH_SECRET = savedSecret;
  vi.restoreAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles — auth", () => {
  it("propagates 401 when not authenticated", async () => {
    mockState.adminError = authError(401, "Authentication required");
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };
    await expect(createPost({} as any)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("propagates 403 when not an admin", async () => {
    mockState.adminError = authError(403, "Admin access required");
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };
    await expect(createPost({} as any)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("route source uses requirePlatformAdmin", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "server/api/admin/kyc/profiles/index.post.ts"), "utf8");
    expect(src).toContain("requirePlatformAdmin");
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles — validation", () => {
  it("rejects invalid customerType with 400", async () => {
    mockState.body = { customerType: "robot", identityType: "national_id", identityValue: "1234567890123" };
    await expect(createPost({} as any)).rejects.toMatchObject({ statusCode: 400, statusMessage: "INVALID_CUSTOMER_TYPE" });
  });

  it("rejects invalid identityType with 400", async () => {
    mockState.body = { customerType: "individual", identityType: "drivers_license", identityValue: "x" };
    await expect(createPost({} as any)).rejects.toMatchObject({ statusCode: 400, statusMessage: "INVALID_IDENTITY_TYPE" });
  });

  it("rejects empty identityValue with 400", async () => {
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "  " };
    await expect(createPost({} as any)).rejects.toMatchObject({ statusCode: 400, statusMessage: "IDENTITY_VALUE_REQUIRED" });
  });

  it("invalid identity format returns 400 with NO raw identity in the error and creates nothing", async () => {
    const raw = "bad-format-XYZ";
    const { client, calls } = makeClient();
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: raw };
    try {
      await createPost({} as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.statusMessage).toBe("INVALID_IDENTITY_FORMAT");
      expect(String(err.message)).not.toContain(raw);
      expect(calls.inserts).toHaveLength(0);
      expect(calls.fromTables).toHaveLength(0);
    }
  });
});

// ── customerType × identityType coherence ─────────────────────────────────────

describe("POST /api/admin/kyc/profiles — coherence guard", () => {
  const incoherent: Array<[string, string]> = [
    ["individual", "juristic_id"],
    ["company", "passport"],
    ["company", "national_id"],
  ];

  for (const [customerType, identityType] of incoherent) {
    it(`rejects ${customerType} + ${identityType} with 400 INCOHERENT_IDENTITY_FOR_CUSTOMER_TYPE`, async () => {
      const { client, calls } = makeClient();
      mockState.client = client;
      mockState.body = { customerType, identityType, identityValue: "1234567890123" };
      try {
        await createPost({} as any);
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.statusMessage).toBe("INCOHERENT_IDENTITY_FOR_CUSTOMER_TYPE");
        // No DB access, no insert — guard runs before hashing/lookup.
        expect(calls.inserts).toHaveLength(0);
        expect(calls.fromTables).toHaveLength(0);
      }
    });
  }

  it("coherence error never contains the raw identityValue", async () => {
    const raw = "1234567890123";
    const { client } = makeClient();
    mockState.client = client;
    mockState.body = { customerType: "company", identityType: "passport", identityValue: raw };
    try {
      await createPost({} as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.statusMessage).toBe("INCOHERENT_IDENTITY_FOR_CUSTOMER_TYPE");
      expect(String(err.message)).not.toContain(raw);
      expect(String(err.statusMessage)).not.toContain(raw);
    }
  });

  it("accepts the coherent pairs (individual+national_id, individual+passport, company+juristic_id)", async () => {
    for (const [customerType, identityType, value] of [
      ["individual", "national_id", "1234567890123"],
      ["individual", "passport", "AB1234567"],
      ["company", "juristic_id", "0105536016671"],
    ] as Array<[string, string, string]>) {
      const { client } = makeClient({ existing: [] });
      mockState.client = client;
      mockState.body = { customerType, identityType, identityValue: value };
      const result = await createPost({} as any);
      expect(result.created).toBe(true);
      expect(result.profile.status).toBe("pending");
    }
  });
});

// ── Create (happy paths) ──────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles — create pending", () => {
  it("valid national_id creates a pending profile (status pending, hashed server-side)", async () => {
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    const raw = "1234567890123";
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: raw };

    const result = await createPost({} as any);

    expect(result.created).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.profile.id).toBe("new-id");
    expect(result.profile.status).toBe("pending");
    // Inserted payload
    const payload = calls.inserts[0]!.payload;
    expect(calls.inserts[0]!.table).toBe("kyc_profiles");
    expect(payload.status).toBe("pending");
    expect(payload.identity_hash).toBe(hashKycIdentity("national_id", raw));
    expect(payload.identity_last4).toBe("***0123");
    expect(payload.customer_type).toBe("individual");
    expect(payload.identity_type).toBe("national_id");
    // user_id NOT written → walk-in (NULL)
    expect("user_id" in payload).toBe(false);
  });

  it("valid passport creates a pending profile with normalized (uppercased) hash", async () => {
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "passport", identityValue: " ab-12 34567 " };

    const result = await createPost({} as any);

    expect(result.created).toBe(true);
    expect(result.profile.status).toBe("pending");
    expect(calls.inserts[0]!.payload.identity_hash).toBe(hashKycIdentity("passport", "AB1234567"));
    expect(calls.inserts[0]!.payload.identity_last4).toBe("***4567");
  });

  it("valid juristic_id creates a pending profile (company)", async () => {
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "company", identityType: "juristic_id", identityValue: "0105-536 016671" };

    const result = await createPost({} as any);

    expect(result.created).toBe(true);
    expect(result.profile.status).toBe("pending");
    expect(result.profile.customerType).toBe("company");
    expect(calls.inserts[0]!.payload.identity_hash).toBe(hashKycIdentity("juristic_id", "0105536016671"));
  });

  it("stores walk_in_phone as contact metadata only (never as identity match)", async () => {
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = {
      customerType: "individual",
      identityType: "national_id",
      identityValue: "1234567890123",
      walkInPhone: "0812345678",
    };

    await createPost({} as any);

    const payload = calls.inserts[0]!.payload;
    expect(payload.walk_in_phone).toBe("0812345678");
    // Phone is never used as a query/match key.
    expect(calls.eq.some((c) => c.val === "0812345678")).toBe(false);
    expect(calls.eq.some((c) => c.col === "walk_in_phone")).toBe(false);
    // Identity root is identity_hash.
    expect(calls.eq.some((c) => c.col === "identity_hash")).toBe(true);
  });

  it("NEVER sets verified/rejection/revocation fields in the insert payload", async () => {
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };

    await createPost({} as any);

    const payload = calls.inserts[0]!.payload;
    for (const forbidden of [
      "verified_at",
      "valid_until",
      "verified_by_user_id",
      "verified_branch_id",
      "verification_method",
      "rejected_at",
      "rejection_reason_code",
      "rejection_note",
      "revoked_at",
      "revoked_by_user_id",
      "revoked_reason_code",
      "revoked_note",
    ]) {
      expect(forbidden in payload).toBe(false);
    }
    expect(payload.status).toBe("pending");
  });
});

// ── Dedupe ────────────────────────────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles — dedupe", () => {
  it("reuses an existing walk-in profile (user_id NULL) with the same identity_hash", async () => {
    const { client, calls } = makeClient({ existing: [existingRow({ id: "walk-1", user_id: null })] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };

    const result = await createPost({} as any);

    expect(result.reused).toBe(true);
    expect(result.created).toBe(false);
    expect(result.profile.id).toBe("walk-1");
    // No insert happened.
    expect(calls.inserts).toHaveLength(0);
  });

  it("does NOT reuse a registered profile (user_id NOT NULL) — creates a new walk-in pending instead", async () => {
    const { client, calls } = makeClient({
      existing: [existingRow({ id: "registered-1", user_id: "user-9", status: "verified" })],
    });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };

    const result = await createPost({} as any);

    // The registered profile must not be returned/reused.
    expect(result.reused).toBe(false);
    expect(result.created).toBe(true);
    expect(result.profile.id).toBe("new-id");
    expect(result.profile.id).not.toBe("registered-1");
    expect(result.profile.status).toBe("pending");
    expect(result.profile.hasUserId).toBe(false);
    // A new walk-in profile was inserted.
    expect(calls.inserts).toHaveLength(1);
    expect("user_id" in calls.inserts[0]!.payload).toBe(false);
    // The registered user's id never leaks.
    expect(JSON.stringify(result)).not.toContain("user-9");
  });

  it("with a registered AND a walk-in profile, reuses ONLY the walk-in one", async () => {
    const { client, calls } = makeClient({
      existing: [
        existingRow({ id: "registered-1", user_id: "user-9", status: "verified", created_at: "2026-05-01T00:00:00.000Z" }),
        existingRow({ id: "walk-1", user_id: null, status: "pending", created_at: "2026-02-01T00:00:00.000Z" }),
      ],
    });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };

    const result = await createPost({} as any);

    expect(result.reused).toBe(true);
    expect(result.profile.id).toBe("walk-1");
    expect(calls.inserts).toHaveLength(0);
  });

  it("among multiple walk-in duplicates, reuses the selectBestKycProfile winner (verified, latest valid_until)", async () => {
    const { client } = makeClient({
      existing: [
        existingRow({ id: "wi-pending-newer", user_id: null, status: "pending", valid_until: null, created_at: "2026-06-01T00:00:00.000Z" }),
        existingRow({ id: "wi-verified-sooner", user_id: null, status: "verified", valid_until: "2026-12-01T00:00:00.000Z", created_at: "2026-05-01T00:00:00.000Z" }),
        existingRow({ id: "wi-verified-later", user_id: null, status: "verified", valid_until: "2027-12-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };

    const result = await createPost({} as any);

    expect(result.reused).toBe(true);
    expect(result.profile.id).toBe("wi-verified-later");
  });
});

// ── Read-only guarantees & sensitive data ─────────────────────────────────────

describe("POST /api/admin/kyc/profiles — safety", () => {
  it("never touches rental_bookings and never attaches a profile to a booking", async () => {
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: "1234567890123" };

    await createPost({} as any);

    expect(calls.fromTables).not.toContain("rental_bookings");
    expect(calls.fromTables.every((t) => t === "kyc_profiles")).toBe(true);
    // No insert/update wrote a kyc_profile_id (attach) field.
    for (const ins of calls.inserts) {
      expect("kyc_profile_id" in ins.payload).toBe(false);
    }
  });

  it("response includes id and never returns identity_hash or raw identity", async () => {
    const raw = "1234567890123";
    const { client } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: raw };

    const result = await createPost({} as any);

    expect(result.profile).toHaveProperty("id");
    expect(result.profile).not.toHaveProperty("identity_hash");
    const json = JSON.stringify(result);
    expect(json).not.toContain("SENSITIVE_HASH_MUST_NOT_LEAK");
    expect(json).not.toContain(raw);
  });

  it("fresh insert response goes through the safe mapper — strips the real identity_hash from the inserted row", async () => {
    // The mock's insert path returns the persisted row INCLUDING identity_hash
    // (the real HMAC). The response must be built via toSafeKycProfile, which omits it.
    const raw = "1234567890123";
    const { client } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: raw };

    const result = await createPost({} as any);
    const realHash = hashKycIdentity("national_id", raw);

    expect(result.created).toBe(true);
    expect(result.profile).not.toHaveProperty("identity_hash");
    // The real persisted hash must not appear anywhere in the response.
    expect(JSON.stringify(result)).not.toContain(realHash);
    // Response keys are exactly the SafeKycProfile whitelist (mapper output).
    expect(Object.keys(result.profile).sort()).toEqual(
      [
        "branchId",
        "createdAt",
        "customerType",
        "hasUserId",
        "id",
        "identityLast4",
        "identityType",
        "status",
        "validUntil",
        "verifiedAt",
        "verifiedBranchId",
      ].sort(),
    );
  });

  it("safe response shape on create (whitelist fields only)", async () => {
    const { client } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = {
      customerType: "individual",
      identityType: "national_id",
      identityValue: "1234567890123",
      branchId: "branch-hq",
    };

    const result = await createPost({} as any);

    expect(result.profile).toEqual({
      id: "new-id",
      customerType: "individual",
      identityType: "national_id",
      identityLast4: "***0123",
      status: "pending",
      validUntil: null,
      branchId: "branch-hq",
      createdAt: "2026-06-03T00:00:00.000Z",
      verifiedAt: null,
      verifiedBranchId: null,
      hasUserId: false,
    });
  });

  it("does not log the raw identity value", async () => {
    const raw = "1234567890123";
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
    ];
    const { client } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: raw };

    await createPost({} as any);

    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(raw);
      }
    }
  });

  it("the safe SELECT does not request identity_hash or storage paths", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "server/api/admin/kyc/profiles/index.post.ts"), "utf8");
    const m = src.match(/KYC_PROFILE_SAFE_SELECT\s*=\s*\n?\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    const select = m![1];
    expect(select).not.toContain("identity_hash");
    expect(select).not.toContain("storage_path");
    expect(select).not.toContain("rejection_note");
    expect(select).not.toContain("revoked_note");
  });
});

// ── Fail-safe on missing secret ───────────────────────────────────────────────

describe("POST /api/admin/kyc/profiles — KYC_HASH_SECRET missing", () => {
  it("returns 500 fail-safe, creates nothing, and leaks no raw identity", async () => {
    delete process.env.KYC_HASH_SECRET;
    const raw = "1234567890123";
    const { client, calls } = makeClient({ existing: [] });
    mockState.client = client;
    mockState.body = { customerType: "individual", identityType: "national_id", identityValue: raw };

    try {
      await createPost({} as any);
      expect.fail("should have thrown");
    } catch (err: any) {
      expect(err.statusCode).toBe(500);
      expect(err.statusMessage).toBe("KYC_HASH_UNAVAILABLE");
      expect(String(err.message)).not.toContain(raw);
      expect(calls.inserts).toHaveLength(0);
      expect(calls.fromTables).toHaveLength(0);
    }
  });
});

// ── Integration: pending profile does not pass the pickup gate ────────────────

describe("created pending profile vs pickup gate", () => {
  it("a freshly-created pending profile does NOT pass resolvePickupKyc", () => {
    // The create endpoint always writes status 'pending' with no valid_until.
    const created = { status: "pending" as const, valid_until: null };
    const resolution = resolvePickupKyc(created, [], "booking-1", new Date());
    expect(resolution.canPickup).toBe(false);
    expect(resolution.via).toBe("blocked");
    expect(resolution.reason).toBe("pending");
  });
});
