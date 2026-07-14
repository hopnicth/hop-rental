# MASTER GAP MAP — T1–T8 routing table

Status: **ACTIVE routing table** (not a report). One page. Source: the three journey audits
(purchase `8886ddb`, rental `2db625a`, mixed `84857de`), the B6 staff/POS walk
(`docs/audit/2026-07-10-b6-walkthrough.md`), and `docs/BACKLOG.md`. Ordering + policy are locked in
`decisions.md` "2026-07-14 — Post-journey-audit decision set (owner)". This table supersedes the
older V3-0→V3-6 slice track as the delivery routing (V3 slices now map into the T-tracks below).

**Delivery unit = one flow that walks end-to-end. Acceptance = a re-walk shows the referenced audit
mark IDs resolved.** Reusable-by-evidence: anything proven duplicated across ≥2 flows AND
money/document-related is built centrally, immediately.

| Track | Scope | Depends on | Finding refs (audit mark IDs) | Decision |
|---|---|---|---|---|
| **T1a** | ✅ **RESOLVED** at `75084ed` — Case-2 B6 / Case-3 Y5 closed (first picked_up booking recorded). Was: Staff-KYC capture + SUPER ADMIN approve queue; link via User-ID QR | — | Case-2 **B6** (pickup 422 `no_profile`), Case-3 **Y5** | §a |
| **T1b** | Customer online KYC self-serve → approve queue — individual id-card path shipped in `75084ed`; REMAINS OPEN: juristic self-serve + users.kyc_status mirror retirement + display unification (BACKLOG, T1a close-out) | T1a ✅ | Case-2 B6/L1 (0 bookings ever picked_up) | §a |
| **T2** | Pickup → return → **settlement** = the rental ledger **release side** | T1 | Case-2 furthest-reachable dead-end, **L1** (`settlement_application`/`refund`/`forfeiture` = 0 events ever), B9 unreachable; B6 walk (BDC/held-balance) | §b (early-return-in-full, no-show auto-forfeit) |
| **T3** | Unified **void / cancel / deposit-refund** path (sale + rental + mixed) | **T2** (deposit-refund completeness needs settlement to exist); designed **with T4** | Case-1 **D5/BUGS 1-3** (cancel-paid: no stock restore, stays `paid`, no refund), Case-2 **B7** (rental cancel raw flip, deposit stranded, `cancelled_at` NULL), Case-3 **B4** (mixed half-cancel), B-M1/G4, `66666666…` paid_confirm_failed recovery | §b (refund = bank transfer + reason + bank acct + admin slip) |
| **T4** | **Document / ERP foundation** over mig-068: every money event → numbered document; central `tax_treatment` (line×customer→vat/wht); void = reissue chain; 3 reconciliation loops; branch- + customer-type-aware | designed **with T3** | Case-1 **A8/A9** (no sale receipt/tax invoice), Case-2 **B5/W8** (no online BDC, RBK ฿0), Case-3 no-docs, B6 walk (BDC issuance) | §c, §d |
| **T5** | POS V3 sale + fiscal docs; retire v1 (public-bucket hygiene) | T4 | POS-V3 deep audit (`2026-07-09-pos-v3-deep-audit.md`); POS v1 public-bucket slip hygiene | 2026-07-09 §3 (V3-only) |
| **T6** | Cross-surface consistency + status visibility | — (parallelizable) | Case-1 **A7** (tracking on list not detail), Case-1 **#5** (no under-review/rejected signal), Case-2 **B2** (deposit-unpaid badge), **B3/G5** (end-date incl/excl), **W5** (no work queues), Case-3 **W3/W1** (no unified transaction view), **W7** (request stays pending_review) | — |
| **T7** | Glossary / i18n / money-copy | — (parallelizable) | Case-1 **M2** + Case-2 **W2** (template wording leaks), bare มัดจำ (Case-1/2/3 W1), Case-2 **W3** (raw enum), 2026-07-09 §4 (POS V3 Thai) | 2026-07-07 glossary; 2026-07-09 §4 |
| **T8** | Accounting-office export pack — **end goal** (VAT register, WHT register, deposit-liability ledger, cash reconciliation) | T4 | §c reconciliation loops; BACKLOG "Accounting-office export pack" | §c |

## Dependency notes
- **T2 after T1** — T1a satisfied at `75084ed` (B6 422 gate cleared): **T2 unblocked for scheduling**. T1b remains open (juristic self-serve + kyc_status mirror retirement + display unification, per BACKLOG).
- **T3 deposit-refund completeness depends on T2** — refund releases a held deposit; the release/settlement machinery must exist first.
- **T4 void chain designed together with T3** — cancel/void must emit the correcting document in the same design pass (void = reissue, never edit).
- **T5/T8 depend on T4** (fiscal docs and export registers ride the document/tax foundation).
- **T6/T7 are parallelizable** — no money/schema dependency; fold fixes into whichever flow re-walks that surface.

## Cross-cutting / infra (not a delivery flow — fold into the touching track)
Dev-default-targets-REMOTE invert (safety) · RLS hardening bundle (mig-070 draft-insert + confirmBooking dead path + legacy upsert) · empty-string `<USelect>` sites · stale-`finalizing` POS sweep/alert · baht-vs-satang decision audit (auditor-owned) · PDPA retention/purge (vs mig-118 delete blocks).
