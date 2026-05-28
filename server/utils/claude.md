# Server Utils Guidelines — HOPNIC

> Rules for every file in `server/utils/`. Read before creating or editing any utility.
> Utils คือ business logic หลักของ API layer — route file ควรบางที่สุด, logic อยู่ที่นี่

---

## 1. โครงสร้างและหน้าที่ของ utils

| ประเภท               | ตัวอย่างไฟล์                                          | หน้าที่                                             |
| -------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| **SELECT strings**   | `admin-partners.ts`, `admin-catalog.ts`               | SQL column lists สำหรับ query — export เป็น `const` |
| **Validators**       | `admin-partners.ts`, `payment-core.ts`                | Parse + validate input, throw 422 ถ้า invalid       |
| **Mappers**          | `admin-partners.ts`, `admin-orders.ts`                | แปลง DB row → typed response object                 |
| **Business logic**   | `rental-booking-confirmation.ts`, `mixed-checkout.ts` | Core domain operations ที่ route เรียกใช้           |
| **Auth helpers**     | `admin.ts`                                            | `requirePlatformAdmin`, `requireSuperAdmin`         |
| **Domain constants** | `partner-verification.ts`                             | Bucket names, limits, allowed types                 |

---

## 2. File Naming Convention

```
server/utils/
  admin-[resource].ts           # admin validators + mappers + SELECT strings
  [resource]-[operation].ts     # domain logic สำหรับ operation นั้นๆ
  [resource]-[noun].ts          # helpers + types สำหรับ domain นั้น
  admin.ts                      # shared admin auth guards
  admin-catalog.ts              # shared input validators ทั่วไป (reused by many)
```

---

## 3. SELECT String Pattern

เก็บ Supabase column list เป็น exported `const` — ห้าม hardcode ใน route file

```ts
// ── SELECT strings ─────────────────────────────────────
/** Admin list — lightweight, no private fields */
export const ADMIN_SOMETHING_LIST_SELECT =
  "id, slug, name_th, is_public, created_at, updated_at";

/** Admin detail — full row including private columns */
export const ADMIN_SOMETHING_DETAIL_SELECT =
  "id, slug, name_th, private_notes, kyc_documents, ...";

/** Public list — no private fields */
export const PUBLIC_SOMETHING_LIST_SELECT =
  "id, slug, name_th, is_verified, created_at";
```

**กฎ:**

- Public SELECT ต้องไม่มี `kyc_documents`, `verified_notes`, `internal_notes`, `search_keywords`
- ต้องมี JSDoc comment อธิบายว่า lightweight/full/public

---

## 4. Validator Pattern — `as*` Functions

```ts
// Throw 422 helper — reuse แทน createError ซ้ำๆ
function fail422(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message });
}

// Required field — throw 422 ถ้าว่าง/ไม่ใช่ string
export function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    fail422(`${field} is required`);
  return value.trim();
}

// Optional field — return null ถ้าว่าง
export function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

// Boolean with fallback
export function asOptionalBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// Number with fallback
export function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// String array — deduplicate + strip empty
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.map((i) => (typeof i === "string" ? i.trim() : "")).filter(Boolean),
    ),
  );
}
```

**กฎ:**

- Validators ต้อง **pure function** — ไม่มี DB call, ไม่มี side effect
- ชื่อขึ้นต้นด้วย `as` เสมอ
- Return type ชัดเจน — ห้าม `any`
- Reuse จาก `admin-catalog.ts` ก่อนสร้างใหม่

---

## 5. Mapper Pattern — `map*` Functions

```ts
// Row = Record<string, unknown> จาก Supabase
export function mapSomethingListItem(
  row: Record<string, unknown>,
): SomethingListItem {
  return {
    id: String(row.id ?? ""),
    nameTh: String(row.name_th ?? ""),
    nameEn: typeof row.name_en === "string" ? row.name_en : null,
    isVerified: row.is_verified === true,
    createdAt: String(row.created_at ?? ""),
  };
}
```

**กฎ:**

- Input type ต้อง `Record<string, unknown>` — ไม่ trust raw Supabase row
- ห้าม return field ที่ไม่อยู่ใน SELECT string ที่ใช้คู่กัน
- Private fields ต้องไม่ปรากฏใน public mapper output

---

## 6. Business Logic Pattern

```ts
// ─── Type definitions ที่ใช้เฉพาะใน util นี้ ──────────
type AnyClient = {
  from(table: string): {
    select(cols: string): any;
    update(p: Record<string, unknown>): any;
  };
};

// ─── Exported function หลัก ──────────────────────────
export async function doSomething(
  client: AnyClient,
  params: SomethingParams,
): Promise<SomethingResult> {
  // 1. validate inputs (ก่อน DB call)
  if (!params.id)
    throw createError({ statusCode: 400, statusMessage: "id is required" });

  // 2. DB read
  const { data, error } = await client
    .from("table")
    .select(SELECT)
    .eq("id", params.id)
    .maybeSingle();
  if (error)
    throw createError({ statusCode: 500, statusMessage: error.message });
  if (!data) throw createError({ statusCode: 404, statusMessage: "Not found" });

  // 3. business rule checks
  if (data.status !== "draft")
    throw createError({ statusCode: 422, statusMessage: "Only draft allowed" });

  // 4. DB write
  const { error: updateError } = await client
    .from("table")
    .update({ status: "confirmed" })
    .eq("id", params.id);
  if (updateError)
    throw createError({ statusCode: 500, statusMessage: updateError.message });

  return { success: true };
}
```

---

## 7. Client Type Pattern — ไม่ import Supabase โดยตรงใน utils

Utils ไม่ควร import `serverSupabaseServiceRole` โดยตรง — รับ client เป็น parameter แทน เพื่อให้ testable

```ts
// ✅ ถูก — รับ client เป็น param (testable)
export async function validateBooking(client: AnyClient, bookingId: string) { ... }

// ❌ ผิด — import Supabase ตรงในใน util (ทำให้ test ยาก)
import { serverSupabaseServiceRole } from '#supabase/server'
export async function validateBooking(event: H3Event) { ... }
```

**ยกเว้น:** `admin.ts` — auth guard ต้องรับ `H3Event` เพราะต้องอ่าน session

---

## 8. Utils ที่มีอยู่แล้ว — อย่าสร้างซ้ำ

### Shared validators (ใน `admin-catalog.ts`)

| Function                             | ใช้สำหรับ                     |
| ------------------------------------ | ----------------------------- |
| `asNonEmptyString(value, field)`     | required string + trim        |
| `asOptionalString(value)`            | optional string, null ถ้าว่าง |
| `asOptionalBoolean(value, fallback)` | boolean with fallback         |
| `asNumber(value, fallback)`          | number with fallback          |
| `asStringArray(value)`               | string[] deduplicated         |

### Auth guards (ใน `admin.ts`)

| Function                      | ใครเข้าได้              |
| ----------------------------- | ----------------------- |
| `requirePlatformAdmin(event)` | `staff` + `super_admin` |
| `requireSuperAdmin(event)`    | `super_admin` only      |

---

## 9. JSDoc Header — บังคับสำหรับไฟล์ที่ไม่ชัดเจน

```ts
/**
 * Shared utilities for [domain].
 *
 * Covers:
 *  - SELECT strings
 *  - Input validators
 *  - Mappers (DB row → typed response)
 *  - [business operation]
 */
```

---

## 10. ห้ามทำ

- ❌ ห้าม return `any` จาก mapper — ใช้ typed interface เสมอ
- ❌ ห้าม hardcode SELECT column list ใน route file — ย้ายมาที่ utils
- ❌ ห้ามสร้าง validator ใหม่ที่ทำงานซ้ำกับ `admin-catalog.ts` — reuse ก่อน
- ❌ ห้ามมี DB call ใน validator function — validators ต้อง pure
- ❌ ห้าม import `serverSupabaseServiceRole` ใน utils ทั่วไป — รับ client เป็น param
- ❌ ห้าม return raw DB row — ผ่าน mapper ก่อนเสมอ
- ❌ ห้าม expose private columns ใน public mapper/SELECT string
