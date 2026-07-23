# Remote flow test + deposit-model pivot — 2026-07-21/22

Status: **HISTORY** (closed record). The live-project residue inventory in §4 is **CURRENT and permanent** — those rows exist on the linked project today and cannot be deleted.

## 1. Timeline
- **2026-07-19** — T3+T4-core Phase 1 shipped (`1ddd19c`); migrations 127-132 applied to remote; local = remote, zero drift.
- **2026-07-21/22** — Remote flow test: one cancel → refund → document story walked end-to-end over real HTTP (`:3001`) against the linked project. All 5 legs passed.
- **2026-07-22** — Cleanup halted: FK `ON DELETE RESTRICT` makes the test booking and its money rows undeletable. Nothing deleted; all minted sessions revoked.
- **2026-07-22** — Booking-guarantee **Model B ratified** (`749dca4`): deposits stay liabilities, converted at pickup via a three-document chain.
- **2026-07-22** — Model B **SUPERSEDED the same day** (`65fa49c`): research report 2 showed ป.73/2541 pulls movable-rental deposits into the VAT base on receipt → **minimal launch, no deposits at all**.
- **2026-07-23** — Process incident + T-LAUNCH branch discipline recorded (`cffbc70`).

## 2. Core outcomes — one line each
- **Flow test PASSED:** the T3/T4 cancel → refund → document chain behaves on remote exactly as designed — §F staff denial (403 + logged decision row), super_admin company-cancel, ledger residue 0, BDR document issued, void + reissue chain intact.
- **Transport finding:** admin order PATCH returns **404 before** the 409 payment-status block (the order lookup precedes the guard) — matches source; not a bug, and the walk-4 pin only ever claimed 409-before-*validation*.
- **Schema finding:** append-only money rows (held-balance ledger, cancellation events, payment_refunds) FK the booking `ON DELETE RESTRICT`, and `rental_bookings.user_id` cascades from users — so **test bookings and their customers are permanently undeletable by design**. Plan all future test data on that assumption.
- **Decision pivot:** the deposit machinery went from *ratified Model B* to *feature-gated off entirely* within one day, on tax-risk evidence — the single most consequential change of the period.

## 3. What this means going forward
- Deposit/forfeiture machinery is **parked, not deleted** (decisions.md 2026-07-22 f); revival needs card-hold capability + the ป.73/2541 memo.
- Remote smoke tests must assume **irreversible residue**; prefer local for anything that writes money rows.

## 4. Permanent live-project residue (keep these IDs — not deletable)
- `rental_bookings` `02004e7d-61f2-4ef0-9c35-d8bf63e9d111` (cancelled; hand-seeded) — RESTRICT-locked by its money rows
- `assets` `499fbcfe-a6c6-4fde-a29b-744006c7bbf3` (SMOKE-RFT-1, draft, hidden; hand-seeded)
- `rental_booking_payment_attempts` `b6a1160a-d5ca-4093-a553-69b60fd5dc0b` (hand-seeded)
- `rental_held_balance_events` `0032cab9` collection ฿100 (hand-seeded) + `fccf603c` refund ฿100 (flow) — net residue 0, append-only
- `payment_refunds` `b915ec0b-9199-40b7-9e28-c2804eeb9abc` (refunded ฿100) — referenced by both official documents
- `rental_booking_deposit_proofs` `1d582c7f` + storage object `catalog-media/deposit-proofs/02004e7d…/refund-7bb2a1e1….jpg`
- `rental_booking_cancellation_events` `5ce360e7` (company_cancellation, ฿100)
- `money_ops_decision_logs` `2487f0c0` (denied/not_super_admin) · `bda038da` (allowed/company_cancel) · `d96956a1` (allowed/document_void) — append-only
- `rental_booking_deposit_action_logs` `bd036ac9` (company_cancel_refund) · `55e261ff` (cancel_refund)
- `official_documents` `c3b648c4` BDR-202607-0001 (replaced) · `e0ea6af4` BDR-202607-0002 (issued) — undeletable by the mig-131 guard; registry numbers 0001/0002 permanently consumed
- `document_events` — 4 rows (issued / voided / issued-reissue / replaced)
- `users` smoke-customer@hopnic-test.local `0c25d632` (undeletable — cascade blocked by RESTRICT)

## 5. RESOLVED — smoke super_admin demoted
- **`smoke-superadmin@hopnic-test.local` (`336c938c-3edd-449b-a08d-87844ec91029`) held `platform_role = super_admin` on the LIVE project.** CHiP ruled DEMOTE (no fixture retained). **Demoted to `customer` on 2026-07-23**, auditor-gated (SQL reviewed and approved before execution); exactly 1 row updated, verified by read-back. Its sessions had already been globally revoked 2026-07-22, so no active token carried the old role.
- Post-demotion sweep of all elevated roles on the project: 1 `super_admin` (`c1089c0e`, the genuine owner account) + 4 `staff`. Among the staff was `smoke-staff@hopnic-test.local` (`5418f2df`) — a pre-existing test account at `staff`, first recorded in `docs/audit/2026-07-15-remote-cleanup-and-migration-sync.md` — flagged at the time as out of scope of the super_admin ruling. **Ruled and resolved same day, see below.**
- **SECOND DEMOTION — `smoke-staff@hopnic-test.local` (`5418f2df-6410-4abc-80f7-be50fc11d9cf`).** CHiP ruled DEMOTE on the same principle (no privileged fixtures on live). **Demoted `staff` → `customer` on 2026-07-23**, auditor-gated (SQL reviewed and approved before execution); exactly 1 row updated, verified by read-back. A **global logout was performed after the UPDATE** (HTTP 204, all sessions revoked) as belt-and-braces against any stale JWT carrying the old role claim.
- **Final elevated-role state on the live project (2026-07-23):** 1 `super_admin` (`c1089c0e`, genuine owner) + 3 `staff` (`27a2f0f0`, `17e28f71`, `6d5b3b5a`) — all genuine accounts. **No test/smoke account holds any elevated role.**
