# T-LAUNCH post-merge smoke — 2026-07-25

> **ANNOTATION 2026-07-26 — PART OF THIS RECORD DESCRIBES A REMOVED CHANNEL.**
> The FINAL LAUNCH MONEY MODEL (decisions.md 2026-07-26) removes the typed
> staff-charge channel from the web: the only collectable types are now
> `rental_charge` and `rental_extension`. The settle walks below that exercise
> `taxable_service_charge`, the 5,000 THB per-line cap and the
> `actual_damage` disabled-type refusal therefore describe behaviour that is
> being REMOVED, not behaviour to preserve.
> **The findings and results below are NOT edited** — this record stands as the
> account of what was true on 2026-07-25, which is what makes it an audit record.
> The removal is tracked as its own BACKLOG task, queued before post-merge
> batch 1. Everything else here — cancel across all surfaces, the waive denial
> row, VAT-inclusive extraction, slot release — is unaffected.

Status: **COMPLETE WITH FINDINGS.** Two layers run fresh against the merge result.
Scope: the three released §8.7 gates (R-A settle, §8.9-half-2 waive, K-1 cancel).
Merge under test: `d13795f` (feature/t-launch → staging), pushed to origin/staging.
Last updated: 2026-07-25

CHiP ruled the earlier verbal smoke report as not having happened (no repo record),
so everything below was re-run from a clean database. Nothing here is carried over.

## Environment

- Local Supabase (127.0.0.1:54321), schema at migration **145**, `supabase db reset` from 001.
- Dev server started explicitly as `npx nuxt dev --dotenv .env.local`.
  **This mattered:** `.env` points at the production project `yzjczvzwmbbeyoodrjwm`
  (0 local-url hits / 1 remote-url hit); `.env.local` is the local one. A smoke run on
  the default env file would have written settlements and cancellations to production.
  Ref: BACKLOG `[INFRA] Dev default targets REMOTE db (.env)`.
- Fixtures from the new `supabase/seed.sql` (commit `96f4256`).
- Remote database was NOT touched at any point.

## Seed history — three failed cuts before a working fixture set

Recorded because the seed is now a committed dependency of every future smoke, and
each failure is a trap the next author would otherwise re-hit.

1. **Cut 1 failed to apply** — `ERROR: cannot insert a non-DEFAULT value into column
   "penalty_total" (SQLSTATE 428C9)`. `rental_booking_settlements.penalty_total` is a
   STORED GENERATED column (`f_penalty_lines_total(penalty_lines)`). Root cause of the
   miss: the schema was read via `information_schema.columns`, which does not surface
   generated-ness; `pg_attribute.attgenerated` is the authoritative check. Across all
   public tables this is the ONLY generated column.
2. **Cut 1 also carried a latent second defect** — the explicit `inventories` INSERT
   collided with `idx_inventories_one_default_per_branch` and
   `idx_inventories_one_default_rental_per_branch`, because the
   `store_branches_after_insert_seed_inventories_trg` trigger already creates
   `Default` + `Rental` for every new branch. Proven by rollback probe. The seed now
   looks up the trigger-created `Rental` inventory instead of asserting its own id.
3. **Cut 2 applied but no one could log in** — GoTrue returned
   `{"code":500,"error_code":"unexpected_failure","msg":"Database error querying schema"}`
   for all three users. `confirmation_token`, `recovery_token`, `email_change_token_new`
   and `email_change` have NO column default, so a raw INSERT leaves them NULL and
   GoTrue's scan into non-nullable Go strings fails. **This was a recurrence** — 
   progress.md:40 already recorded "raw-seeded auth rows needed the empty-string token
   fix" from the 2026-07-19 HTTP-debt walk.

Both fix diffs were re-confirmed by the auditor before application. Cut 3 applied clean
and all three users authenticate. Gate recorded in `docs/audit/gate-log.md`.

## Layer 1 — HTTP (real requests, dev server, cookie-authenticated sessions)

Auth: GoTrue password grant → `@supabase/ssr` session cookie (`sb-127-auth-token`).
Baseline before each run: `money_ops_decision_logs` = 0.

### Auth boundary
All six T-LAUNCH endpoints unauthenticated → **401**, fail closed:
`admin .../cancel`, `user .../cancel`, `admin .../return-settlement` (GET + POST),
`admin .../settlement-waive`, `admin/pos/history/cancel`.

### Cancel — customer (K-1)
- staff user POSTs the CUSTOMER endpoint for a booking they do not own → **403**, booking untouched
- owner cancels → **200** `{state:"cancelled", wasAlreadyCancelled:false}`
- repeat cancel → **200** `wasAlreadyCancelled:true`, **no second §F row**

DB: `cancelled` · initiator `customer` · source `customer_web` · reason stored.
Money: `cancellation_refund_eligible` NULL, `cancellation_refund_amount_due` NULL,
0 settlements, 0 documents — a launch cancel moves no money, as designed.

### Cancel — staff (K-1)
`POST /api/admin/rental-bookings/:id/cancel` → **200**; initiator `staff`, source
`admin_rental_detail`, §F `launch_booking_cancel`/`allowed`/`staff`.
Customer hitting the staff endpoint → **403** "Admin access required".

### Cancel — auto sweep (K-1, the cron's own entry point)
`f_auto_cancel_expired_rental_bookings()` → `{"failed":0,"cancelled":1,"today_bangkok":"2026-07-25"}`.
Cancelled ONLY the overdue booking; the future-dated and picked_up bookings were untouched.
§F row: operation `auto_no_show_cancel`, **actor_user_id NULL**, actor_role `system` — the
operation carries the auto/manual distinction, never a NULL actor (N-1..N-3).
Second run: `cancelled: 0`, still one §F row — idempotent.

### Slot release (the point of K-1)
Re-booking the same asset for the same dates after cancel: **ACCEPTED**.
Negative control on a still-confirmed slot: **`RENTAL_BOOKING_CONFLICT`**.
The 058 overlap trigger releases exactly when it should and not before.

### Settle — 13-arg with typed lines + discount (R-A)
Precondition walked through its real endpoints, not seeded: created a `return`
checklist and PATCHed it to `completed` (settle refuses without it).

Refusals, all **422** with Thai copy, state unchanged each time:
- line 5001 > 5,000 cap → "จำนวนเงินต่อรายการเกิน 5,000 บาท กรุณาแยกเป็นหลายรายการ"
- discount 600 = 60% > 50% super_admin ceiling → "ส่วนลดเกินเพดานสูงสุดที่ระบบอนุญาต (สูงสุด 50% ของค่าเช่า)"
- `charge_type: pending_review` → "ไม่สามารถกำหนดประเภทการเรียกเก็บนี้ได้"
- `charge_type: actual_damage` (DISABLED_FOR_LAUNCH) → "ประเภทการเรียกเก็บนี้ยังไม่เปิดใช้งานในช่วงเปิดตัว"
- discount > 0 with no note → "กรุณาระบุหมายเหตุสำหรับส่วนลด"

Success — rental 1000.00 + typed `taxable_service_charge` 200.00 − discount 100.00:
- **200**; booking → `returned`.
- Settlement row is the ratified launch shape: held 0 / penalty_lines `[]` /
  penalty_total 0 / applied 0 / refund 0 / additional 0 (§8.12 Option A).
- Payment state `awaiting_payment`, **amount_due 1100.00** — writer-derived (I-3 / J-4).
- `payment_allocations`, both `pending`, direction `in`:
  - `rental_charge` gross 1000.00 = net 934.58 + vat 65.42
  - `taxable_service_charge` gross 200.00 = net 186.92 + vat 13.08
  **VAT is extracted from the gross, confirming vat_inclusive (§8.10) end to end.**
- §F: `settlement_discount_granted` / `allowed` / `super_admin` (R-B, success-path).

### Waive — the §8.9-half-2 assertion
- **staff** → **403** "ยกเว้นยอดชำระได้เฉพาะผู้ดูแลระบบระดับสูงเท่านั้น" **AND a
  `settlement_payment_waive_denied` / `denied` / `staff` row PERSISTED.** This is the
  exact defect migration 141 + the wrapper fixed: the denial survives the refusal.
  Payment state unchanged (`awaiting_payment`, waived_at NULL).
- **super_admin** → **200** `{state:"waived"}`; row shows waived_at, waived_by, reason.
- repeat waive → **409** "รายการนี้ไม่ได้อยู่ระหว่างรอชำระเงิน จึงยกเว้นไม่ได้"
- no reason → **422** "กรุณาระบุเหตุผลในการยกเว้นยอดชำระ"
- Both of those refusals ALSO wrote denial rows — the wrapper logs on its own guards
  and on every RPC RAISE, as designed.

## Layer 2 — browser (Chromium, real UI)

Declared per docs/CLAUDE.md §7.3 before opening: purpose, routes, roles (seeded local
fixtures), mutating, expected result. Cookie consent answered with the
privacy-preserving option (decline non-essential). No real customer data was involved.

**Customer:** `/user/rentals` shows 2 confirmed rentals, **deposit ฿0.00** (free-booking
launch model). Booking detail renders the new launch copy with no `[NEEDS_TRANSLATION]`
placeholders. Cancel modal shows `cancelLaunchModalDesc` and **correctly omits the
refund-destination fields**. Confirm → booking `cancelled`, initiator `customer`,
source `customer_web`, one §F row, zero money rows.

**Staff (super_admin):** admin booking detail shows the new cancel card with consistent
launch copy ("ปล่อยคิวให้ว่างทันที ไม่มีการเรียกเก็บหรือคืนเงินใด ๆ"). Modal carries a
**mandatory** reason — confirm stays **disabled** on empty input (verified), and an
irreversibility + audit notice. With a reason → booking `cancelled`, initiator `admin`,
source `admin_rental_detail`, §F row written.

Across the whole browser layer: 0 documents, 0 allocations, no money moved.

## Findings

Disposition (CHiP, 2026-07-25): **F-1 and F-2 are fixed in this session**, as one
standalone commit after these records land. **F-3 goes to BACKLOG as a [MED] UI item.**

**F-1 — the launch success toast is unreachable (real defect). FIXED THIS SESSION.**
`app/pages/user/rentals/[bookingId].vue:341-346` picks the toast with
`canCancelLaunch.value ? cancelLaunchSuccess : cancelSuccessRefundRequest`, but it runs
AFTER `await loadDetail()`. `canCancelLaunch` requires `status === "confirmed"` (:71-73),
and by then the booking is `cancelled` — so the condition is always false and the
customer is always told **"ยกเลิกการจองและสร้างคำขอคืนเงินแล้ว"** ("…and a refund request
was created") when no refund request exists. Observed in the browser, then root-caused.
The `cancelLaunchSuccess` key added in `34fc044` is therefore dead. Data is correct;
this is customer-facing copy that misstates what happened.
Fix: capture the launch flag before the await chain so the toast reflects the state the
cancel acted on, not the state after the refetch.

**F-2 — deposit-era framing around the launch cancel (customer side only). FIXED THIS SESSION.**
Section header "การยกเลิกและขอคืนเงิน Booking Deposit", button "ยกเลิกการจองและส่งคำขอคืนเงิน"
and the modal title all promise a refund on a booking that has none, directly above body
copy stating no money is involved. The admin surface does not have this problem — its
copy is consistent throughout, and it stays untouched.

Fix (CHiP-supplied Thai, principle: **no money / refund / deposit words**, because a
launch cancel involves no money): header + button `ยกเลิกการจอง`; modal title
`ยืนยันการยกเลิกการจอง`; modal body `การจองนี้ไม่มีค่าใช้จ่าย เมื่อยกเลิกแล้วคิวเครื่องจะถูกปล่อยให้ผู้อื่นทันที
และไม่สามารถย้อนกลับได้`; confirm `ยืนยันยกเลิก`; back `กลับ`. Applied to both active locale
files, with the rendered surface verified so no deposit-era key leaks in by fallback.

**F-3 — chat FAB overlaps the primary cancel CTA** at ~529px viewport width; the FAB was
the topmost element over the cancel button until the page was scrolled. Cosmetic but it
sits on the primary action of the flow. **Goes to BACKLOG as a [MED] UI item** — not
fixed here, since it is a global layout concern rather than launch-cancel scope.

## Coverage NOT achieved

- **POS cancel surface — NOT walked.** `/api/admin/pos/history/cancel` requires
  `booking.pos_branch_id` to be set ("Only POS rentals can be cancelled here"); the
  seeded bookings are web-origin. It also requires **super_admin**, not staff. Needs a
  POS-origin fixture. Covered at unit level, not at HTTP.
- **Staff 20% discount tier — NOT walked.** The staff user has no
  `admin_user_branch_access` row, so branch-scoped settle paths 403 for them
  ("POS branch access required"); `super_admin` bypasses that check, so the walks above
  exercised the 50% ceiling only. Needs one branch-access row in the seed.

## BACKLOG effect

The debt line reads: *"HTTP-level walk for the T-LAUNCH endpoints (settle 13-arg, waive,
cancel × 3 surfaces) — ABSORBED BY THE POST-MERGE SMOKE."*

It is **NOT fully retired — it NARROWS** (CHiP ruling). Settle, waive, and cancel via
customer / staff / auto are now walked at HTTP and in the browser; **POS cancel is not**,
and neither is the staff 20% discount tier. The line is rewritten to cover exactly those
two remaining surfaces, with the seed additions each needs (a `pos_branch_id` booking; an
`admin_user_branch_access` row for the staff user).

F-1 and F-2 are fixed in this session and do not become backlog items. **F-3 is added as
a new [MED] UI item.**
