# Tests Guidelines — HOPNIC

> Rules for every file in `tests/server/`. Read before creating or editing any spec file.

---

## 1. Test Runner & Commands

```bash
npx vitest run                                      # รัน tests ทั้งหมด
npx vitest run tests/server/admin-partners-api.spec.ts  # รัน spec เดียว
npx vitest run --reporter=verbose                   # verbose output
npx tsc --noEmit                                    # type check (ไม่ใช่ test แต่ต้อง pass)
```

**Environment:** Node.js — ไม่มี browser DOM
**Path aliases:** `~` → `./app`, `~~` → `.` (project root)

---

## 2. File Naming & Location

```
tests/server/
  admin-[resource]-[scope].spec.ts   # admin API / UI contract
  [resource]-[lifecycle].spec.ts     # domain logic / utility
  user-[resource]-api.spec.ts        # user-facing API
  [feature]-ui.spec.ts               # UI contract / source inspection
  utils/[util].spec.ts               # pure utility functions
```

- ใช้ `.spec.ts` เสมอ (ไม่ใช่ `.test.ts`)
- ทุก spec file ต้องมี JSDoc header อธิบาย scope ที่ test

```ts
/**
 * Tests: [Feature Name]
 *
 * Covers:
 *  1. Permission model — POST uses requireSuperAdmin
 *  2. Validator unit tests (pure functions, no DB)
 *  3. Business rule X
 */
```

---

## 3. Test Types ที่ใช้ในโปรเจกต์

### Type A — Source Inspection (UI Contract)

ตรวจว่า source code มี pattern ที่ถูกต้อง เช่น auth guard, i18n key, component ที่ใช้

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

it("POST /api/admin/partners uses requireSuperAdmin", () => {
  const src = read("server/api/admin/partners/index.post.ts");
  expect(src).toContain("requireSuperAdmin");
  expect(src).not.toContain("requirePlatformAdmin");
});
```

### Type B — Pure Function Unit Test

Test validator, mapper, helper — ไม่ต้องการ DB หรือ mock

```ts
import { buildPartnerCreatePayload } from "../../server/utils/admin-partners";

describe("buildPartnerCreatePayload", () => {
  const base = { slug: "test", directoryType: "store", nameTh: "ทดสอบ" };

  it("accepts valid input", () => {
    expect(() => buildPartnerCreatePayload(base)).not.toThrow();
  });

  it("rejects invalid slug", () => {
    expect(() =>
      buildPartnerCreatePayload({ ...base, slug: "bad slug" }),
    ).toThrow();
  });
});
```

### Type C — Mock DB Client (Business Logic)

Test business logic ใน `server/utils/` โดยใช้ in-memory mock แทน Supabase

```ts
function mockClient(tables: Record<string, Row[]> = {}) {
  return {
    from(table: string) {
      return {
        select: () => this,
        eq: (col: string, val: unknown) => this,
        maybeSingle: async () => ({
          data: (tables[table] ?? [])[0] ?? null,
          error: null,
        }),
        // ... เพิ่ม chain methods ตามที่ test ต้องการ
      };
    },
  };
}
```

---

## 4. Import Path Convention

```ts
// server/utils → relative path จาก tests/server/
import { fn } from "../../server/utils/admin-partners";

// app/ → ใช้ alias ~
import { SERVICE_AREA_OPTIONS } from "~/data/thaiServiceAreas";

// node built-ins
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
```

---

## 5. Describe & It Naming

```ts
// describe = สิ่งที่ test (ชื่อ function, route, หรือ domain)
describe('buildPartnerCreatePayload', () => { ... })
describe('GET /api/admin/partners', () => { ... })
describe('Partner public SELECT strings — no private fields', () => { ... })

// it = พฤติกรรมที่ expect ในภาษาอ่านง่าย
it('accepts valid slug', () => { ... })
it('rejects mismatched category prefix', () => { ... })
it('POST uses requireSuperAdmin', () => { ... })
it('returns null for empty input', () => { ... })
```

---

## 6. Business Rules ที่ต้อง Test ทุกครั้งที่แตะ Feature

### Auth / Permission

```ts
it("[METHOD] /api/admin/[route] uses requireSuperAdmin", () => {
  expect(src).toContain("requireSuperAdmin");
});
it("GET /api/admin/[route] uses requirePlatformAdmin", () => {
  expect(src).toContain("requirePlatformAdmin");
});
```

### Private Field Protection

```ts
const PRIVATE_FIELDS = ["kyc_documents", "verified_notes", "internal_notes"];

it("PUBLIC_SELECT excludes private fields", () => {
  for (const f of PRIVATE_FIELDS) {
    expect(PUBLIC_SELECT_STRING).not.toContain(f);
  }
});
```

### is_public gate (partner / content)

```ts
it("public endpoint filters by is_public = true", () => {
  expect(src).toContain('.eq("is_public", true)');
});
```

### Ownership / user_id check

```ts
it("rejects booking belonging to another user", async () => {
  await expect(
    fn(client, bookingOf("other-user"), "this-user"),
  ).rejects.toThrow(/403/);
});
```

---

## 7. Vitest API ที่ใช้บ่อย

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Matchers
expect(value).toBe(x);
expect(value).toEqual(x);
expect(value).toBeNull();
expect(value).toBeTruthy();
expect(value).toContain("string");
expect(value).toHaveLength(n);
expect(() => fn()).toThrow();
expect(() => fn()).toThrow(/pattern/);
expect(() => fn()).not.toThrow();
await expect(asyncFn()).rejects.toThrow();

// Mocking
vi.mock("~~/server/utils/some-util", () => ({ fn: vi.fn() }));
vi.fn().mockResolvedValue(result);
vi.fn().mockRejectedValue(new Error("..."));
```

---

## 8. Helper Patterns ที่ควรใช้ซ้ำ

### Booking factory function

```ts
function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    user_id: "user-1",
    status: "draft",
    asset_id: "asset-1",
    start_date: "2026-06-01",
    end_date: "2026-06-06",
    rental_days: 5,
    daily_rate: 100,
    rental_total: 500,
    deposit_amount: 3000,
    ...overrides,
  };
}
```

### readFileSync helper

```ts
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
```

---

## 9. ห้ามทำ

- ❌ ห้าม test ที่ต้อง connect DB จริง — ใช้ mock เสมอ
- ❌ ห้ามเขียน test แล้วไม่ทำงานกับ `npx vitest run` — run ให้ pass ก่อน commit
- ❌ ห้ามใช้ `.only` หรือ `.skip` ใน production spec (เฉพาะ dev temp)
- ❌ ห้าม import จาก `app/` โดยไม่ใช้ alias `~` หรือ relative path
- ❌ ห้ามสร้าง spec file ใหม่โดยไม่มี JSDoc header อธิบาย scope
- ❌ ห้าม test เฉพาะ happy path — ต้อง cover invalid input, edge case, และ error path ด้วย
