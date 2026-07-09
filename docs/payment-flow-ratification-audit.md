# Payment Flow Ratification Audit

- **Audit date:** 2026-07-08 (read-only audit; no code changes were made)
- **Decision date:** 2026-07-08
- **Scope:** Live manual payment slip flow (migration 115 lineage) vs the approved-but-unimplemented Phase 0 design; integrity gap assessment; staff-upload-on-behalf readiness
- **Method:** Evidence-based — file paths + line refs + migration DDL reads. Nothing asserted from docs or memory alone.
- **Status:** Ratification decision recorded below. Fix slices (P-1/P-2/P-3) tracked in HANDOFF.md.

---

## 1. Decision

**2026-07-08 — Owner (CHiP) ratified the in-system slip-upload flow (mig 115 + the mig 113/114 confirm paths) as the official payment flow. The Phase 0 design (LINE/WhatsApp slip submission + "Mark Deposit Received" admin button, no in-system slips) is formally dropped.**

Ratification is **conditional**:

- **G1 + G2 must be fixed before launch** (P-1: integrity migration; P-2: atomic confirm RPC).
- **G3 + G4 + A1 must be fixed before staff-upload-on-behalf ships** (P-3).
- **G1 severity is deliberately NOT downgraded.** The mig 113/114 "consciously non-append-only" choice is unratified legacy debt, not precedent: locked payment-architecture decisions require the mig-111 append-only pattern on money paths, and the planned staff-upload feature increases the number of actors touching the service-role path.

### Context: Phase 0 vs what actually runs

| | Phase 0 (approved on paper, never built) | Live system (ratified) |
|---|---|---|
| Slip channel | Customer sends slip via LINE/WhatsApp | Customer uploads slip in-system |
| Staff action | Verify in chat, click "Mark Deposit Received" | Review queue in admin, status-driven |
| Evidence location | Staff chat history | DB + private storage bucket, linked to request ID |
| Build status | Not implemented (orphaned i18n keys are the only trace) | Fully built, tested, translated (mig 115; both sale and rental paths converge on it) |

The original Phase 0 rationale ("avoid building slip UI, reduce scope") expired once the slip UI was built and shipped. What remains valuable from Phase 0 is its **guarantee set** — append-only immutability, atomic confirm, role separation, voided correction path, deposit-not-revenue — which this audit scores the live system against.

### Architecture note (frames all findings)

There are **three parallel slip tracks**. `manual_payment_requests` (mig 115) is a customer-facing "pay one lump sum" wrapper that is **evidence-only — it never confirms anything**. The real money/confirm writes happen on `sale_order_payment_slips` (mig 114 → order paid) and `rental_booking_deposit_slips` (mig 113 → booking confirmed) via separate admin endpoints.

---

## 2. Findings

### F1. Slip storage — ✅ sound (with logging/retention gaps → A1, A2)

- Bucket `manual-payment-slips`, **PRIVATE** (`public=FALSE`), 10 MB, jpeg/png/pdf — `115:37-48`; hardcoded `MANUAL_PAYMENT_SLIP_BUCKET` in `manual-payment-request-slip-evidence.ts:31`; migration self-asserts privacy (`115:183-188`).
- Access rules: RLS = service-role-only on the tables (`115:149-176`); no `storage.objects` policy for the bucket anywhere (deliberate, mirrors KYC design). Reads only via service-role server APIs + short-lived signed URLs (`admin/manual-payment-requests/[id]/slips/[slipId]/download.get.ts`).
- Access logging: **NONE**. No slip-read/download log (KYC has `kyc_document_access_log`; mig 115 header explicitly defers it — `115:31-32`). → **A1**
- Retention/deletion: **NONE**. No TTL/cron/policy/endpoint. Only `ON DELETE CASCADE` from the parent (`115:83-84,102-103`), and nothing deletes parents → slips are kept forever. → **A2**

### F2 / G1. Immutability — ❌ FAILS

- The only trigger on the three mig-115 tables is `set_manual_payment_requests_updated_at` (bumps `updated_at` only — `115:141-145`). `manual_payment_request_slips` and `_items` have **no trigger at all**.
- No append-only / UPDATE-guard / DELETE-guard anywhere — the mig-111 KYC `BEFORE UPDATE … RAISE` pattern is not replicated.
- Consequence: a reviewed/rejected row and its accountability fields (`reviewed_by`, `reviewed_at`, `rejected_reason`, `total_amount_due`, `admin_note`) can be **silently edited or deleted by any service-role write**.
- Siblings 113/114 documented non-append-only as intentional; 115 does not even restrict edits to review-only fields.

### F3. Status transitions — endpoint-only (→ A3)

- Enforced solely by free `CHECK (status IN (...))` — 5-state request (`115:57-58`), 3-state slip (`115:110-111`).
- No transition-legality trigger, no `SECURITY DEFINER` RPC. A direct service-role write can jump to any allowed value (`reviewed→pending_review`, `awaiting_payment→reviewed`, etc.). Legality lives only in the Nitro endpoints.

### F4 / G2. Confirm atomicity — ⚠️ PARTIAL

- Marking a `manual_payment_requests` row reviewed confirms nothing (evidence-only). The real rental confirm is `POST /api/admin/rental-bookings/:id/record-deposit` → `recordManualBookingDeposit` (`rental-manual-deposit-confirmation.ts:90`).
- Double-booking **IS** atomically prevented — `058_rental_booking_atomic_overlap_guard.sql`: a `BEFORE INSERT/UPDATE OF status` trigger takes a per-asset `pg_advisory_xact_lock` then rejects overlapping confirmed/picked_up rows (ERRCODE 23P01, caught at `rental-booking-confirmation.ts:351`). ✅
- **BUT** the confirm is a multi-step, non-transactional sequence (not one RPC): held-balance event insert → `UPDATE rental_bookings` (guarded `.eq` unpaid) → slip→reviewed → `confirmRentalBooking`. If the final confirm throws (e.g. the 23P01 availability conflict), **the earlier committed writes do not roll back** → money/held-balance liability recorded for a booking that stays unconfirmed. Guarded `.eq` clauses limit replay but there is no compensating rollback. Evidence: `rental-manual-deposit-confirmation.ts:168-250`.

Note (2026-07-09): the POS V3 deep audit (P2.5) verified the same non-atomic 4-write confirm pattern in the POS V3 finalizer path (pos-rental-booking-deposit-finalizer.ts), including a cash-path W1->W2 crash gap. G2 therefore spans BOTH confirm paths; mig 119 scope must cover both (see DECISIONS 2026-07-09).

### F5 / G3, G4, A4. Role enforcement — ⚠️ PARTIAL

- `review` and `reject` both use `requirePlatformAdmin` (`review.post.ts:19`, `reject.post.ts:18`) = staff + super_admin (`admin.ts:8`). No super-admin separation; `requireSuperAdmin` is unused in this flow. → **A4** (likely intended)
- **No reviewer ≠ uploader enforcement**: `uploaded_by` is never compared to `reviewed_by` (grep-clean). → **G3**
- **No void / un-review / revert / correction path exists** (grep-clean). A wrong reviewed/rejected decision is irreversible via any route — today it can only be "corrected" by a raw service-role DB edit (possible precisely because of G1), untracked and not role-separated. → **G4**

### F6. Accounting — ✅ PASS (deposit-not-revenue holds)

- No revenue/VAT/sales reporting system exists (greenfield). `manual_payment_requests` amounts are never summed anywhere.
- Deposits are modeled as refundable liabilities: `rental_booking_payment_lines.is_refundable/tax_category` (mig 074); `rental_held_balance_events` "liabilities, not rental revenue" (`086:40`); forfeiture is schema-locked to zero VAT (`085:122-136`, `CHECK vat_rate=0`).
- Minor flag (not a revenue bug): `admin/pos/history.get.ts` daily cash-reconciliation total falls through to legacy `rental_bookings.deposit_paid_amount` in a rolled-up totalRentals/totalAmount (`:205-210`). It is an ops/cash view, not a VAT/revenue figure — only matters if that endpoint is ever repurposed into financial reporting.

### F7. Volume surface — narrow (blast radius of ratifying = one endpoint)

- Exactly **ONE** creation entry point: `POST /api/user/manual-payment-requests` (`serverSupabaseUser`) → `manual-payment-request.ts:350-365`. One function derives `sale_only | booking_only | mixed` (`:335`), covering cart-sale, rental-deposit, and mixed checkout. A reuse path (`findReusableRequestId`) avoids duplicates.
- POS does NOT create these (pos-v3 deposit endpoints write payment-attempt tables + run their own finalizer).

### F8. Staff-upload readiness

- Uploader **IS** recorded: `uploaded_by UUID NOT NULL` (`115:112`), set from the session user (`slips.post.ts:98`, `uploadedBy: String(userId)`). `reviewed_by`/`rejected_by` exist too.
- Upload is strictly **customer-session-only** today. All three upload utils run only from `server/api/user/...`; no admin/staff endpoint inserts a slip — admin slip routes are read-only (download/signed-url/list).
- No reviewer≠uploader enforcement (see G3). The actor column exists to build on; the separation-of-duties guard must be added.
- A staff-upload feature therefore needs: an admin slip-write endpoint recording `uploaded_by` + origin channel (e.g. "customer sent via LINE at …"), a reviewer≠uploader guard (or at minimum same-actor logging), a role-separated void/correction path (G4), and slip access logging (A1).

---

## 3. Gap list — scored vs the Phase 0 guarantee set

| # | Guarantee | Status | Gap & evidence | Severity |
|---|---|---|---|---|
| G1 | Append-only immutability | ❌ FAIL | No mutation/delete guard on any of the 3 mig-115 tables; reviewed/rejected rows + `reviewed_by`/`total_amount_due` silently editable/deletable (115 — only `updated_at` trigger) | **BLOCKER** |
| G2 | Atomic confirm | ⚠️ PARTIAL | Double-booking atomic (mig 058 ✅); but deposit-confirm is 4 non-transactional writes with no rollback → money recorded without a confirmed booking on partial failure (`rental-manual-deposit-confirmation.ts:168-250`) | **BLOCKER** |
| G3 | Role separation | ❌ FAIL | No reviewer≠uploader check; `uploaded_by` never compared to `reviewed_by` → a staffer could upload and approve | **REQUIRED-FOR-STAFF-UPLOAD** |
| G4 | Voided correction path | ❌ FAIL | No void/un-review/revert endpoint; wrong reviews only fixable by raw DB edit (untracked), not role-separated | **REQUIRED-FOR-STAFF-UPLOAD** (launch-leaning) |
| G5 | Deposit-not-revenue | ✅ PASS | Never aggregated; liabilities + zero-VAT locked (mig 074/085/086) | — (NICE-TO-HAVE: pos/history rollup) |

Additional gaps (outside the 5-guarantee set):

| # | Gap | Severity |
|---|---|---|
| A1 | No slip-read/download access log (staff will view customer financial PII unlogged; KYC logs, this doesn't) | **REQUIRED-FOR-STAFF-UPLOAD** |
| A2 | No retention/deletion for slip files/rows (financial PII kept forever — PDPA) | NICE-TO-HAVE |
| A3 | No status-transition trigger/RPC (DB defense-in-depth; endpoints are sole writer today) | NICE-TO-HAVE |
| A4 | No super-admin separation on review/reject (staff can review — likely intended) | NICE-TO-HAVE |

---

## 4. Fix plan (tracked in HANDOFF.md)

- **P-1 — Integrity hardening migration (closes G1, part of A3):** append-only/UPDATE-guard triggers on the mig-115 tables per the mig-111 pattern, permitting only legitimate transition-field updates. Scope decision pending: whether to also cover mig 113/114 slip tables (leaning yes — real money confirms there).
- **P-2 — Atomic confirm RPC (closes G2):** wrap the `recordManualBookingDeposit` write sequence in a single `SECURITY DEFINER` RPC (pinned `search_path`), all-or-nothing.
- **P-3 — Staff-upload-on-behalf feature (closes G3, G4, A1):** admin slip-write endpoint with actor + origin-channel logging, reviewer≠uploader guard, role-separated void/correction path, KYC-style access logging. Requires P-1/P-2 first.
- A2 (retention/PDPA policy) → backlog with a pre-launch policy note. A4 accepted as intended.

## 5. Audit limitations

- Read-only: behavior inferred from code/DDL, not from live fault-injection (e.g. the G2 partial-failure path was traced, not induced).
- Line references were captured against the working tree on 2026-07-08 (staging @ the partner-taxonomy era); subsequent commits may shift line numbers.
- The severity caveat raised during audit — that G1 could be downgraded to "documented accepted risk" per the 113/114 precedent — was reviewed and **rejected** by the owner's auditor; rationale recorded in §1.
