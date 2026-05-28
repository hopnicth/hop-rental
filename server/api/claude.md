# Server API Guidelines — HOPNIC

> Rules for every file in `server/api/` and `server/utils/`. Read before creating or editing any server route.

---

## 1. File Naming Convention

```
server/api/
  [resource]/index.get.ts      # GET  /api/[resource]
  [resource]/index.post.ts     # POST /api/[resource]
  [resource]/[id].get.ts       # GET  /api/[resource]/:id
  [resource]/[id].patch.ts     # PATCH
  [resource]/[id].delete.ts    # DELETE

  admin/[resource]/...         # Admin-only endpoints
  user/[resource]/...          # Auth-required user endpoints
```

Business logic ที่ซับซ้อนควรอยู่ใน `server/utils/` ไม่ใช่ใน route file

---

## 2. Auth Guards — ใช้ให้ถูกต้อง

### Admin routes → `requirePlatformAdmin` หรือ `requireSuperAdmin`

```ts
import { requirePlatformAdmin } from "~~/server/utils/admin";

export default defineEventHandler(async (event) => {
  const { adminClient } = await requirePlatformAdmin(event);
  // adminClient = serverSupabaseServiceRole (bypasses RLS)
});
```

| Function               | ใครเข้าได้              | ใช้เมื่อ                       |
| ---------------------- | ----------------------- | ------------------------------ |
| `requirePlatformAdmin` | `staff` + `super_admin` | Read/update ทั่วไป             |
| `requireSuperAdmin`    | `super_admin` เท่านั้น  | Create/delete/verify สิ่งสำคัญ |

### User routes → `serverSupabaseUser`

```ts
import {
  serverSupabaseUser,
  serverSupabaseServiceRole,
} from "#supabase/server";

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event);
  const userId = authUser?.id ?? authUser?.sub;
  if (!userId)
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });

  const client = serverSupabaseServiceRole(event);
});
```

### Session refresh — ทำก่อน getUser ใน user profile routes

```ts
// refresh expired access token ก่อน getUser เพื่อป้องกัน false 401
try {
  await serverSupabaseSession(event);
} catch {
  /* swallow */
}
const authUser = await serverSupabaseUser(event);
```

### Public routes — ไม่ต้องการ auth

```ts
const client = serverSupabaseServiceRole(event);
// query public data — RLS ไม่ทำงานกับ service role
```

---

## 3. Supabase Client — ใช้ให้ถูก

| Client                      | ใช้เมื่อ                      |
| --------------------------- | ----------------------------- |
| `serverSupabaseServiceRole` | ทุก server route (bypass RLS) |
| `serverSupabaseUser`        | อ่าน auth identity เท่านั้น   |
| `serverSupabaseSession`     | refresh session ก่อน getUser  |

> **ห้ามใช้ `serverSupabaseClient`** ใน admin routes — จะถูก RLS บล็อก

---

## 4. Error Response Standard

```ts
// 400 — input ไม่ครบ / format ผิด
throw createError({ statusCode: 400, statusMessage: "fieldName is required" });

// 401 — ไม่ได้ login
throw createError({
  statusCode: 401,
  statusMessage: "Authentication required",
});

// 403 — login แล้วแต่ไม่มีสิทธิ์
throw createError({ statusCode: 403, statusMessage: "Admin access required" });

// 404 — ไม่เจอ record
throw createError({ statusCode: 404, statusMessage: "Resource not found" });

// 409 — duplicate (Postgres error code '23505')
throw createError({
  statusCode: error?.code === "23505" ? 409 : 500,
  statusMessage: "...",
});

// 422 — business rule violation
throw createError({
  statusCode: 422,
  statusMessage: "Booking is already confirmed",
});

// 500 — DB / unexpected error
throw createError({ statusCode: 500, statusMessage: error.message });
```

---

## 5. Query Patterns

### List + pagination

```ts
const q = getQuery(event);
const page = Math.max(0, Number(q.page ?? 0));
const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));

const { data, error } = await client
  .from("table")
  .select(SELECT)
  .order("created_at", { ascending: false });
const all = (data ?? []).map(mapRow);
const start = page * pageSize;
return {
  items: all.slice(start, start + pageSize),
  total: all.length,
  page,
  pageSize,
  hasMore: start + pageSize < all.length,
};
```

### Single record

```ts
const id = getRouterParam(event, "id");
if (!id)
  throw createError({ statusCode: 400, statusMessage: "id is required" });

const { data, error } = await client
  .from("table")
  .select(SELECT)
  .eq("id", id)
  .maybeSingle();
if (error) throw createError({ statusCode: 500, statusMessage: error.message });
if (!data) throw createError({ statusCode: 404, statusMessage: "Not found" });
```

### Insert (POST)

```ts
const body = (await readBody(event)) as Record<string, unknown>;
const { data, error } = await client
  .from("table")
  .insert(payload)
  .select(SELECT)
  .single();
if (error || !data)
  throw createError({
    statusCode: error?.code === "23505" ? 409 : 500,
    statusMessage: error?.message ?? "Insert failed",
  });
return { item: mapRow(data) };
```

### Partial update (PATCH)

```ts
const { data, error } = await client
  .from("table")
  .update(payload)
  .eq("id", id)
  .select(SELECT)
  .maybeSingle();
if (error)
  throw createError({
    statusCode: error.code === "23505" ? 409 : 500,
    statusMessage: error.message,
  });
if (!data) throw createError({ statusCode: 404, statusMessage: "Not found" });
return { item: mapRow(data) };
```

---

## 6. RLS Notes

- ทุก route ใช้ `serverSupabaseServiceRole` → **RLS ไม่ทำงาน**
- Ownership ต้อง enforce ใน application code เสมอ:

```ts
if (String(record.user_id) !== String(userId)) {
  throw createError({ statusCode: 403, statusMessage: "Access denied" });
}
```

- ห้าม trust `user_id` จาก request body — ดึงจาก session เสมอ
- Admin gate คือ `requirePlatformAdmin` / `requireSuperAdmin` — ไม่ใช่ RLS

---

## 7. JSDoc Header — บังคับสำหรับทุก route file

```ts
/**
 * GET /api/admin/partners
 *
 * Short description of what this endpoint does.
 *
 * Query params:
 *   page       — 0-based page index (default 0)
 *   pageSize   — items per page (default 20, max 100)
 *
 * Returns: { items: T[], total: number, page: number, hasMore: boolean }
 * Errors:  400 | 401 | 403 | 404 | 409 | 422 | 500
 */
```

---

## 8. Webhook Routes

- ใช้ `readRawBody` ไม่ใช่ `readBody` เพื่อ verify HMAC signature
- Verify ก่อนทำอะไรทุกครั้ง:

```ts
const rawBody = (await readRawBody(event)) || "";
const signature = getHeader(event, "omise-signature");
const timestamp = getHeader(event, "omise-signature-timestamp");
const config = useRuntimeConfig(event);
verifyOmiseWebhookSignature(
  rawBody,
  signature,
  timestamp,
  config.omiseWebhookSecret,
);
```

---

## 9. ห้ามทำ

- ❌ ห้ามใช้ `serverSupabaseClient` ใน admin routes (RLS บล็อก)
- ❌ ห้าม trust `user_id` จาก request body — ดึงจาก session เสมอ
- ❌ ห้ามเขียน business logic ยาวใน route file — ย้ายไป `server/utils/`
- ❌ ห้าม return raw Supabase row — ผ่าน mapper function ก่อน
- ❌ ห้ามลืม ownership check ก่อน update/delete ข้อมูล user
- ❌ ห้ามใช้ `readBody` ใน webhook — ใช้ `readRawBody` เพื่อ verify signature
- ❌ ห้ามลืม JSDoc header ใน route file ทุกไฟล์
