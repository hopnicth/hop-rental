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

### Operational Checklists (Active)

| ไฟล์                                          | cover อะไร                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kyc-production-enablement-checklist.md`      | **ACTIVE** — Production-only checklist for enabling KYC document upload/download; consolidates Decision C/D/F/H/I gates, owner/legal long-poles, Fluid Compute check, storage/security gates, production smoke test, rollback, monitoring, super_admin roster, purge/retention dependencies. ไม่ gate staging Admin UI |

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

---

## 7. Playwright MCP — Browser-Assisted Smoke / Debug

> **Status: ACTIVE — assisted QA/debug tool only.** Playwright MCP คือ real-browser tool สำหรับ
> local smoke/debug ที่ทำเฉพาะจุด — **ไม่ใช่** ตัวแทนของ repeatable Playwright E2E tests

### 7.1 What it is for

Playwright MCP ใช้ได้กับ **focused flow** ที่การเปิด browser จริงช่วยได้จริงเท่านั้น เช่น:

- customer rental checkout smoke
- cart / payment detail smoke
- admin KYC page smoke
- POS pickup readiness smoke
- reproducing a UI bug ที่เห็นใน browser

### 7.2 Hard rules — must follow

- ❌ ห้ามใช้ crawl ทั้งแอปแบบไม่มีเป้าหมาย (no broad unfocused crawling)
- ❌ ห้ามใช้เป็น primary regression strategy
- ✅ Prefer committed Playwright E2E specs + terminal commands สำหรับ repeatable tests
- ✅ ใช้ MCP **หลังจาก** รู้ชัดแล้วว่า: target URL, role, fixture, expected behavior
- ✅ For mutating flows: ใช้ **local / seeded test data เท่านั้น**
- ❌ ห้ามใช้ production data หรือ real customer data
- ❌ ห้าม upload ไฟล์ sensitive จริง — KYC documents, payment slips, IDs, passports,
  bank slips หรือ sensitive files อื่น ๆ ระหว่าง MCP smoke test
- ❌ ห้าม store/commit MCP browser state, cookies, local profiles, screenshots, videos,
  หรือ traces ที่มี sensitive data
- ✅ ถ้ามี screenshot/trace ถูกสร้างขึ้น → เก็บไว้ local เท่านั้น และรายงาน path เฉพาะเมื่อปลอดภัย

### 7.3 Before every MCP session — state these first

ก่อนเปิด browser ด้วย MCP ต้องระบุให้ครบ:

1. **purpose** — ทำเพื่ออะไร
2. **target route** — URL เดียวที่จะเปิด
3. **test role / account source** — role อะไร, account มาจากไหน (seeded/local)
4. **read-only or mutating** — action อ่านอย่างเดียว หรือเขียน/แก้ data
5. **expected result** — คาดว่าจะเห็นอะไร

### 7.4 If MCP reveals a bug — capture

- route
- role
- fixture / data used
- exact action
- expected behavior
- actual behavior
- console / network errors (ถ้าเกี่ยวข้อง)
- screenshot / trace path (เฉพาะเมื่อปลอดภัย)

### 7.5 Token budget rule

Playwright MCP **token-expensive** กว่า terminal test output มาก ใช้เฉพาะ focused browser
debugging เท่านั้น สำหรับ regression ปกติให้ **เขียน/รัน Playwright tests ผ่าน CLI ก่อน**
ใช้ MCP เฉพาะเมื่อ terminal output ไม่พอที่จะเข้าใจ UI state เท่านั้น

หลีกเลี่ยง: long exploratory sessions, repeated full-page snapshots, การ browse ทั้งแอป
โดยไม่มีเป้าหมายชัด

### 7.6 Preferred workflow

**A. รัน normal checks ก่อนเสมอ:**

```bash
npm run lint        # ถ้ามี lint script
npx tsc --noEmit
npm test            # = vitest run
```

**B. สำหรับ browser regression — prefer Playwright CLI tests:**

```bash
npx playwright test
npx playwright test --headed
npx playwright test --debug
```

**C. ใช้ Playwright MCP เฉพาะ targeted browser investigation:**

- one route
- one role
- one expected behavior
- stop หลัง confirm pass/fail
- รายงานผลแบบ concise

> Note: ปัจจุบัน repo ยังไม่มี committed Playwright E2E specs หรือ lint script —
> regression coverage หลักอยู่ที่ Vitest (`npm test`). คำสั่ง `npx playwright test`
> ในข้อ B จะใช้ได้เมื่อมีการ add Playwright runner + specs ในอนาคต
