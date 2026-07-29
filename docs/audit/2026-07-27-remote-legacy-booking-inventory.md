# Remote legacy-booking inventory — 2026-07-27

Status: **RECORD** — read-only inventory of remote rental bookings, with CHiP's
dispositions. No action was taken on any finding; SELECTs only, no writes of any kind.

## Access and its limits

PostgREST over the remote project with the service-role key, **GET requests only**. The
`auth` schema is not reachable this way, so the `.invalid`-email signal was not checkable;
every other signal below is first-hand. Storage objects were not enumerated.

## Findings

**1 — remote holds exactly ONE `rental_booking`, and it is smoke residue.**
`02004e7d-61f2-4ef0-9c35-d8bf63e9d111`, created 2026-07-21T20:45:15Z, cancelled 20:46:28Z.
Five independent signals: `product_name` "SMOKE remote-flow-test asset"; asset code
`SMOKE-RFT-1` / slug `smoke-remote-flow-test-1` created 90 seconds earlier; the refund row's
"SMOKE BANK" / "Smoke Customer" / `SMOKE-TRF-0001`; `admin_note` and `metadata` both reading
"smoke remote flow test"; and a full create → deposit → cancel → refund → void/reissue
lifecycle completed in 114 seconds. It is the T3 company-cancel HTTP walk. There are no other
bookings, so there is no second list to triage.

**2 — nothing is deletable in principle.** The DELETABLE class is empty. The single booking
carries 2 held-balance events (mig-118 append-only), 3 `money_ops_decision_logs` (mig-132
append-only), 2 official documents in a void/reissue chain (mig-131 — a voided document is
never deleted, by design), 1 `payment_refund`, 1 cancellation event and 1 deposit proof.
`payment_allocations`, settlements, `financial_recognition_events`, deposit dispositions,
orders, fulfillments, checklists and `kyc_profiles` are all empty on remote.

**3 — deposit-era bookings on remote: exactly 1, and it is the smoke row.** REAL deposit-era
bookings: **ZERO**. This is what allows the customer chip's raw-enum labels to stay deferred:
no real customer can reach them before deposit revival.

**4 — the smoke consumed the first two BDR numbers of the 2026-07 series**
(`BDR-202607-0001` → replaced, `BDR-202607-0002` → issued). Sequence-allocated and immutable,
so the first real deposit-refund document of that period cannot be `-0001`.

**5 — the refund proof sits in the PUBLIC `catalog-media` bucket** (the known legacy hygiene
issue, BACKLOG T5).

**Open question, not a finding** — `payment_attempts` is empty on remote, yet the booking and
its held-balance event both cite attempt `b6a1160a…`. Either attempts live in
`rental_booking_payment_attempts` and the generic table is unused, or the reference is
dangling. Not resolvable read-only through PostgREST.

## Dispositions (CHiP, 2026-07-27)

1. **The smoke booking STAYS on remote** — data-vs-display: it is cancelled,
   customer-invisible, and append-only-protected. No purge, no exception request.
2. **The consumed BDR numbers are DISCLOSED, not remediated** — the period-prefixed format
   (`BDR-YYYYMM-NNNN`) keeps the impact contained to one period, and the record exists to
   pre-answer the question rather than to flag a problem.
3. **The public-bucket proof file STAYS** — one file, not clutter. The T5 bucket-hygiene
   BACKLOG item is unaffected and **remains open**.

## Environment scale (context)

15 `public.users` · 15 products · 9 assets · 0 orders · 0 fulfillments · 0 checklists ·
0 `kyc_profiles`.
