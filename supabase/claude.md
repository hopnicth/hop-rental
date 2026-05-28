# Supabase / Database Guidelines — HOPNIC

> Rules for every migration in `supabase/migrations/` and any schema change.
> Read before writing or editing any SQL file.

---

## 1. Migration File Rules

- **ห้ามแก้ migration เก่า** — ทุกการเปลี่ยนแปลงต้องเป็น migration ใหม่เสมอ
- ตั้งชื่อ: `NNN_short_description.sql` โดย NNN คือเลขต่อจาก migration ล่าสุด (ปัจจุบัน 104)
- Migration ต้องเป็น **idempotent** เท่าที่ทำได้ — ใช้ `IF NOT EXISTS`, `IF EXISTS`, `DO $$ BEGIN ... END $$`
- ทุกไฟล์ต้องมี comment header อธิบาย scope และ design decisions

### Migration header pattern

```sql
-- ============================================================
-- NNN_short_description.sql
--
-- Scope:
--   * สิ่งที่ migration นี้ทำ
--
-- Key design decisions:
--   * เหตุผลที่เลือก pattern นี้
-- ============================================================
```

---

## 2. Schema Source of Truth

- `supabase/migrations/` คือ **source of truth** ของ schema ทั้งหมด
- `app/types/database.types.ts` ถูก generate อัตโนมัติ — **ห้าม edit มือ**
- เมื่อเพิ่มหรือเปลี่ยน column ใน migration ให้แจ้งว่าต้อง regenerate types ด้วย

---

## 3. Key Tables Reference

| Table                | หน้าที่                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `public.users`       | Profile ลิงก์ 1:1 กับ `auth.users` — `platform_role` ควบคุม admin access |
| `catalog_products`   | สินค้าขายขาด                                                             |
| `rental_assets`      | สินทรัพย์ให้เช่า (asset-first)                                           |
| `rental_bookings`    | การจอง — `draft → confirmed → picked_up → returned`                      |
| `orders`             | คำสั่งซื้อ sale                                                          |
| `cart_items`         | ตะกร้า (sale + rental draft)                                             |
| `partner_profiles`   | Partner directory                                                        |
| `content_pages`      | CMS — blog / service / promotion / review                                |
| `chat_conversations` | Support chat                                                             |
| `payment_attempts`   | บันทึกความพยายาม payment (Omise)                                         |
| `store_branches`     | สาขา + inventory                                                         |

### ENUMs สำคัญ

```sql
platform_role:       'customer' | 'staff' | 'super_admin'
kyc_status:          'pending' | 'verified' | 'rejected'
rental_booking_status: 'draft' | 'confirmed' | 'picked_up' | 'returned' | 'cancelled' | 'no_show'
```

---

## 4. RLS Pattern

RLS เปิดบนทุก table ที่มีข้อมูล user-sensitive ทุกตัว

### 3 ระดับ access ที่ใช้ในโปรเจกต์

**ระดับ 1 — Public read (anon + authenticated)**

```sql
ALTER TABLE public.something ENABLE ROW LEVEL SECURITY;

CREATE POLICY "something_select_public"
  ON public.something FOR SELECT
  USING (is_public = TRUE);
```

**ระดับ 2 — Service role only (admin operations)**

```sql
ALTER TABLE public.sensitive_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sensitive_table_service_role_all"
  ON public.sensitive_table FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON public.sensitive_table FROM anon, authenticated;
GRANT ALL ON public.sensitive_table TO service_role;
```

**ระดับ 3 — Owner only (user data)**

```sql
CREATE POLICY "table_select_own"
  ON public.table FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "table_insert_own"
  ON public.table FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

### Rental bookings — draft-only client writes (migration 070)

```sql
-- Customers ทำได้แค่ draft, non-walk-in เท่านั้น
-- Confirmed และ lifecycle อื่นๆ ต้องผ่าน server API เสมอ
CREATE POLICY "rental_bookings_insert_own_draft"
  ON public.rental_bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'draft' AND walk_in_phone IS NULL);
```

---

## 5. Column-Level Grants — Private Columns

สำหรับ table ที่มีทั้ง public และ private columns ให้ใช้ pattern นี้:

```sql
-- 1. Revoke ทุก column ก่อน
REVOKE ALL ON public.partner_profiles FROM anon, authenticated;

-- 2. Grant เฉพาะ column ที่ public-safe
GRANT SELECT (id, slug, name_th, name_en, is_public, is_verified, verified_at)
  ON public.partner_profiles TO anon, authenticated;

-- 3. เมื่อเพิ่ม column ใหม่ในภายหลัง — ต้อง grant แยก (ไม่ inherit อัตโนมัติ)
GRANT SELECT (new_public_column) ON public.partner_profiles TO anon, authenticated;
-- Private columns: ไม่ต้อง GRANT — จะ block อัตโนมัติ
```

---

## 6. Standard Triggers

### `updated_at` auto-update (ใช้ function จาก migration 001)

```sql
CREATE TRIGGER set_something_updated_at
  BEFORE UPDATE ON public.something
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

### Protect sensitive columns (pattern จาก migration 001)

```sql
CREATE OR REPLACE FUNCTION public.protect_something_sensitive()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  -- revert sensitive columns to OLD values
  NEW.platform_role := OLD.platform_role;
  RETURN NEW;
END;
$$;
```

---

## 7. Storage Buckets

| Bucket                | Public     | ใช้สำหรับ             |
| --------------------- | ---------- | --------------------- |
| `catalog-media`       | ✅ public  | รูปสินค้า, assets     |
| `avatars`             | ✅ public  | รูป profile user      |
| `kyc-documents`       | 🔒 private | เอกสาร KYC (max 20MB) |
| `rental-booking-docs` | 🔒 private | เอกสารการจองเช่า      |

เมื่อเพิ่ม bucket ใหม่ผ่าน migration:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bucket-name', 'bucket-name', FALSE, 5242880,
        ARRAY['image/jpeg','image/png','application/pdf']);
```

---

## 8. ห้ามทำ

- ❌ ห้ามแก้ migration เก่า (001–104) ไม่ว่ากรณีใด
- ❌ ห้ามสร้าง table ใหม่โดยไม่เปิด `ENABLE ROW LEVEL SECURITY`
- ❌ ห้ามใช้ `DROP TABLE` หรือ `DROP COLUMN` — ใช้ soft-delete หรือ rename แทน
- ❌ ห้ามลืม `GRANT` column ใหม่ที่เป็น public-safe หลัง REVOKE ครั้งแรก
- ❌ ห้าม hardcode UUID ใน migration — ใช้ `gen_random_uuid()` เสมอ
- ❌ ห้าม edit `database.types.ts` มือ — regenerate เท่านั้น
