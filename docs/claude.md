# Docs Guidelines — HOPNIC

> ไฟล์ใน `docs/` เป็น **design decisions + implementation status** ที่ใช้อ้างอิงระหว่าง coding
> Claude ต้องอ่านไฟล์ที่เกี่ยวข้องก่อนแตะ feature นั้น — ห้ามอนุมาน behavior จากชื่อไฟล์อย่างเดียว

---

## 1. สถานะไฟล์ในโปรเจกต์

แต่ละไฟล์มี **Status** บรรทัดแรก — ต้องอ่านก่อนเสมอ

| Status keyword           | ความหมาย                                      |
| ------------------------ | --------------------------------------------- |
| `IMPLEMENTED`            | มี code ทำงานจริงแล้ว — design ตรงกับ runtime |
| `PARTIAL IMPLEMENTATION` | บางส่วน done, บางส่วนยังเป็น design/planning  |
| `DESIGNED ONLY`          | ยังไม่มี code — เป็นแค่ design decision       |
| `PARKED`                 | หยุดพัฒนาชั่วคราว — ยังไม่มีแผนชัด            |
| `CLOSED`                 | phase นั้นจบแล้ว — guardrails ถูก lock        |
| `PLANNING NOTE`          | เป็น planning เก่า อาจมีส่วนที่ outdated      |

### Reality Sync Section

ทุก doc ที่มี "Reality sync" section → อ่านก่อนทุกครั้ง เพราะจะบอกว่าส่วนไหน done จริง ส่วนไหนเป็นแค่ design

---

## 2. Index ของ docs และสิ่งที่ cover

### Design & Architecture

| ไฟล์                                           | cover อะไร                                                           | status                                 |
| ---------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| `ux-lifecycle-standard.md`                     | Button action pattern, form state, toast, error handling ใน Vue/Nuxt | Standard (ใช้ active)                  |
| `printing-document-standard.md`                | A5 print, OfficialDocumentHeader, immutable snapshot, print pattern  | Partial — A5 + BDC done                |
| `document-generation-architecture.md`          | Architecture ระบบ document generation ทั้งหมด                        | Partial — ส่วน BDC + rental forms done |
| `document-foundation-implementation-design.md` | Database foundation สำหรับ official_documents                        | Reference                              |
| `legal-agreement-consent-system-design.md`     | ระบบ legal consent และ agreement                                     | Reference                              |
| `legal-web-agreements-guideline.md`            | Guideline สำหรับ web legal agreements                                | Reference                              |
| `legal-customer-verification-forms.md`         | รูปแบบ form ยืนยัน KYC                                               | Reference                              |

### Rental Booking & Payment

| ไฟล์                                                       | cover อะไร                                           | status                                 |
| ---------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| `rental-booking-payment-document-action-plan.md`           | Payment lines, Booking Deposit, WHT, document phases | Partial — BDC done, tax/receipt future |
| `booking-deposit-forfeiture-accounting-document-design.md` | Forfeiture, no-show, accounting design               | Partial foundation done                |
| `current-schema-focused-summary-deposit-forfeiture.md`     | Schema snapshot สำหรับ forfeiture design             | Reference                              |
| `customer-rental-booking-cancellation-refund-design.md`    | Self-service cancellation/refund flow                | Implemented — Phase C.1E               |
| `customer-cancellation-refund-handoff.md`                  | Handoff notes สำหรับ cancellation/refund             | Reference                              |

### Phase Checklists (Closed / Accepted)

| ไฟล์                                               | cover อะไร                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `phase-2d-booking-deposit-acceptance-checklist.md` | **CLOSED** — POS V3 BDC flow acceptance. Test suite 864/864 pass |
| `phase-2e-pos-rental-operational-flow-audit.md`    | POS V3 operational flow audit                                    |

### Planning

| ไฟล์                              | cover อะไร                          |
| --------------------------------- | ----------------------------------- |
| `admin-pos-full-function-plan.md` | Full-function plan สำหรับ Admin POS |

### Schema Snapshots

| ไฟล์                                             | cover อะไร                                        |
| ------------------------------------------------ | ------------------------------------------------- |
| `schema-snapshots/current-schema-2026-05-14.sql` | Schema snapshot ณ 2026-05-14 — reference เท่านั้น |

---

## 3. Design Decisions ที่ Lock แล้ว — ห้ามเปลี่ยนโดยไม่ได้รับอนุมัติ

### Printing / Documents

- ทุก document ใช้ **A5 browser print** — ไม่ใช้ carbon paper / dot-matrix
- Header ต้องใช้ `OfficialDocumentHeader` component เสมอ — ห้ามใช้ `<header class="form-header">` เก่า
- BDC คือ confirmation document ไม่ใช่ receipt/tax invoice — ห้าม convert โดยไม่มี audit pass ใหม่
- Issued documents ต้องเก็บ immutable snapshot JSON สำหรับ reprint/audit

### Rental Booking Flow

- Customer client-side write ทำได้แค่ `draft` + non-walk-in (RLS locked ใน migration 070)
- Confirmed/lifecycle transitions ต้องผ่าน server API เสมอ
- Late cancellation = support-only หลัง cutoff — ห้าม implement เป็น self-service

### No-Show

- Staff mark `no_show` → Booking Deposit ถือว่า forfeited/refund-not-applicable
- ไม่มี `payment_refunds` row สำหรับ no-show
- No-show lifecycle แยกต่างหากจาก customer cancellation/refund

### Booking Deposit Collection (POS V3)

- Phase 2D CLOSED — guardrails อยู่ใน `phase-2d-booking-deposit-acceptance-checklist.md`
- ห้าม deepen POS V3 pickup/return/settlement/fiscal UI โดยไม่มี audit pass ใหม่

---

## 4. วิธีอ่าน docs ก่อน coding

เมื่อจะแตะ feature ใดๆ ให้หา doc ที่เกี่ยวข้องก่อน:

```
1. อ่าน Status บรรทัดแรก
2. อ่าน Reality sync section ทั้งหมด
3. สังเกต guardrail / "do not" statements
4. ตรวจสอบว่า feature ที่จะทำเป็น "DESIGNED ONLY" หรือ "IMPLEMENTED"
5. ถ้า doc บอก "see also [other doc]" → ต้องอ่าน doc นั้นด้วย
```

---

## 5. UX Standard ที่ใช้ Active (จาก `ux-lifecycle-standard.md`)

### Button action pattern — บังคับ

```ts
const loading = ref(false);
async function handleSubmit() {
  if (loading.value) return; // ป้องกัน double-submit
  loading.value = true;
  try {
    await doSomething();
    toast.add({ title: "สำเร็จ", color: "success", icon: "bx:check-circle" });
  } catch (err) {
    toast.add({
      title: "เกิดข้อผิดพลาด",
      description: String(err),
      color: "error",
      icon: "bx:error-circle",
    });
  } finally {
    loading.value = false;
  }
}
```

```vue
<UButton
  :loading="loading"
  :disabled="loading || !canSubmit"
  @click="handleSubmit"
/>
```

---

## 6. ห้ามทำ

- ❌ ห้ามอ่านแค่ชื่อ doc แล้วอนุมาน — ต้องอ่าน Status + Reality sync ก่อนเสมอ
- ❌ ห้ามสร้าง doc ใหม่โดยไม่มี Status + Last updated + Reality sync (ถ้า partial)
- ❌ ห้าม override locked design decisions (printing, BDC, no-show, RLS) โดยไม่มีการอนุมัติ
- ❌ ห้ามอ้างอิง "DESIGNED ONLY" doc เป็นเหตุผลว่ามี implementation แล้ว
- ❌ ห้ามแก้ `schema-snapshots/` — เป็น read-only reference
- ❌ ห้ามนำ design ใน "PARKED" section มา implement โดยไม่มีการ re-approve
