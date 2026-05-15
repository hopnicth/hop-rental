# Customer Cancellation / Booking Deposit Refund Handoff

Last updated: 2026-05-14
Audience: future Augment/AI sessions
Scope: status handoff only — do not treat this as a feature prompt.

## Current flow status

- Eligible customer self-service cancellation is implemented for confirmed/paid rental bookings before the locked refund cutoff.
- Customer cancellation creates a cancellation event and a `payment_refunds` Booking Deposit refund request.
- Admin manages manual refunds from `/admin/refunds`.
- Admin can move refund status through pending review, processing, needs customer contact, refunded, and failed.
- Admin refund proof upload is working end-to-end.
- Customer-facing refund proof access works through customer-safe signed/access routes.
- Refund confirmation document remains gated until the refund is marked refunded and proof is linked.
- Cancelled rental history appears through `/user/orders`; active rentals remain in `/user/rentals`.
- No-show is now a separate admin-managed lifecycle: staff manually mark overdue confirmed pickup bookings as `no_show`, with Booking Deposit recorded as forfeited/refund-not-applicable and no refund row created.

## Recently completed batch

- Customer refund bank account input UX: displayed value and submitted model are digits-only.
- Backend validation remains source of truth: account number must normalize to 6-25 digits.
- Admin refund queue UI polish: shorter subtitle, segmented status filters, and per-status counts.
- Admin unresolved refund work badge: counts pending admin review + processing + needs customer contact.
- API/docs status sync completed for customer cancellation/refund endpoints and admin refund endpoints.
- No-show Lifecycle Foundation completed: `no_show` status, admin mark-no-show endpoint, no-show event/metadata, minimal admin/customer visibility, and availability release through status exclusion.

## Confirmed smoke / validation

- Browser smoke passed: admin uploads refund proof successfully.
- Browser smoke passed: uploaded proof appears in admin refund detail.
- Browser smoke passed: customer can open/view refund proof successfully.
- Customer bank-account input follow-up is ready for manual retry; source guards and tests pass.
- Focused tests passed:
  - `tests/server/customer-rental-booking-detail.spec.ts`
  - `tests/server/rental-booking-cancellation.spec.ts`
  - `tests/server/admin-refunds.spec.ts`
  - `tests/server/admin-order-queue.spec.ts`
- Production build completed and generated `.output/server/index.mjs`.
- Existing build warnings are unrelated/pre-existing unless proven otherwise.

## Important endpoints

- `GET /api/user/rental-bookings/[id]`
- `POST /api/user/rental-bookings/[id]/cancel`
- `POST /api/user/rental-bookings/[id]/documents/[documentType]`
- `GET /api/user/documents/[id]`
- `GET /api/user/rental-bookings/[id]/refund-proof`
- `POST /api/user/rental-bookings/refund-proof-status`
- `POST /api/user/rental-bookings/refund-tracking-status`
- `GET /api/admin/refunds?status&limit`
- `GET /api/admin/refunds/summary`
- `GET /api/admin/refunds/[id]`
- `POST /api/admin/refunds/[id]/start-processing`
- `POST /api/admin/refunds/[id]/needs-customer-contact`
- `POST /api/admin/refunds/[id]/proof`
- `POST /api/admin/refunds/[id]/mark-refunded`
- `POST /api/admin/refunds/[id]/mark-failed`
- `POST /api/admin/rental-bookings/[id]/mark-no-show`

## Do not change without explicit approval

- Do not implement POS V2.
- Do not implement official receipt/tax invoice documents in this phase.
- Do not weaken backend cancellation/refund validation.
- Do not change refund status names or transition semantics casually.
- Do not expose raw storage bucket/path metadata to customers.
- Do not remove refund confirmation proof gating.
- Do not infer late-cancellation behavior from the eligible self-service flow; no-show is separate and admin-managed only.

## Next recommended follow-up

Review the no-show foundation in browser/admin ops, then decide late-cancellation policy separately.

Suggested audit questions:

1. Should late customer cancellation after cutoff remain support-only, or become a separate recorded non-refundable cancellation lifecycle?
2. Should no-show candidates also surface in an admin dashboard/overdue pickup queue beyond rental booking detail?
3. Should staff be allowed to undo `no_show`, and if yes what audit/deposit reversal rules are required?
4. What additional Thai customer/admin wording is required after ops review?

Do not start POS V2 or late-cancellation implementation until those decisions are reviewed.
