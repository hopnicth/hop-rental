# Payment Flow — Approved Decisions

Single source of truth for what the user (product owner) has **approved** in the
Omise payment integration. **Do not silently change items in the "Approved"
section.** If a refactor would alter approved behaviour, ask first.

Format: each decision lists the file(s) it touches so future edits know what to
preserve.

---

## ✅ Approved (do not revert / overwrite without asking)

### Gateway constraints

- **Minimum charge: 20 THB** (Omise gateway limit). Cart shows a localized
  notice and disables the pay button below this threshold.
  - `app/pages/user/cart.vue` — client-side guard + `minimumChargeNotice`
  - `server/api/payments/initiate.post.ts` — server-side reject
  - i18n: `minimumChargeTitle` / `Desc` / `Notice` in `en/th/cn/jp.json`

### PromptPay

- **QR expiry = 3 minutes** (180s). Local countdown matches the value sent to
  Omise via `expires_at`.
  - `server/api/payments/initiate.post.ts`
  - `server/utils/omise.ts` — `createOmisePromptPayCharge({ expiresAt })`

### Cancellation

- **User-initiated cancel** is supported and returns the user to `/user/cart`
  with cart contents preserved (cart is only cleared on `paymentStatus === "paid"`).
  - `server/api/payments/cancel.post.ts` — marks order/attempts cancelled,
    best-effort expires Omise charge, records `user_cancelled` alert
  - `server/utils/omise.ts` — `expireOmiseCharge()`
  - `app/pages/payment/[orderId].vue` — Cancel button + `handleCancel()`

### Cart persistence

- **Cart is NOT cleared on payment failure / cancel.** Only cleared on
  `paymentStatus === "paid"`.
- Three cart-clearing call sites cover the polling, 3DS-redirect, and webhook
  flows. **All three are required** — removing any one will leave items in
  the buyer's cart on at least one path.
  1. **Server-side (authoritative).** `server/utils/payments.ts` →
     `clearUserCartAfterPayment()` runs inside `applyGatewayResult()` on
     the `pending → paid` transition. Deletes `cart_items` for the buyer's
     `carts.id` and bumps `carts.updated_at`. Best-effort: failures are
     swallowed so they never break the payment.
  2. **3DS-redirect path.** `app/pages/payment/result.vue` →
     `clearCartIfPaidOnce()` calls `clearCartPersisted()` once status is
     `paid`. Awaits Supabase session hydration (up to 3 s) via
     `waitForSessionHydrated()` before clearing — required because
     `user.value` is briefly null right after the Omise return URL.
  3. **In-page polling path.** `app/pages/payment/[orderId].vue` →
     `goToResult()` calls `clearCartPersisted()` before navigating away.
- The result page polls status every **2 s for up to 60 s** if the order
  is not yet terminal on landing.

### Cart hydration reconciliation

- `app/composables/useCart.ts` → `hydrateCart()` reconciliation **trusts the
  DB whenever `dbData.updatedAt >= localCart.updatedAt`, even if the DB items
  array is empty.** This is what makes the server-side cart clear stick:
  without it, stale localStorage from before the payment would re-upload the
  cleared items back into the DB on the next page load.
- The previous, buggy condition required `hasDbItems` for the timestamp
  comparison to win, which silently rolled back server-side clears.

### Post-payment stock deduction

- **Inventory is deducted server-side when an order transitions to `paid`.**
  Implemented as a Postgres RPC for atomicity + idempotency.
  - Migration: `supabase/migrations/050_payment_inventory_hook.sql`
    - Adds `orders.inventory_applied_at TIMESTAMPTZ`
    - Adds RPC `public.f_apply_order_inventory(p_order_id UUID)` which
      deducts from `sku_branch_inventory` rows where
      `inventory_kind IN ('sale', 'shared')` in FIFO order, then refreshes
      the `product_skus.stock` summary via `sync_product_sku_inventory_summary`.
  - Caller: `server/utils/payments.ts` → `applyOrderInventory()` invoked
    from `applyGatewayResult()` immediately after flipping the order to
    `paid`. RPC failure is logged as an `inventory_apply_failed` alert
    (audience `admin`, severity `critical`) but does **not** roll back the
    payment.
- **Idempotency:** the RPC short-circuits with `RETURN FALSE` when
  `inventory_applied_at IS NOT NULL`, so it is safe to call from both the
  webhook path and the synchronous initiate/poll paths.
- **⚠ Operator note:** migration `050_payment_inventory_hook.sql` must be
  applied to every environment. If `f_apply_order_inventory` is missing the
  RPC call returns an error that is recorded as an alert but stock will not
  decrement. Re-running the migration is safe (uses `IF NOT EXISTS` /
  `CREATE OR REPLACE`).

### Admin payment alerts UI

- **Audience split.** `payment_alerts.audience = 'user'` is shown in the
  user payment screens; `audience = 'admin'` is the admin queue. Server
  policies in `supabase/migrations/051_payment_alerts_resolution.sql` add
  SELECT/UPDATE for platform admins (`staff` + `super_admin`); the existing
  user policy is untouched.
- **Lifecycle.** New columns `payment_alerts.resolved_at` and `resolved_by`
  define the open → resolved transition. NULL `resolved_at` = open.
- **Realtime.** The admin alerts feed subscribes to Supabase realtime
  (`postgres_changes` on `public.payment_alerts`). Migration 051 adds the
  table to `supabase_realtime` publication idempotently. Both the admin
  layout (badge) and the alerts page share one channel via the singleton
  composable `useAdminPaymentAlerts`.
- **Endpoints.**
  - `GET /api/admin/payment-alerts` — list with `resolved`/`severity`/`kind`
    filters and `unresolvedTotal` for badge counts.
  - `POST /api/admin/payment-alerts/:id/resolve` — manual resolve.
  - `POST /api/admin/orders/:id/apply-inventory` — staff/super_admin only,
    re-runs `f_apply_order_inventory` then auto-resolves
    `inventory_apply_failed` alerts on the order.
- **Auto-resolve on tracking save.** When the admin order PATCH receives
  any of `trackingCarrier` / `trackingNumber` / `trackingNote`, every open
  admin alert on the order is marked resolved (`resolved_by = current
admin`). Rationale: a tracked shipment implies the underlying issue was
  handled out-of-band (manual stock adjustment, refund, etc.).
- **Order detail page.** `/admin/orders/[id]` renders an "Action required"
  card above the customer/address grid. The card shows
  `Apply inventory now` whenever an `inventory_apply_failed` alert is open,
  and per-row `Mark resolved`. For paid-but-unshipped orders without
  alerts, a softer "Inventory" card still exposes the manual retry button.
- **Permissions.** Both the page-level `platformRoles` middleware and the
  server-side `requirePlatformAdmin` enforce staff/super_admin access on
  every alert endpoint and the apply-inventory endpoint.

### Localized cart alerts (4 languages: en / th / cn / jp)

- `noSaleItemsTitle/Desc`
- `pickupBranchRequiredTitle/Desc`
- `deliveryAddressRequiredTitle/Desc`
- `companyCreditUnavailableTitle/Desc`
- `minimumChargeTitle/Desc/Notice`

### Credit card input UX (`app/pages/payment/[orderId].vue`)

- **Brand-aware length cap.** `detectCardBrand(digits)` returns
  `{ brand, maxDigits, gaps }` based on BIN/IIN. Per-brand caps:
  - Amex (34/37) → 15 digits, gap pattern `4-6-5`
  - Diners (300–305 / 36 / 38 / 39) → 14 digits, gap `4-6-4`
  - Mastercard (51–55 / 22–27) → 16 digits, gap `4-4-4-4`
  - Visa (4) → up to 19 digits, gap `4-4-4-4-3`
  - JCB (35) / Discover (6011 / 65 / 644-649 / 622) / UnionPay (62 / 81)
    → up to 19 digits, gap `4-4-4-4-3`
  - Unknown → fallback 19 digits, `4-4-4-4-3`
- **Card-number auto-formats** as user types using the brand's gap pattern.
  Watcher uses `formatted !== val` guard to avoid re-entrancy.
- **Input `:maxlength`** is bound to the `cardMaxLength` computed
  (= `maxDigits + applicable gaps`). The input physically refuses extra
  characters once the brand cap is reached.
- **Luhn (mod-10) validation** runs in `handleCardSubmit` before tokenization;
  on failure shows the localized `invalidCard` error.
- **Expiry auto-inserts `/`** after the 2nd digit (typing `0131` → `01/31`).
  Implemented via `formatExpiry()` + `watch`. Input `:maxlength="5"`.
- CVC input `:maxlength="4"`.

### Idempotency

- `idempotencyKey` is `randomUUID` per page load; rotated on PromptPay retry.

### Theme

- Primary color: `#f1b323` (defined in `app/assets/css/main.css` as
  `--ui-primary`).

### Processing UI

- **Full-screen overlay** during empty waiting periods. Overlay = white
  translucent backdrop (`rgba(255,255,255,0.94)`) + custom CSS loader with
  strokes coloured `var(--ui-primary, #f1b323)`.
- Used by:
  - `/payment/[orderId]` while `submitting === true` (card submit / retry init)
  - `/payment/result` during the initial status fetch (`loading === true`)
- PromptPay QR block does **not** show the loader internally — it shows the
  QR + countdown + pending text only.
- **Shared CSS** lives in `app/assets/css/main.css` under classes
  `.payment-overlay`, `.payment-overlay__label`, `.payment-loader`, and
  transition `.payment-fade-*`. **Do not duplicate these styles** in scoped
  blocks of the payment pages.

---

## 🟡 Pending / under discussion

_(Add items here when the user is iterating; promote to Approved once they
confirm.)_

- **Saved cards (Omise vault).** Research + schema + endpoint plan in
  `PAYMENT_VAULT_CHECKLIST.md` § A. Not yet implemented.
- **Billing addresses + Thai tax invoice fields.** Research + schema plan in
  `PAYMENT_VAULT_CHECKLIST.md` § B. Not yet implemented.

---

## ❌ Rejected / rolled back

_(Items the user explicitly rejected — do not re-introduce.)_

- Embedding the loader CSS card **inside** the PromptPay QR area (it
  collided with the cancel button layout).
- Replacing the credit-card form with the loader card in-place (preferred:
  full-screen overlay).

---

## How to keep this file accurate

When the agent is asked to change something here:

1. If it touches an **Approved** item, surface that to the user and confirm
   before editing.
2. After confirmation, update this file in the **same commit/edit batch** as
   the code change.
3. If a feature is rolled back by the user, move it to **Rejected** with a
   one-line reason.
