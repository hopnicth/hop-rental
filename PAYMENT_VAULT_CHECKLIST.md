# Payment — Saved Cards & Billing Addresses (Research + Checklist)

Last updated: 2026-05-07

Status: **research / not implemented yet.** Use this file to track scope before
opening the implementation PR. Promote completed items into
`PAYMENT_DECISIONS.md → Approved`.

---

## A) Saved cards (Omise vault)

### Best-practice rules (from Omise + PCI SAQ A v4.0.1)

- Tokens are **single-use**. To reuse a card, attach the token to a Customer
  object and store only the returned **Customer ID + Card ID** server-side.
- Never POST raw PAN / CVV through our backend. Frontend tokenizes via
  `omise.js` only — keeps us inside SAQ A scope.
- Show only `brand`, `last4`, `expiration_month/year`, `name`. Never store or
  log the full PAN, even temporarily.
- 3DS still applies on every charge for THB issuers — saved card = no re-entry,
  not "no challenge".
- Default-card concept exists in Omise; mirror it locally (`is_default`).

### Schema additions

```sql
-- 051_saved_cards.sql (planned)
ALTER TABLE public.users
  ADD COLUMN omise_customer_id TEXT UNIQUE;

CREATE TABLE public.user_payment_methods (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gateway            TEXT NOT NULL DEFAULT 'omise',
  gateway_customer_id TEXT NOT NULL,
  gateway_card_id    TEXT NOT NULL,
  brand              TEXT NOT NULL,
  last4              TEXT NOT NULL,
  expiration_month   INTEGER NOT NULL,
  expiration_year    INTEGER NOT NULL,
  cardholder_name    TEXT,
  fingerprint        TEXT,
  is_default         BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (gateway, gateway_card_id)
);
-- + RLS: owner-only SELECT/INSERT/DELETE; UPDATE limited to is_default.
-- + trigger ensure_single_default_card per user.
```

### Server endpoints (new)

- `POST /api/payments/cards` — body `{ token, makeDefault? }` →
  ensure customer (create if `users.omise_customer_id IS NULL`, else attach
  card), insert `user_payment_methods` row.
- `GET  /api/payments/cards` — list non-deleted cards for current user.
- `DELETE /api/payments/cards/:id` — soft-delete locally + DELETE on Omise
  (`/customers/:cust/cards/:card`).
- `PATCH /api/payments/cards/:id/default` — flip default flag (trigger
  enforces single default).
- Extend `POST /api/payments/initiate` to accept either `token` (one-shot) or
  `paymentMethodId` (vaulted). When `paymentMethodId`, build the charge with
  `customer + card` instead of `card` token.

### `server/utils/omise.ts` additions

- `createOmiseCustomer({ email, description, card? })`
- `attachCardToCustomer(customerId, token)`
- `deleteCustomerCard(customerId, cardId)`
- `setCustomerDefaultCard(customerId, cardId)`
- `createOmiseCardChargeWithCustomer({ amount, currency, customer, card, return_uri, capture: true })`

### Frontend UX

- "Save this card for next time" checkbox on `/payment/[orderId]` (only when
  user is logged in, default off).
- New `/user/payment-methods` page: list cards, delete, set default. Reuses
  card-brand icons already in payment page.
- On `/payment/[orderId]`, show "Use saved card" selector above the form when
  `cards.length > 0`. Selecting one hides the new-card form and submits with
  `{ paymentMethodId }`.

### Edge cases / rejection criteria

- Token already used → Omise rejects on attach; surface localized error.
- Card expiry month/year passed → server filters out expired cards from list
  before showing.
- `fingerprint` collision → silently de-dup at insert (don't error).

---

## B) Billing addresses (Thai tax-invoice ready)

### What we already have

- `public.addresses` — single flat delivery-address table (no kind).
- `public.orders.address_id` + `address_snapshot` (JSONB).
- `public.companies.tax_id` + `companies.billing_address` (JSONB).

### Gap analysis vs Thai full tax invoice (Section 86/4 RC)

Required on tax invoice but not in the personal `addresses` schema:

- Tax payer ID (TIN / Citizen ID, 13 digits).
- Branch identifier (`สำนักงานใหญ่` / `สาขาที่ 0001`) — required for VAT-registered B2B.
- Legal entity name vs trade name (when buyer = juristic person).
- Explicit "billing" vs "shipping" classification.

### Schema additions

```sql
-- 052_billing_addresses.sql (planned)
CREATE TYPE address_kind AS ENUM ('shipping', 'billing', 'both');

ALTER TABLE public.addresses
  ADD COLUMN kind            address_kind NOT NULL DEFAULT 'shipping',
  ADD COLUMN tax_payer_id    TEXT,         -- 13-digit TIN / Citizen ID
  ADD COLUMN tax_branch_code TEXT,         -- '00000' for HQ
  ADD COLUMN legal_name      TEXT,         -- juristic person name on tax invoice
  ADD COLUMN is_juristic     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN billing_address_id       UUID REFERENCES public.addresses(id),
  ADD COLUMN billing_address_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN tax_invoice_requested    BOOLEAN NOT NULL DEFAULT false;

-- Constraints
ALTER TABLE public.addresses
  ADD CONSTRAINT tin_format
    CHECK (tax_payer_id IS NULL OR tax_payer_id ~ '^[0-9]{13}$');
```

### Frontend UX

- `/user/addresses`: add **"ใช้สำหรับ"** selector (Shipping / Billing / Both),
  plus conditional fields when Billing/Both: `tax_payer_id`, `tax_branch_code`,
  `legal_name`, `is_juristic`. Validate TIN client-side (mod-11 checksum).
- Cart / checkout: separate **"ที่อยู่จัดส่ง"** and **"ที่อยู่ใบกำกับภาษี"**
  pickers. "Same as shipping" checkbox copies the address.
- "ขอใบกำกับภาษีเต็มรูป" toggle on cart → sets `tax_invoice_requested`.

### Server endpoints

- Extend `POST /api/orders` to accept `billing_address_id` + freeze
  `billing_address_snapshot` like `address_snapshot`.
- Filter address lists by `kind` query param on `/api/addresses`.

### Edge cases

- B2B users on company credit must always supply a billing address with
  `tax_payer_id` (already on `companies.tax_id` — copy at order creation).
- A user can mark exactly one billing as default (extend
  `ensure_single_default_address` to be `(user_id, kind)`-scoped).

---

## Done-when

- [ ] Migration 051 + 052 applied locally.
- [ ] Saved-cards endpoints + UI shipped behind a soft feature flag.
- [ ] Billing-address split + tax invoice fields shipped.
- [ ] `PAYMENT_DECISIONS.md` updated with the new approved behaviour.
- [ ] Manual test matrix run: new card, saved card, delete card, expired card,
      tax-invoice-requested order with billing ≠ shipping.
