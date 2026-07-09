# POS V3 Deep Audit

- **Date:** 2026-07-09
- **Scope:** READ-ONLY audit of `/admin/pos-v3` and everything it transitively uses. No files were modified; this document is the only file created. No commits, no pushes, no fixes applied — all issues recorded as FINDINGS only.
- **Context:** POS V3 is the only track going forward (v1 retires once V3 is feature-complete). V3 target: sale + fiscal documents + KYC + return, on a single iPad, simple enough for front-desk staff. Builds on `docs/audit/2026-07-08-launch-readiness-audit.md`.
- **Evidence convention:** every claim cites file:line or actual grep/test output. Items that could not be fully verified are collected in the final "low-confidence" list.

---

## P1 — Surface Inventory

### P1.1 V3 surface files

**Route/page (1):**

| File | Lines | Notes |
|---|---|---|
| `app/pages/admin/pos-v3/index.vue` | 952 | Only V3 page. `definePageMeta` layout=admin, middleware=role, roles staff/super_admin (`index.vue:25-29`) |

**Components (9 direct + 5 transitive):**

| File | Lines | Imported by |
|---|---|---|
| `app/components/admin/pos/AdminPosV3ModeNav.vue` | 60 | page (`index.vue:2`) |
| `app/components/admin/pos/AdminPosV3ResolverPanel.vue` | 118 | page (`index.vue:3`) |
| `app/components/admin/pos/AdminPosV3PendingWorkList.vue` | 96 | page (`index.vue:4`) |
| `app/components/admin/pos/AdminPosV3BookingContext.vue` | 132 | page (`index.vue:5`) |
| `app/components/admin/pos/AdminPosV3OrderContext.vue` | 82 | page (`index.vue:6`) |
| `app/components/admin/pos/AdminPosV3FutureBookingDraftContainer.vue` | 763 | page (`index.vue:7`) |
| `app/components/admin/pos/AdminPosV3FutureBookingDepositCashContainer.vue` | 571 | page (`index.vue:8`) |
| `app/components/admin/pos/AdminPosV3FutureBookingDepositQrContainer.vue` | 601 | page (`index.vue:9`) |
| `app/components/admin/pos/AdminPosV3PickupContainer.vue` | 543 | page (`index.vue:10`) |
| `app/components/admin/pos/AdminPosV3PickupDepositQrCard.vue` | 378 | PickupContainer (`AdminPosV3PickupContainer.vue:5`) |
| `app/components/admin/AdminOrderQrScanner.vue` | 316 | ResolverPanel (`AdminPosV3ResolverPanel.vue:2`) |
| `app/components/admin/AdminBookingChecklists.vue` | 528 | PickupContainer (`AdminPosV3PickupContainer.vue:3`) |
| `app/components/admin/DigitalSignaturePad.vue` | 107 | PickupContainer (`AdminPosV3PickupContainer.vue:4`) |
| `app/components/products/RentalBookingCalendar.vue` | 701 | DraftContainer, auto-imported as `ProductsRentalBookingCalendar` (`AdminPosV3FutureBookingDraftContainer.vue:660`) |

The other `AdminPos*` files in `app/components/admin/pos/` (AdminPosHeader/QueueCards/QuickLookup/ScanPanel/Shell/Sidebar) are NOT referenced by pos-v3 — they belong to POS v1/v2.

**Composables / stores / utils:**

| File | Lines | Used where |
|---|---|---|
| `app/utils/pos-qr-session-restore.ts` | 129 | page (`index.vue:11`, onMounted `:641`) + QR container (`QR_SESSION_BUFFER_KEY`, `AdminPosV3FutureBookingDepositQrContainer.vue:2`) |
| `app/utils/rental-payment-lines.ts` | 331 | page (`calculateBookingDepositDueNow`, `index.vue:12, 407`) |
| `app/composables/useBooking.ts` | 1244 | transitive — `RentalBookingCalendar.vue:112` |
| `app/composables/useUserProfile.ts` | 218 | transitive — `RentalBookingCalendar.vue:113` |
| Nuxt built-ins | — | `useRoute` (`index.vue:92`), `useRouter` (`index.vue:160`), `useToast` (`AdminBookingChecklists.vue:25`, `RentalBookingCalendar.vue:110`), `useRuntimeConfig` (`RentalBookingCalendar.vue:111`), `useFetch("/api/contact-settings")` (`RentalBookingCalendar.vue:115`) |

**No Pinia stores exist anywhere in the app** — `grep -rn "defineStore" app --include="*.ts"` → zero hits. All V3 state is component-local refs.

### P1.2 Interactive-element classification

Legend: **WIRED** = real handler reaching a real backend endpoint · **DEAD** = UI exists but does nothing / gated mode never renders · **MISSING** = capability the V3 target needs with no UI at all.

| Element (file:line) | Label / purpose | State | Evidence |
|---|---|---|---|
| Mode button "Booking" (`AdminPosV3ModeNav.vue:41-58`) | switch activeMode=booking | WIRED (UI gate) | all containers gated `activeMode === 'booking'` (`index.vue:773, 790, 807, 880, 932, 944`) |
| Mode button "ขายขาด" (sale) (`ModeNav.vue:41-58`, def `:19-23`) | sale mode | **DEAD** | no template branch anywhere tests `activeMode === 'sale'` — grep shows only `'booking'` gates. Selecting it just hides booking containers. Helper text admits it: "Walk-in product purchase entry point for later phases." (`ModeNav.vue:21`) |
| Mode button "KYC" (`ModeNav.vue:41-58`, def `:31-35`) | KYC mode | **DEAD** | no `activeMode === 'kyc'` gate exists; helper: "Customer registration and identity work will plug in later." (`ModeNav.vue:33`) |
| "Scan QR" button (`AdminPosV3ResolverPanel.vue:47-49`) | open camera modal | WIRED (UI) | opens AdminOrderQrScanner modal (`ResolverPanel.vue:112-117`); decode → `handleScannerDecoded` (`index.vue:529`) |
| Scanner decode → kind `booking` (`index.vue:535-538`) | resolve booking | WIRED | → `loadBookingContext` → GET `/api/admin/rental-bookings/[id]` (`index.vue:361-363`) |
| Scanner decode → kind `customer` UUID (`index.vue:539-543`) | resolve user | WIRED | → `loadUserPendingWork` → GET `/api/admin/customers/lookup` + `/api/admin/orders/queue` (`index.vue:451-458`) |
| Scanner decode → customer phone (non-UUID) (`index.vue:544-551`) | phone lookup | **DEAD** (explicit) | warning: "Customer phone QR is not supported yet … belongs to a later KYC phase." (`index.vue:547-550`) |
| Scanner decode → kinds `order`/`asset`/`sku`/`product`/`barcode` (`index.vue:553-558`) | other payloads | **DEAD** | scanner parses 8 kinds (`AdminOrderQrScanner.vue:103-118`) but page falls through to "Unsupported POS V3 payload" warning |
| Booking resolver input + search (`ResolverPanel.vue:60-71`) | manual booking lookup | WIRED | emits `resolveBooking` → GET `/api/admin/rental-bookings/[id]` |
| User resolver input + search (`ResolverPanel.vue:80-91`) | manual user lookup | WIRED | emits `resolveUser` → `loadUserPendingWork` (`index.vue:434`) |
| Pending-work item button (`AdminPosV3PendingWorkList.vue:70-93`) | open booking/order context | WIRED | `handlePendingSelect` (`index.vue:519-527`) → booking detail GET or order GET `/api/admin/orders/[id]` (`index.vue:507-509`) |
| "Open existing booking detail" (`AdminPosV3BookingContext.vue:123-129`) | nav to `/admin/rental-bookings/[id]` | WIRED (nav) | page exists: `app/pages/admin/rental-bookings/[id]/` |
| "Open existing order detail" (`AdminPosV3OrderContext.vue:78-80`) | nav to `/admin/orders/[id]` | WIRED (nav) | order fulfillment explicitly not here: "Phase 1 handoff only … intentionally not implemented" (`OrderContext.vue:72-77`) |
| Branch `<select>` (`DraftContainer.vue:487-501`) | choose POS branch | WIRED | options from GET `/api/admin/pos/branches` (`DraftContainer.vue:262-264`) |
| Customer mode toggle account/walk-in (`DraftContainer.vue:513-538`) | toggle | WIRED (local) | drives draft/same-day payload (`DraftContainer.vue:303-320, 338-341`) |
| Walk-in phone/name inputs (`DraftContainer.vue:560-574`) | walk-in identity | WIRED | required by `canSubmit` (`DraftContainer.vue:240`) |
| Asset search input + button (`DraftContainer.vue:584-596`) | search rental assets | WIRED | GET `/api/admin/pos/catalog?mode=rental` (`DraftContainer.vue:279-288`) |
| Asset select card (`DraftContainer.vue:599-635`) | select asset | WIRED | triggers GET `/api/admin/pos/booking-blocks` (watch `:200-205` → `:170-197`) |
| RentalBookingCalendar (`DraftContainer.vue:660-678`) | pick dates/pricing | WIRED | emits `calendarPayload`; blocking data from booking-blocks; also GET `/api/contact-settings` (`RentalBookingCalendar.vue:115-116`) |
| Submit "Create Future Booking Draft" (`DraftContainer.vue:741-760`) | create draft | WIRED | POST `/api/admin/pos-v3/rental-bookings/drafts` (`DraftContainer.vue:328-344`) |
| Same button, same-day date | create confirmed same-day booking | WIRED | emits intent → page POST `/api/admin/pos-v3/rental-bookings/same-day` (`index.vue:148-154`) |
| "Create another booking" (`DraftContainer.vue:472-474`) | reset form | WIRED (local) | `resetForm` (`DraftContainer.vue:365-374`) |
| Payment method "เงินสด" (`index.vue:895-909`) | pick cash | WIRED (gate) | mounts CashContainer (`index.vue:930-938`) |
| Payment method "PromptPay QR" (`index.vue:910-924`) | pick QR | WIRED (gate) | mounts QrContainer (`index.vue:942-950`); selection locked once chosen (`index.vue:224-227`) |
| Cash tendered input (`CashContainer.vue:514-524`) | cashier amount | WIRED (local) | change calc only; backend always gets `bookingDepositDueNow` (`CashContainer.vue:158-166`) |
| "รับเงินและยืนยันการจอง" (`CashContainer.vue:560-568`) | cash deposit finalize | WIRED | POST `…/[bookingId]/booking-deposit-payments` (`CashContainer.vue:158-167`) |
| Print BDC doc (`CashContainer.vue:277-284`) | print deposit confirmation | WIRED (nav) | `window.open('/admin/documents/[id]/print…')` (`CashContainer.vue:193-202`); page exists |
| "ดูรายละเอียดการจอง" (`CashContainer.vue:307-314`) | nav on doc-failed | WIRED (nav) | link to booking detail |
| QR auto-create + "สร้าง QR ใหม่" (`QrContainer.vue:590-598`) | create/regenerate QR | WIRED | POST `…/booking-deposit-qr` (`QrContainer.vue:229-238`); 409 resume via GET `…/booking-deposit-qr/active` (`:279-298`) |
| QR 3s poller (`QrContainer.vue:153-160`) | poll payment status | WIRED | POST `…/booking-deposit-qr/poll` (`QrContainer.vue:300-325`) |
| Print BDC (`QrContainer.vue:554-561`) / booking-detail link (`:571-578`) | print/nav | WIRED (nav) | same print route |
| Pickup "ดูรายละเอียดและพิมพ์ใบส่งมอบ" (`PickupContainer.vue:234-241`) | print pickup form | WIRED (nav) | `/admin/rental-bookings/[id]/print?type=pickup` — page exists |
| Tender selector Cash / QR (`PickupContainer.vue:333-346`) | deposit tender choice | WIRED (local) | gates cash form vs QR card |
| Cash received input (`PickupContainer.vue:358-363`) | deposit cash | WIRED (local) | gates `canCollectDeposit` (`PickupContainer.vue:91-96`) |
| "ยืนยันรับมัดจำประกัน" (`PickupContainer.vue:393-400`) | collect remaining security deposit (cash) | WIRED | POST `…/remaining-security-deposit-payments` (`PickupContainer.vue:139-149`) |
| "เปลี่ยนวิธีชำระ" (`PickupContainer.vue:386-391, 414-421`) | reset tender choice | WIRED (local) | sets `depositTenderMethod = null` |
| Pickup QR card auto-create/regenerate (`PickupDepositQrCard.vue:362-375`) | remaining deposit via QR | WIRED | POST `…/remaining-security-deposit-qr` (`:147-153`), poll (`:205-210`), active resume (`:183-187`) |
| Checklist create/complete/delete/item/photo (`AdminBookingChecklists.vue:95-168`) | pickup checklist ops | WIRED | POST/PATCH/DELETE `/api/admin/rental-bookings/[id]/checklists…` + photo upload (`:101, 117, 127-135, 141, 152, 165`) |
| DigitalSignaturePad + clear (`DigitalSignaturePad.vue:97-103`) | capture customer signature | WIRED (local) | dataURL sent with pickup submit |
| "ยืนยันรับอุปกรณ์" Confirm Pickup (`PickupContainer.vue:531-539`) | confirm pickup | WIRED | POST `/api/admin/rental-bookings/[id]/pickup` (`PickupContainer.vue:175-184`); gated on completed checklist + signature + zero pickup due (`:125-132`) |
| **Sale checkout in V3** | walk-in product sale | **MISSING** | Sale mode renders nothing. Backend exists only in v1 namespace (`server/api/admin/pos/sales.post.ts`) with zero V3 UI. Phase-1 alert admits scope: "Completion, sale checkout, KYC, and fiscal workflows are not implemented here." (`index.vue:696-701`) |
| **KYC capture/verification UI** | ID capture, verify/revoke | **MISSING** | KYC mode renders nothing; only a read-only `KYC: {status}` badge (`AdminPosV3PendingWorkList.vue:45-47`). Endpoints exist elsewhere but no V3 caller |
| **Return / settlement flow** | return, rental-fee settlement, deposit refund | **MISSING** | `picked_up` bookings show "Return path will plug in later." (`AdminPosV3BookingContext.vue:34-35`); `server/api/admin/rental-bookings/[id]/return.post.ts` exists with no V3 caller; rental fee explicitly "deferred to return / settlement" (`PickupContainer.vue:57-59, 253-254`) |
| **Fiscal docs beyond BDC** (receipt / tax invoice) | fiscal documents | **MISSING** | only Booking-Deposit-Confirmation print exists in V3; Phase-1 alert (`index.vue:700`) excludes "fiscal workflows"; OrderContext excludes "document workflows" (`OrderContext.vue:76`) |

### P1.3 Endpoint inventory (every `$fetch`/`useFetch` across V3 files)

| Endpoint | Server file | Purpose | Auth guard |
|---|---|---|---|
| GET `/api/admin/rental-bookings/[id]` | `server/api/admin/rental-bookings/[id].get.ts` | booking detail (context resolution + QR restore) | `requirePlatformAdmin` (`:16`) |
| GET `/api/admin/rental-bookings/[id]/ops` | `…/[id]/ops.get.ts` | checklists + templates payload | `requirePlatformAdmin` (`:8`) |
| POST `/api/admin/rental-bookings/[id]/pickup` | `…/[id]/pickup.post.ts` | confirm pickup via `completeRentalBookingFulfillment` (KYC gate inside `server/utils/rental-fulfillment.ts`) | `requirePlatformAdmin` (`:9`) |
| POST/PATCH/DELETE `…/[id]/checklists…` (+items, photo) | `…/[id]/checklists/*` | checklist CRUD + item check + photo upload | `requirePlatformAdmin` (`index.post.ts:24`, `[checklistId].patch.ts:19`, `.delete.ts:11`, items patch `:19`, `photo.post.ts:27`) |
| GET `/api/admin/customers/lookup?userId=` | `server/api/admin/customers/lookup.get.ts` | customer profile + their rental bookings | `requirePlatformAdmin` (`:44`) |
| GET `/api/admin/orders/queue?queue=pickup&search=` | `server/api/admin/orders/queue.get.ts` | sale pickup-order queue rows | `requirePlatformAdmin` (`:12`) |
| GET `/api/admin/orders/[id]` | `server/api/admin/orders/[id].get.ts` | sale order detail | `requirePlatformAdmin` (`:15`) |
| POST `/api/admin/pos-v3/rental-bookings/drafts` | `…/drafts.post.ts` | create `status:"draft"` future booking + quote + payment lines (`:367-374`) | `requirePlatformAdmin` (`:167`) |
| POST `/api/admin/pos-v3/rental-bookings/same-day` | `…/same-day.post.ts` | create `status:"confirmed"` same-day booking, no booking deposit (`:368`) | `requirePlatformAdmin` (`:168`) |
| POST `…/[bookingId]/booking-deposit-payments` | `…/booking-deposit-payments.post.ts` | cash booking-deposit finalization → confirm booking + BDC document (`:251`) | `requirePlatformAdmin` (`:92`) |
| POST `…/[bookingId]/booking-deposit-qr` | `…/booking-deposit-qr.post.ts` | create Omise PromptPay QR charge | `requirePlatformAdmin` (`:57`) |
| GET `…/booking-deposit-qr/active` | `…/active.get.ts` | latest non-terminal QR attempt (resume) | `requirePlatformAdmin` (`:64`) |
| POST `…/booking-deposit-qr/poll` | `…/poll.post.ts` | poll Omise charge → finalize on paid | `requirePlatformAdmin` (`:54`) |
| POST `…/[bookingId]/remaining-security-deposit-payments` | `…/remaining-security-deposit-payments.post.ts` | cash remaining security deposit at pickup | `requirePlatformAdmin` (`:141`) |
| POST `…/remaining-security-deposit-qr` (+ `/active` GET, `/poll` POST) | 3 files | QR variant of remaining security deposit | `requirePlatformAdmin` (`:106` / `:65` / `:31`) |
| **GET `/api/admin/pos-v2/rental-bookings/[id]/pickup-readiness`** | `server/api/admin/pos-v2/…/pickup-readiness.get.ts` | readiness classification + pickup-due money summary | `requirePlatformAdmin` (`:9`) |
| **GET `/api/admin/pos/booking-blocks`** | `server/api/admin/pos/booking-blocks.get.ts` | blocking bookings for asset calendar | `requirePlatformAdminReadAccess` (`:19`) |
| **GET `/api/admin/pos/branches`** | `server/api/admin/pos/branches.get.ts` | POS branch list | `requirePlatformAdmin` (`:9`) |
| **GET `/api/admin/pos/catalog`** | `server/api/admin/pos/catalog.get.ts` | rental/sale catalog search for POS | `requirePlatformAdminReadAccess` (`:34`) |
| GET `/api/contact-settings` | `server/api/contact-settings.get.ts` | public contact settings (transitive via calendar) | none (public) |

**Cross-namespace dependencies (FINDING):**

- **pos-v2**: `pickup-readiness` fetched at `index.vue:214-217` and `:373-375` — V3's pickup money gate depends on a V2-namespace endpoint.
- **pos (v1)**: `booking-blocks` (`DraftContainer.vue:179-181`), `branches` (`:262-264`), `catalog` (`:279-281`) — V3 draft creation depends on three v1-namespace endpoints.
- **Webhook**: `server/api/webhooks/omise.post.ts:19-21,306` finalizes V3 QR attempts independently of the POS poll (`applyPosRentalQrGatewayResult`, `applyPosRentalQrRemainingDepositGatewayResult`).

### P1.4 DB RPC inventory (POS / KYC / documents / inventory scope)

Full `.rpc()` caller sweep: `grep -rn '\.rpc(' server/ app/` → 15 call sites. `database.types.ts` Functions section: lines 7656–7863.

| RPC | Defined | V3 status | Evidence |
|---|---|---|---|
| `f_next_document_number` | `068:155` | **V3-CALLED** | Chain: `booking-deposit-payments.post.ts:251` → `pos-rental-booking-deposit-finalizer.ts:277` → `admin-rental-booking-deposit-confirmation-document.ts:64` `.rpc("f_next_document_number")`. Same chain from QR poll via `pos-rental-qr-booking-deposit.ts:177`. Also called elsewhere: `admin-documents.ts:188`, `admin-refunds.ts:398`, `rental-booking-cancellation.ts:507`, `rental-booking-no-show-documents.ts:119` |
| `f_cancel_pos_sale` | `064:11` | CALLED-ELSEWHERE-ONLY | `server/api/admin/pos/history/cancel.post.ts:32` (POS v1). No V3 caller |
| `f_apply_order_inventory` | `050:13` (redefined 059:74, 060:23, 062:4) | CALLED-ELSEWHERE-ONLY | `server/utils/payments.ts:182`, `sale-order-manual-payment.ts:77`, `server/api/admin/pos/sales.post.ts:290` (v1 sale), `orders/[id]/apply-inventory.post.ts:52`. No V3 caller (V3 has no sale checkout) |
| `f_get_active_agreement_version` | `069:475` | CALLED-ELSEWHERE-ONLY | `server/utils/rental-booking-deposit-payment.ts:106` — imported only by customer endpoints / webhook / mixed-checkout, not pos-v3 |
| `verify_kyc_profile` | `112:192` (grant `:382`) | **NO-CALLER-ANYWHERE** (re-verified) | grep across supabase/, server/, app/, tests/ → only migration 112 + generated `database.types.ts:7860` |
| `revoke_kyc_profile` | `112:304` (grant `:383`) | **NO-CALLER-ANYWHERE** (re-verified) | only migration 112 + `database.types.ts:7798` |
| `f_cancel_customer_rental_booking_refund_request` | `082:20` | CALLED-ELSEWHERE-ONLY | `server/utils/rental-booking-cancellation.ts:867`. No V3 caller |
| `search_products` / `autocomplete_products` | 010/016/019/045 | CALLED-ELSEWHERE-ONLY | `app/composables/useProductSearch.ts:226,233,262` (storefront). Not V3 |
| `autocomplete_assets` | `052:181` | CALLED-ELSEWHERE-ONLY | `app/composables/useGlobalSearch.ts:77`. V3 asset search uses `/api/admin/pos/catalog` table queries instead |
| Trigger-only guard functions: `kyc_pickup_overrides_block_update` (111:27), `kyc_document_access_log_block_mutation` (109:105), `guard_official_document_finalized_updates` (068:258), `rental_bookings_prevent_blocking_overlap` (058:8) | — | N/A | fire via triggers (incl. on V3 writes); no `.rpc()` interface |

**Net RPC picture:** exactly one Postgres RPC is in any V3 code path — `f_next_document_number`, via booking-deposit finalization (cash and QR). Everything else V3 does is plain PostgREST table reads/writes plus Omise HTTP. `verify_kyc_profile`/`revoke_kyc_profile` remain fully orphaned.

---

## P2 — Deposit-Payment Pattern as Sale-Mode Template

### P2.0 Shared preamble

- Draft creation: `server/api/admin/pos-v3/rental-bookings/drafts.post.ts` inserts `rental_bookings` with `status:"draft"` (`:367`) + `pos_branch_id` (`:381`); returns `draftResult` with `quote.bookingDepositDueNow` (`:444`) and `payment.paymentRequired` (`:453`).
- Payment-method chooser: `index.vue` — `handleDraftCreated` sets `latestDraftResult` (`:126-130`); selector card (`:878-926`); `selectPaymentMethod` locks the choice (`:224-227`). Cash container mounts `:930-938`, QR container `:942-950`; both emit `booking-confirmed` → `handleBookingConfirmed` (`:179-181`).

### P2.1 Cash path walkthrough

**UI** — `AdminPosV3FutureBookingDepositCashContainer.vue`
1. Holds `cashTenderedAmount` (`:71`), `idempotencyKey = crypto.randomUUID()` stable per booking id (`:78-87`), `finalizationResult` (`:74`). Change/underpayment are UI-only computed (`:128-138`).
2. Staff clicks "รับเงินและยืนยันการจอง" (`:560-568`) → `submitCashPayment()` (`:151`) POSTs `{ idempotencyKey, paymentMethod: "cash", amount: quote.bookingDepositDueNow }` (`:158-167`). Server-authoritative amount always sent, never tendered cash (`:163-166` comment).
3. Three result renders: confirmed (`:233-316`, incl. BDC print CTA `:265-285` and document-failed warning `:288-315`), degraded `paid_confirm_failed` (`:319-349`), error alert (`:551-557`).

**Server** — `…/[bookingId]/booking-deposit-payments.post.ts`

Validation order:
1. `requirePlatformAdmin` (`:87-92`); bookingId (`:93-98`); `idempotencyKey` required (`:105-109`); `paymentMethod === "cash"` (`:110-114`).
2. Load booking (`:116`, loader `:50-67`); require `pos_branch_id` (`:118-123`); branch POS access unless super_admin (`:125-130`, helper `:27-48`).
3. `status === "draft"` guard (`:132-136`); fail-closed deposit-status guard — any non-`unpaid` (incl. `paid_confirm_failed`) → 409 `BOOKING_DEPOSIT_PAYMENT_ALREADY_CAPTURED` (`:138-147`).
4. Idempotency pre-check: same key → return existing attempt **without re-finalizing**; amount mismatch → 409 (`:150-168`).
5. Zero-due rejected (`:171-175`); amount must equal recomputed `calculateBookingDepositDueNow` (`:178-186`); availability re-check — drafts hold no inventory (`:189-195`).

**Writes, in order:**

- **W1** INSERT `pos_rental_payment_attempts` `status:"paid"`, `paid_at: now` (`:201-220`); 23505 race → reload same-key attempt (`:222-244`).
- Delegate to `finalizePosRentalBookingDeposit` (`:251-260`) → `server/utils/pos-rental-booking-deposit-finalizer.ts`:
  - **W2** INSERT `rental_held_balance_events` (`booking_deposit_collection`, `status:"posted"`) via `recordBookingDepositHeldBalanceCollection` (finalizer `:112-123` → `rental-held-balance-events.ts:129-133`); 23505 replay resolves to existing event (`:135-148`).
  - **W3** UPDATE `rental_bookings` deposit fields (`booking_deposit_payment_status:"paid"`, `_paid_amount`, `_paid_at`, `booking_deposit_pos_attempt_id`) guarded `.eq("booking_deposit_payment_status","unpaid")` (finalizer `:128-137`).
  - **W4** UPDATE `rental_bookings.status` → `"confirmed"` via `confirmRentalBooking` (finalizer `:144-154` → `rental-booking-confirmation.ts:342-348`), which reloads the booking and re-validates dates/branch/pricing/availability + deposit-paid + held-event existence (`:336-340`, `:253-324`, event assert `:302-311` → `rental-held-balance-events.ts:184-229`).
  - On W4 failure: attempt → `paid_confirm_failed` (finalizer `:169-176`), booking deposit status → `paid_confirm_failed` (`:178-185`); returns degraded status, does NOT throw (`:187-193`).
  - **W5 (best-effort)** document issuance — §P2.3.
- Returns `{ status:"confirmed", booking, paymentAttemptId, document }` (`:272-277`) or `paid_confirm_failed` shape (`:262-270`).

### P2.2 QR path walkthrough

**UI** — `AdminPosV3FutureBookingDepositQrContainer.vue`
1. On mount / booking change, auto-creates QR (`:327-335`); `createQrAttempt()` regenerates a fresh idempotency key each call (`:226`), POSTs `…/booking-deposit-qr` `{ idempotencyKey, amount: bookingDepositDueNow }` (`:229-238`).
2. Writes a sessionStorage resume buffer keyed `QR_SESSION_BUFFER_KEY` (`:177-193`); on 409 `EXISTING_ACTIVE_QR_NOT_EXPIRED` resumes via GET `…/active` instead of erroring (`:244-250, :279-298`).
3. Polls POST `…/poll` every 3s while `pending|requires_action|finalizing` (`:153-160, :300-325`); stops + clears buffer at terminal (`:315-318`). `emitConfirmedOnce` fires only on `paid` (`:213-221`). Countdown display-only; local expiry never finalizes (`:121-127`, alert `:471-477`). Regenerate only for `expired|failed|cancelled` (`:98-101, :590-598`).

**Server: attempt creation** — `…/booking-deposit-qr.post.ts`
1. Same admin/branch/draft/deposit-status/zero/amount guards as cash (`:52-130`).
2. Idempotency by key: `pending` → return existing; `paid|finalizing|paid_confirm_failed` → 409 `PAYMENT_ALREADY_PROCESSED`; terminal → return `idempotent: true` (`:135-158`).
3. Availability check (`:161-167`).
4. One-active-attempt rule: live-verifies any non-terminal QR at Omise via `retrieveOmiseCharge` (PromptPay charges cannot be force-expired) (`:169-257`). Gateway `paid` → run finalization then 409 (`:211-237`); still live → 409 `EXISTING_ACTIVE_QR_NOT_EXPIRED` (`:240-246`); gateway terminal → local status sync then proceed (`:250-256`); unverifiable → fail-closed 409 (`:187-204`).
5. Writes: INSERT attempt `status:"pending"`, `gateway:"omise"`, `expires_at = now+5min` (`:259-281`; 23505 race `:283-296`) → Omise source+charge via `createOmisePromptPayCharge` (`:306-319` → `server/utils/omise.ts:145-190`) → UPDATE attempt with `gateway_charge_id/gateway_source_id/qr_image_url` (`:321-329`). Charge-create failure → attempt `status:"failed"` + rethrow (`:339-345`).

**Webhook** — `server/api/webhooks/omise.post.ts`
1. HMAC verify on raw body (`:37-62`); INSERT `payment_events` — duplicate `gateway_event_id` 23505 → `{ ok, duplicate }` (`:71-86`).
2. Attempt lookup fan-out: `payment_attempts` (sale orders `:96-101`) → `rental_booking_payment_attempts` (online deposits `:103-165`) → `mixed_payment_attempts` (`:167-242`) → **POS V3 `pos_rental_payment_attempts` by `(gateway, gateway_charge_id)`** (`:245-250`).
3. `payment_purpose` routing (`:252-278`): unknown purpose → alert + `payment_events.status="failed"` (`:261-277`); `booking_deposit` → load booking (`:287-291`), re-retrieve live charge from Omise (`:303`) → `applyPosRentalQrGatewayResult` (`:306-311`); `remaining_security_deposit` → `applyPosRentalQrRemainingDepositGatewayResult` (`:314-319`). Success marks `payment_events` `processed` with attempt link (`:321-328`); any throw → critical `recordPaymentAlert` + `payment_events` `failed`, webhook still returns 200 (`:330-354`).

**Gateway-result applier** — `server/utils/pos-rental-qr-booking-deposit.ts` `applyPosRentalQrGatewayResult` (`:76-203`):
- Step 0: late-payment recovery — locally `expired` + gateway `paid` → critical alert, fall through to paid path (`:87-116`).
- Step 1: skip permanently terminal (`:118-129`); 1b: `finalizing` + non-paid result preserved, no downgrade (`:131-137`).
- Step 2: amount/currency assert vs stored attempt → 409 `PAYMENT_AMOUNT_MISMATCH` (`:139-152`).
- Step 3: non-paid → direct attempt status update; `expired` sets `expired_at` (`:154-164`).
- Step 4: paid → attempt `status:"finalizing"` (`:166-174`) → shared `finalizePosRentalBookingDeposit` (same W2–W5, `paymentMethod:"promptpay_qr"`) (`:177-186`) → on success attempt `status:"paid", paid_at` (`:197-200`); on `paid_confirm_failed` the finalizer already flagged the attempt (`:189-195`).

**Polling endpoint** — `…/booking-deposit-qr/poll.post.ts`: loads attempt with ownership guard `rental_booking_id = route bookingId` (`:71-86`); for `pending|finalizing|requires_action` with a `gateway_charge_id` performs live reconciliation — `retrieveOmiseCharge` + applier (webhook-miss fallback, `:100-124`); retrieve failure → status unchanged, never locally expired (`:126-130`); local expiry only when no charge id AND window closed (`:131-141`). `paid` responses enriched with BDC lookup from `pos_document_issuance_tasks` + `official_documents` (read-only, failure-tolerant, `:151-196`).

### P2.3 Document auto-issuance (BDC)

Finalizer Step 5 (`pos-rental-booking-deposit-finalizer.ts:195-341`), explicitly isolated from the money path:
1. INSERT `pos_document_issuance_tasks` (`status:"pending"`, keyed `held_balance_event_id` + `document_type`) (`:214-227`); 23505 → reload existing task (`:231-239`); **any other insert error is swallowed and issuance proceeds with `task = null`** (`:241-243`) — FINDING.
2. Already-`issued` task → short-circuit `alreadyIssued: true` (`:253-262`).
3. Attempt tracking: UPDATE `last_attempted_at`, `attempt_count + 1` (`:264-274`).
4. `issueBookingDepositConfirmationDocument` (`admin-rental-booking-deposit-confirmation-document.ts:106-257`): duplicate guard on `(source_type='rental_held_balance_event', source_id, document_type)` (`:121-123`); header snapshot (`:126-129`); doc number via `f_next_document_number`, prefix `BDC` (`:59-79, :131-137`); INSERT `official_documents` with deterministic `idempotency_key` (`:198-221`; 23505 → return existing `:223-228`); INSERT `document_events` `issued` (`:239-254`).
5. Success → task `status:"issued"`, `official_document_id`, `issued_at` (`:285-297`). Any throw → task `status:"failed"` + `error_code/error_message` (best-effort, `:317-330`); money state untouched; response carries `document.status:"failed"` (`:332-340`).

**Retry:** no background worker exists. (a) Manual admin endpoint `server/api/admin/rental-bookings/[id]/documents/booking-deposit-confirmation/retry.post.ts` — eligibility guard (`:43-51`), can recreate a missing task from the held-balance event (`:93-139`), re-issues idempotently (`:192-219`); (b) implicit replay whenever the idempotent finalizer re-runs (webhook replay / poll reconciliation). Failed-task UI: cash `:288-315`, QR `:563-568`.

### P2.4 State transitions

**`rental_bookings.status`:** `draft → confirmed` only — `rental-booking-confirmation.ts:342-348`, guarded `.in("status", ["draft"])`.

**`rental_bookings.booking_deposit_payment_status`** (values: migration `076:64-72`):
- `unpaid → paid`: finalizer `:128-137` (guarded `.eq(...,"unpaid")`)
- `paid → paid_confirm_failed`: finalizer `:178-185` (only when confirmation throws)
- Recovery from `paid_confirm_failed` is manual — both endpoints fail-closed on it (cash `:143-147`, QR `:111-115`)

**`pos_rental_payment_attempts.status`** (values: migration `092:68-78`):

| Transition | Code |
|---|---|
| (create) `paid` (cash) | `booking-deposit-payments.post.ts:209` |
| (create) `pending` (QR) | `booking-deposit-qr.post.ts:269` |
| `pending → failed` (charge-create error) | `booking-deposit-qr.post.ts:340-343` |
| `pending → expired/failed/…` (gateway non-paid) | `pos-rental-qr-booking-deposit.ts:154-164`; local no-charge expiry `poll.post.ts:135-140`; replacement terminal sync `booking-deposit-qr.post.ts:250-256` |
| `pending/expired → finalizing` (gateway paid) | `pos-rental-qr-booking-deposit.ts:169-174` |
| `finalizing → paid` | `pos-rental-qr-booking-deposit.ts:197-200` |
| `paid`/`pending`/`finalizing → paid_confirm_failed` | finalizer `:169-176` |

**`pos_document_issuance_tasks.status`** (`pending → issued | failed`; retry reuses the row — migration `091:45-49,72`): create pending finalizer `:214-227` / retry `:124-139`; → issued finalizer `:285-297` / retry `:202-213`; → failed finalizer `:317-330` / retry `:227-236`; failed → pending re-arm retry `:174-183`.

**`payment_events.status`:** `received → processed | failed | ignored` (`omise.post.ts:88-94, 269-277, 321-328, 342-353`).

### P2.5 Error handling, atomicity, idempotency

#### G2 — the 4 non-atomic writes (VERIFIED; known constraint, no fix proposed here)

Each is a separate Supabase HTTP call; no DB transaction, RPC, or saga wraps them:

1. **W1** INSERT `pos_rental_payment_attempts` — cash: `booking-deposit-payments.post.ts:201-220` (created directly as `"paid"`); QR: attempt pre-exists, its `finalizing` transition (`pos-rental-qr-booking-deposit.ts:169-174`) plays the analogous role.
2. **W2** INSERT `rental_held_balance_events` — finalizer `:112-123` → `rental-held-balance-events.ts:129-133`.
3. **W3** UPDATE `rental_bookings` deposit-paid fields — finalizer `:128-137`.
4. **W4** UPDATE `rental_bookings.status = 'confirmed'` — `rental-booking-confirmation.ts:342-348`.

(W5 document issuance adds up to 4 more writes but is deliberately outside the money invariant — finalizer `:195-207`.)

#### Observed failure behavior per gap (no rollback anywhere)

- **Crash between W1 and W2 (cash) — FINDING (HIGH, pending reproduction test):** attempt persists as `paid`; booking stays `draft/unpaid`; no held event. A same-key retry returns the stored attempt status (`paid`) **without re-running the finalizer** (`booking-deposit-payments.post.ts:150-168`) — booking remains unconfirmed. A new-key retry passes the `unpaid` guard but the partial unique index `idx_pos_rental_payment_attempts_one_paid_deposit` (migration `087:41-43`) rejects a second `paid` insert → 23505 → key mismatch → 500 (`:222-243`). Net: cash collected, booking stuck in draft, manual repair required. The QR path does NOT have this gap — its recovery re-enters via the idempotent finalizer (`pos-rental-qr-booking-deposit.ts:60-66`, `booking-deposit-qr.post.ts:209-224`, poll reconciliation).
- **W2 fails (non-23505):** `recordRentalHeldBalanceEvent` throws 500 (`rental-held-balance-events.ts:135-140`); finalizer does not catch it (only W4 is wrapped, finalizer `:142-157`) → cash endpoint 500 with attempt already `paid` (same stuck state); QR webhook catch → alert + `payment_events` failed (`omise.post.ts:330-354`), attempt stays `finalizing`, replay/poll retries idempotently.
- **W3 fails — FINDING (MED):** the update result is **not checked at all** (finalizer `:128-137` — `error` never destructured); execution silently continues to W4, whose fresh-load validation then fails (`BOOKING_DEPOSIT_PAYMENT_REQUIRED`, `rental-booking-confirmation.ts:287-301`) → degrades to `paid_confirm_failed`.
- **W4 fails:** caught; attempt + booking flagged `paid_confirm_failed` (finalizer `:162-193`); money never reversed ("Does NOT undo collection", `:159-161`). Both endpoints then fail-closed against re-collection (cash `:141-147`, QR `:109-115`) — recovery is manual by design.
- **W5 fails:** fully isolated; booking confirmed, payment paid, `document.status:"failed"` returned (finalizer `:309-341`); manual retry endpoint available.

#### Idempotency inventory

- Client UUID key: cash stable per booking (`CashContainer.vue:78-87`); QR fresh per attempt (`QrContainer.vue:226`).
- DB `UNIQUE (rental_booking_id, idempotency_key)` — migration `087:24`; 23505 races resolved in both endpoints (cash `:222-244`, QR `:283-296`).
- One-paid-deposit-per-booking partial unique index — `087:41-43` (remaining-deposit twin `093:41-43`).
- Held-balance event uniqueness `(source_type, source_id, event_type)` + `(rental_booking_id, idempotency_key)` — migration `086:42-47`; replay resolution `rental-held-balance-events.ts:135-148`; mismatch → 409 (`:57-72`).
- Webhook dedupe: unique `gateway_event_id` → `{ duplicate: true }` (`omise.post.ts:83-85`).
- Attempt-by-charge unique index `idx_pos_rental_payment_attempts_gateway_charge` — `092:115-117`.
- Task uniqueness `UNIQUE (held_balance_event_id, document_type)` — `091:72`; `official_documents` idempotency index `(source_type, source_id, document_type, idempotency_key)` — `068:327-329`.
- Retries: no automatic retry loop anywhere; retries are webhook redelivery, 3-second UI polling (`QrContainer.vue:159`), and manual document retry.

### P2.6 Reusability map for sale mode

**Generic / reusable as a pattern:**

- Payment-attempt lifecycle + idempotency machinery: key pre-check, 23505 race reload, amount-conflict 409, fail-closed status guard (`booking-deposit-payments.post.ts:105-168, 222-244`).
- QR attempt lifecycle: 5-min expiry, one-active-attempt live-verify against Omise, session-buffer resume, 3s polling with live reconciliation fallback (`booking-deposit-qr.post.ts:169-257`; `poll.post.ts:100-141`; `QrContainer.vue:148-335`). `mapPosQrAttemptResponse` + `POS_QR_ATTEMPT_SELECT` are already payment-purpose-agnostic (`pos-rental-qr-booking-deposit.ts:13-35`).
- Omise utilities are domain-free: `createOmisePromptPayCharge` / `retrieveOmiseCharge` (`server/utils/omise.ts:145-201`).
- Webhook fan-out skeleton: signature verify, `payment_events` audit + dedupe, per-attempt-table dispatch, purpose routing, alert-on-failure (`omise.post.ts:36-94, 244-355`). A sale path already exists in the webhook via the sale `payment_attempts` branch + `applyGatewayResult` (`:96-101, :374-439`).
- Doc-issuance task-queue pattern: task row per financial event, pending→issued/failed, idempotent re-issue, manual retry endpoint (091 schema; finalizer `:195-341`; retry endpoint).
- Gateway-result applier structure (terminal skip / no-downgrade / amount assert / finalizing handshake / late-payment recovery) — `pos-rental-qr-booking-deposit.ts:76-203`.
- Closest existing decoupled template: `AdminPosV3PickupDepositQrCard.vue` + `pos-rental-qr-remaining-deposit.ts:26-40` — the "QR lifecycle minus confirmRentalBooking/BDC" variant.

**Booking-specific / blocked pieces (exact constraints):**

| # | Blocked piece | Constraint (evidence) |
|---|---|---|
| 1 | Attempt table is booking-only | `pos_rental_payment_attempts.rental_booking_id NOT NULL REFERENCES rental_bookings` — migration `087:8` |
| 2 | Purpose CHECK excludes sale | `payment_purpose` CHECK allows only `('booking_deposit','remaining_security_deposit')` — `093:30-35` |
| 3 | Method CHECK excludes card | `payment_method` CHECK allows only `('cash','promptpay_qr')` — `092:39-41` |
| 4 | One-paid indexes are purpose-hardcoded | `087:41-43`, `093:41-43` |
| 5 | Finalizer is deposit/booking-coupled | held event type `booking_deposit_collection` (`rental-held-balance-events.ts:10`); booking deposit columns in W3 (finalizer `:128-137`); `confirmRentalBooking` draft→confirmed with rental revalidation (`rental-booking-confirmation.ts:253-361`). Held-balance events are liabilities "not rental revenue" (`086:39-40` comment) — sale revenue doesn't fit this ledger |
| 6 | Document type is rental-only | `rental_booking_deposit_confirmation` / BDC prefix (`admin-rental-booking-deposit-confirmation-document.ts:10-13`); `pos_document_issuance_tasks.rental_booking_id NOT NULL` + `held_balance_event_id NOT NULL` — `091:26-36` |
| 7 | Customer-ref semantics inverted | `rental_bookings_customer_ref_chk` requires identity (`057:17-21`); POS sale is intentionally anonymous — `orders_customer_ref_chk` relaxed in `063:6-16` |
| 8 | Amount validation is deposit-formula-bound | `calculateBookingDepositDueNow` (`booking-deposit-payments.post.ts:178-186`; `booking-deposit-qr.post.ts:122-130`); inventory guard `assertRentalBookingAvailability` (`:189-195`) has no sale analogue |

### P2.7 Test coverage of this flow

All in `tests/server/`:
- `admin-pos-v3-booking-deposit-payments.spec.ts` — cash endpoint. **Pass.**
- `admin-pos-v3-qr-booking-deposit.spec.ts` — QR create/active/poll + applier. **Pass.**
- `admin-pos-v3-future-booking-cash-finalization-ui.spec.ts`, `admin-pos-v3-qr-booking-deposit-ui.spec.ts` — UI contracts. **Pass.**
- `admin-rental-booking-deposit-confirmation-document.spec.ts` — BDC issuance. **Pass.**
- `admin-pos-v3-qr-webhook.spec.ts` — 4 tests fail (A, B, C, F): fixture `basePosAttempt` (`:188-199`) lacks `payment_purpose`, so the newer fan-out (`omise.post.ts:254-278`) routes to unknown-purpose and returns `{ unknownPosPaymentPurpose: true }` instead of `{ posRentalQr: true }`. Fixture drift, not a product bug.
- Re-verified: `admin-pos-v3-remaining-security-deposit-payments.spec.ts` — 12 failed; all with `…eq(…).not is not a function` at `remaining-security-deposit-payments.post.ts:226` (test mock chain lacks `.not()`). `admin-pos-v3-remaining-security-deposit-qr.spec.ts` passes. Confirms prior audit: mock drift only.

---

## P3 — Mode Framework

### P3.1 Architecture

**A single, non-persisted `ref` on one page component. No router param, no store, no child routes.**

- Type def (page): `index.vue:31` — `type AdminPosV3Mode = "sale" | "booking" | "kyc";`
- Type def (duplicate): `AdminPosV3ModeNav.vue:2` — same union re-declared verbatim; not shared via `app/types/` — FINDING (sync overhead).
- State holder: `index.vue:96` — `const activeMode = ref<AdminPosV3Mode>("booking");`
- Nav contract: `ModeNav.vue:4-10` — `modelValue` prop + `update:modelValue` emit (plain `v-model`). Mode buttons come from a hardcoded internal `modes` array (`ModeNav.vue:12-36` — labels are hardcoded Thai/English strings, no `t()`); grid hardcoded `md:grid-cols-3` (`:40`). Bound at `index.vue:695`.

**Every `activeMode` read (exhaustive, grep-verified across `app/` and `tests/`):**

| # | Location | Gate |
|---|---|---|
| 1 | `index.vue:96` | declaration |
| 2 | `index.vue:695` | `v-model` binding |
| 3 | `index.vue:771-777` | DraftContainer — `=== 'booking' && latestDraftResult === null && !bookingIdQueryMode && !sameDayBookingCreated` |
| 4 | `index.vue:788-794` | "ineligible booking" UAlert — `=== 'booking' && bookingIdQueryMode && …` |
| 5 | `index.vue:807` | locked draft summary UCard — `=== 'booking' && latestDraftResult !== null` |
| 6 | `index.vue:879-884` | payment-method selector — `=== 'booking' && latestDraftResult !== null && selectedPaymentMethod === null` |
| 7 | `index.vue:930-935` | CashContainer — `=== 'booking' && … === 'cash'` |
| 8 | `index.vue:941-947` | QrContainer — `=== 'booking' && … === 'promptpay_qr'` |

All 6 template gates test `=== 'booking'`. **Zero gates exist for `'sale'` or `'kyc'`.**

**Persistence: none.** `activeMode` is never synced to `route.query`; only `bookingId` is URL-synced (`index.vue:160` write, `:661-672` read in onMounted). Reload/navigation resets the mode to `"booking"`.

### P3.2 What "sale" mode currently renders

No sale-specific block exists anywhere. Selecting "ขายขาด" simply removes the 6 booking-gated blocks. What remains renders identically in all three modes (none of it gated on `'sale'`):

- Header card + ModeNav + Phase-1 scope alert (`index.vue:679-703`)
- `AdminPosV3ResolverPanel` (`:705-712`) — always on
- `AdminPosV3PendingWorkList` (`:715`, gated on `userContext` only) — mixes bookings AND sale pickup orders (`buildPendingItems` `:310-339`, fed by `/api/admin/orders/queue` `:455`)
- `AdminPosV3BookingContext` (`:724`) and `AdminPosV3OrderContext` (`:733`) — gated on loaded context, not mode
- `AdminPosV3PickupContainer` (`:744-749`) — gated **only** on `bookingContext.status`, so the full rental pickup flow mounts even while "sale" mode is selected — FINDING (cross-mode leakage)

Prior finding confirmed with a nuance: sale-order interaction is read-only lookup — `AdminPosV3OrderContext.vue` has no `$fetch`/mutation; its only action is a link `:to="/admin/orders/${orderId}"` (`:78`). But that lookup is mode-independent; sale mode itself is cosmetic.

### P3.3 Hardcoding assessment

**No abstraction exists.** No mode registry, no component map, no per-mode config, no `<component :is>`, no per-mode child routes. Each mode is hand-wired via `v-if="activeMode === 'booking' && …"` chains compounded with 4 other page-level refs (`latestDraftResult`, `bookingIdQueryMode`, `sameDayBookingCreated`, `selectedPaymentMethod`), plus two mode-flavored UI blocks written inline in the page template (locked draft summary `index.vue:806-874`; payment selector `:878-926`).

**Child containers are booking-coupled, not mode-agnostic:**
- DraftContainer owns rental types (`RentalBookingCalendarPayload`, `PosBlockingBooking`) and calls `/api/admin/pos/booking-blocks` (`:180`), `/api/admin/pos-v3/rental-bookings/drafts` (`:329`).
- PickupContainer imports `AdminRentalBookingDetail`, `AdminBookingChecklists`, `DigitalSignaturePad`, booking-ops types (`:1-10`).
- The page script is ~90% booking-flow logic (QR session restore `:637-673`, deposit math `:407-414`, pickup ops `:191-222`).

**Shared state:**
- `userContext` (customer) is page-level (`index.vue:103`), passed as a prop (`:778`) — a new mode could reuse it.
- **Branch is NOT page-level** — `selectedBranchId` + branch fetch live inside DraftContainer (`:115-119, 263-267`). A new mode must re-implement branch selection; modes would not share the selection — FINDING.
- **Staff identity is absent from V3 entirely** (pos-v2 passes `:staff-name` to AdminPosHeader, `pos-v2/index.vue:684-685`; nothing equivalent in V3) — FINDING.
- No POS composable or Pinia store; all state is component-local refs.

### P3.4 Touchpoint count — adding one fully working mode (e.g. "return")

**UI touchpoints (8):**
1. `index.vue:31` — extend `AdminPosV3Mode` union.
2. `ModeNav.vue:2` — extend the duplicate union (lockstep or the `v-model` type breaks).
3. `ModeNav.vue:12-36` — add entry to the hardcoded `modes` array.
4. `ModeNav.vue:40` — `md:grid-cols-3` hardcoded for exactly 3 modes; a 4th requires a layout decision.
5. `index.vue` template — new `v-if="activeMode === 'return'"` gate(s); review the 6 existing `'booking'` gates and the ungated PickupContainer (`:744`) for cross-mode leakage.
6. `index.vue` script — new per-mode state refs + handlers (existing pattern: `latestDraftResult`/`selectedPaymentMethod`/`sameDay*` at `:122-181`, ~60 lines per sub-flow).
7. New container component file(s) — existing containers cannot be reused mode-agnostically (§P3.3), including re-implementing branch selection.
8. i18n — per CLAUDE.md rules all 4 locale files; caveat: the existing ModeNav and page violate this today (hardcoded Thai at `ModeNav.vue:21,27,33` and `index.vue:797-798, 813-816, 888-891, 903-906, 918-921`), so "match the codebase" = 0 files, "match the stated rules" = 4 files.

**Backend touchpoints (1–2):**
9. New endpoint(s) under `server/api/admin/pos-v3/…` following the 10 existing files. A return-status endpoint already exists at `server/api/admin/rental-bookings/[id]/return.post.ts` and could be reused, but every prior V3 sub-phase got a dedicated pos-v3 route.

**Test touchpoints (2):**
10. `tests/server/admin-pos-v3-ui.spec.ts` — brittle source-string assertions constrain the change: exact mode labels asserted at `:34-39` (`ขายขาด`/`Booking`/`KYC`), exact `v-if` gate strings at `:482-485, 597-611`, including a `not.toContain('v-if="activeMode === \'booking\'"')` at `:603` that dictates gate formatting — FINDING (test brittleness).
11. New spec file(s) per the established pattern (10 `admin-pos-v3-*.spec.ts` files exist, one per flow).

**Total: ~11 distinct locations** (8 UI + 1–2 backend + 2 test), of which two (the duplicated type union; the source-inspection test strings) are pure synchronization overhead created by the lack of abstraction.

### P3.5 Comparison with pos-v2 shell

V2 uses a slot-based layout shell: `AdminPosShell.vue` (280px + 1fr grid exposing `#sidebar`/`#header`/default slots; 12 lines of template) + `AdminPosSidebar.vue` with a **data-driven `items` prop** (`{ key, label, description, icon, to, status: "live" | "planned" }`, `AdminPosSidebar.vue:2-13`) supplied by the page (`pos-v2/index.vue:218`, rendered `:678-685`), route-aware links, live/planned badges.

**V3 dropped that structure.** `pos-v3/index.vue` imports neither AdminPosShell nor AdminPosSidebar (imports `:2-10` are all AdminPosV3*); it renders a flat vertical card stack with the 3-button ModeNav in the header card. Notably, V2's sidebar was the more configuration-driven of the two — V3's ModeNav hardcodes its mode list inside the component itself. (Evidence only; no recommendation.)

---

## P4 — Gap Mapping per Slice

Synthesized from P1–P3 (and P5 for V3-5). Each slice: what exists / what's missing / cross-slice dependencies.

### V3-1 — Sale mode

**Exists:**
- Sale mode button (DEAD — `ModeNav.vue:19-23`; zero `'sale'` gates, P3.1)
- Read-only sale-order lookup: `/api/admin/orders/queue` + `/api/admin/orders/[id]` + `AdminPosV3OrderContext` (P1.2) — mode-independent, handoff-only
- Backend sale machinery in the **v1 namespace**: `server/api/admin/pos/sales.post.ts` (branch stock guard, order+items insert, `f_apply_order_inventory`, void/restock via `f_cancel_pos_sale`) — no V3 caller (P1.4)
- Reusable payment patterns from the deposit flow: attempt lifecycle/idempotency, QR lifecycle, webhook purpose routing, applier structure, doc-task queue (P2.6); webhook already has a sale `payment_attempts` branch (`omise.post.ts:96-101, 374-439`)
- POS catalog endpoint supports `mode=sale` (`/api/admin/pos/catalog`, P1.3)

**Missing:**
- Any sale UI in V3: cart/line-item builder, quantity, totals, payment capture, completion screen (P1.2 MISSING row)
- A V3 sale endpoint — nothing under `server/api/admin/pos-v3/` touches orders
- Payment-attempt schema support: the 8 blocked constraints in P2.6 (booking-only FK `087:8`, purpose CHECK `093:30-35`, method CHECK `092:39-41`, purpose-hardcoded one-paid indexes, deposit-coupled finalizer, rental-only doc types, inverted customer-ref semantics, deposit-formula amount validation)
- Cash-drawer/session model and per-sale stock ledger (carried over from the 2026-07-08 audit)

**Cross-slice dependencies:** V3-2 (a sale without a receipt contradicts the fiscal-docs target); V3-6 (either V3-1 re-hosts or continues to call the v1 `sales`/`catalog`/`branches` endpoints — retiring v1 before V3-1 settles this breaks draft creation too, P1.3); P3 mode framework (sale is the first mode forced through the 11-touchpoint path).

### V3-2 — Fiscal documents

**Exists:**
- Full rental-document engine: `official_documents`, `f_next_document_number` (the one RPC V3 calls, P1.4), immutable snapshots, print pages, `document_events` audit
- The POS async issuance pattern: `pos_document_issuance_tasks` + finalizer step 5 + manual retry (P2.3)
- BDC print wired in both deposit containers (P1.2)
- Foundations with no consumer: `customer_tax_profiles` + `official_documents.tax_profile_id`; vat columns (2026-07-08 audit R2)

**Missing:**
- Sale receipt, tax invoice (full/ABB), quotation, rental contract — NOT FOUND repo-wide (2026-07-08 audit R2); in V3 specifically, Phase-1 alert excludes "fiscal workflows" (`index.vue:700`)
- `pos_document_issuance_tasks` is structurally rental-bound: `rental_booking_id NOT NULL` + `held_balance_event_id NOT NULL` (`091:26-36`) — cannot carry a sale receipt without schema change
- No PDF engine (browser print only); no admin UI for `branch_document_settings`/`document_company_profile` (hardcoded fallbacks incl. tax ID in `OfficialDocumentHeader.vue:5`)
- No V3 documents workspace page ("POS V3 Documents workspace" exists only in migration comments, `091:105-106`)

**Cross-slice dependencies:** V3-1 (receipt needs a sale to attach to; issuance-task schema change should be designed once for both sale and return docs); V3-4 (return/settlement docs — refund confirmation exists, settlement receipt does not).

### V3-3 — KYC

**Exists:**
- Complete, test-green backend (14/14 spec files): identity_hash HMAC flow, profile create/lookup/dedupe, document upload/download + audit, booking attach with constant-time ownership proof, pickup gate (`rental-fulfillment.ts:221-249`) — V3's pickup POST already enforces it transitively (P1.3 pickup row)
- Read-only KYC status badge in PendingWorkList (`AdminPosV3PendingWorkList.vue:45-47`)
- A wired non-POS admin intake page: `app/pages/admin/kyc/index.vue`

**Missing:**
- KYC mode renders nothing (zero `'kyc'` gates, P3.1); phone-based customer resolution explicitly deferred (`index.vue:544-551` DEAD row)
- `verify_kyc_profile` / `revoke_kyc_profile` — NO-CALLER-ANYWHERE, re-verified (P1.4)
- Walk-in phone capture in the intake form; UI caller for `kyc-attach` (API-only)
- Production enablement explicitly NOT approved (`docs/kyc-production-enablement-checklist.md` §0); `DECISIONS.md:103` records "KYC frozen … POS V3 … out of scope until resume"

**Cross-slice dependencies:** V3-4 (return also needs identity confirmation); the scanner's dead `customer-phone` branch (P1.2) is the natural KYC entry point; V3-1 sale is intentionally anonymous (`063:6-16`) so KYC must stay out of the sale path per existing business rules.

### V3-4 — Return / settlement

**Exists:**
- Backend return endpoint with no V3 caller: `server/api/admin/rental-bookings/[id]/return.post.ts` (P1.2 MISSING row)
- Return-form document type (`rental_return_form`, RET numbering) issuable from the rental-bookings admin page — not from V3
- Deposit money-model groundwork: `rental_held_balance_events` ledger, remaining-security-deposit collection (cash+QR) at pickup (P1.2), refund machinery in `server/utils/admin-refunds.ts` (used by admin refunds, not V3)
- Rental fee explicitly parked for this slice: "deferred to return / settlement" (`PickupContainer.vue:57-59, 253-254`)

**Missing:**
- Any V3 return UI: `picked_up` bookings show "Return path will plug in later." (`AdminPosV3BookingContext.vue:34-35`)
- Settlement calculation (rental fee + damages/fines vs held deposit), deposit release/refund flow in POS, settlement documents
- A `return`/`settlement` mode — would be the 4th mode, hitting the hardcoded `md:grid-cols-3` (P3.4 touchpoint 4)

**Cross-slice dependencies:** consumes V3-3 (identity at return), V3-2 (settlement/refund docs), and the P2 payment pattern (refund attempts are a new payment_purpose — blocked by the same CHECK, `093:30-35`); pickup-readiness lives in the pos-v2 namespace (P1.3), so V3-6 retirement must move it first or return inherits the dependency.

### V3-5 — iPad UX

**Exists:** responsive-enough card grids at md (P5 §1.2), correct signature-pad touch handling (`touch-none`, P5 §5), correct rear-camera scanner config, adequate primary CTAs (`size="lg"` confirm-pickup).

**Missing / broken (detail in P5):** 4 HIGH findings — sub-24px checklist controls incl. adjacent trash delete, 24px calendar day cells, dev-facing phase banners, raw error codes shown to staff; MED — admin nav header consumes first screen at 1024×768, resolver below fold (xl-only 2-col), no i18n anywhere in V3, no `inputmode`/`type="tel"` on phone input, UUID typing required for manual resolve, input-focus auto-zoom (14px inputs, default viewport meta), no PWA/fullscreen.

**Cross-slice dependencies:** every slice ships UI through the same page/containers, so P5 findings compound with each added mode; the checklist and calendar components are shared with the wider admin (changes affect non-POS surfaces).

### V3-6 — Retire v1/v2

**Exists (blockers to retirement, all evidence above):**
- V3 draft creation depends on three v1 endpoints: `pos/booking-blocks`, `pos/branches`, `pos/catalog` (P1.3)
- V3 pickup money gate depends on v2 `pickup-readiness` (P1.3)
- v1 is the only sale-capable POS (`pos/sales.post.ts`) and the only POS with accounting export + void/restock (`pos/history/cancel` → `f_cancel_pos_sale`, P1.4)
- v1 hosts the only POS-side identity-capture UI (legacy `customers/id-card`, 2026-07-08 audit R6#11)
- Branch-access enforcement differs: v1 create endpoints skip `admin_user_branch_access` checks; v2/v3 enforce them (2026-07-08 audit R7)

**Missing:** nothing new — this slice is defined by the dependency list above. v2's page + 6 shell components + 2 of its 3 endpoints are already orphaned (2026-07-08 audit R6#1-3) except `pickup-readiness`.

**Cross-slice dependencies:** V3-6 is last for a reason — it requires V3-1 (sale + catalog/branch data layer re-hosted or namespace-blessed), V3-3 (replaces v1's legacy id-card capture), V3-4 (replaces nothing in v1 — v1 has no return flow either — but settlement completes the lifecycle v1 never had). The `walk_in_customers`-based booking path and POS history/accounting-export have no V3 equivalent yet.

---

## P5 — iPad Baseline (1024×768 / 820×1180)

Files audited: `app/pages/admin/pos-v3/index.vue`, all `AdminPosV3*` components, transitive `AdminBookingChecklists.vue` / `DigitalSignaturePad.vue` / `AdminOrderQrScanner.vue` / `RentalBookingCalendar.vue`, `app/layouts/admin.vue`, `nuxt.config.ts`. All evidence is actual classes/styles in code.

### P5.1 Responsive layout

- **[MED] Page shell grid collapses to 1 column on iPad.** `index.vue:678` — `grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]`. Two-column split only at `xl` (1280px). At 1024 and 820 everything stacks; the QR/manual resolver — the primary entry action — sits below the header card and the admin nav block. The only fixed min width (`minmax(360px,…)`) is inside the `xl:` value, so it never applies on iPad.
- **[MED] Admin layout: no sidebar, but a large always-visible nav header eats vertical space.** `app/layouts/admin.vue` renders `HopHeader` plus a full-width backoffice panel of 4–6 nav groups: `admin.vue:136` `<UContainer class="py-6">`; `:138` `mb-6 rounded-2xl border … p-4`; `:172-205` `v-for="group in navGroups"` each `rounded-xl border … p-3` with `flex flex-wrap gap-2` of `size="sm"` UButtons (`:184-192`). At 1024×768 landscape (~700px usable after Safari chrome) this block consumes roughly the entire first screen before any POS content. Not collapsible; no breakpoint hides it. *(Screen-height consumption is reasoned from code, not rendered — see low-confidence list.)*
- **[LOW] md-boundary grids.** Both target widths are above `md` (768), so: `index.vue:821` `md:grid-cols-2 xl:grid-cols-4` → 2-col, fine; `QrContainer.vue:373` `grid gap-3 text-sm md:grid-cols-4` → **4 columns from 768px up**; the Booking ID cell is `font-mono text-xs` (`:376`) holding a full UUID — cramped at 820 portrait but wraps rather than overflows. `BookingContext.vue:80`, `OrderContext.vue:60`, `CashContainer.vue:369` use `md:grid-cols-2 xl:grid-cols-4` → safe. `ModeNav.vue:40` `md:grid-cols-3` mode cards are `p-3` full-tap-area. No `<table>`, no `min-w-[…]`, no horizontal-overflow candidates found in the V3 flow.
- **[LOW] HopHeader at iPad widths:** search `hidden … xl:block` (`HopHeader.vue:65`); `NavMenu … hidden lg:flex` (`:70`) shows at 1024 landscape, collapses to MobileMenu (`:97` `lg:hidden`) at 820 portrait. Cosmetic; storefront nav is irrelevant to POS staff.

### P5.2 Touch targets

@nuxt/ui defaults referenced: `xs` ≈ 24px, `sm` ≈ 28–32px, default/`md` ≈ 32–36px height — all below the 44px iPad guideline. *(Pixel figures are library-default approximations — see low-confidence list.)*

- **[HIGH] Checklist action buttons in the pickup flow** (`AdminBookingChecklists.vue`, mounted by PickupContainer `:474-480` — core POS V3 pickup interactions):
  - `:249`/`:259` `size="xs"` Start / Complete
  - `:286-293` `size="xs" variant="ghost" color="error"` Cancel
  - `:294-300` `size="xs" variant="ghost"` chevron Open/Hide
  - `:301-308` `size="xs" variant="ghost" color="error" icon="bx:trash"` — **icon-only xs ghost delete (~24px) directly adjacent to Open/Hide**; a mis-tap deletes a checklist
  - `:341-355`/`:356-373` `size="xs" variant="ghost"` per-item "Fail" / "N/A"
  - `:319-331` `UCheckbox` default (~16px box) as the per-item check control
  - `:435-442` raw button `class="absolute -right-1 -top-1 rounded-full bg-error px-1 text-xs text-white"` — photo-remove target well under 20px
  - `:444-446` photo-add label `px-2 py-1 text-xs`
  - `:202` header `size="xs"` "Add checklist"
  - Mitigation present: the POS "Complete Checklist" CTA is `size="sm" variant="solid"` (`:269-283`) — still ~32px.
- **[HIGH] Calendar day cells 24px.** `RentalBookingCalendar.vue:587` — `inline-flex min-h-6 min-w-6 items-center justify-center rounded-full` = 24×24px day targets for finger-driven range selection, the core booking-creation gesture.
- **[MED] Other small controls:** `DigitalSignaturePad.vue:97-104` `size="xs" variant="ghost" … label="ล้างลายเซ็น"` — the only way to redo a bad signature; `PickupContainer.vue:385-391, 414-421` `size="sm" variant="ghost"` "เปลี่ยนวิธีชำระ"; `ResolverPanel.vue:67-71, 87-91` icon-only `UButton icon="bx:search"` (default ~32px) as the submit affordance for both resolver fields; `admin.vue:184-192` nav `size="sm"` buttons.
- **Adequate (contrast):** mode cards `p-3` (`ModeNav.vue:45`), payment-method cards `p-4` (`index.vue:897/912`), pending-work rows `w-full … p-3` (`PendingWorkList.vue:74`), asset cards `p-3` (`DraftContainer.vue:603`), confirm-pickup CTA `size="lg"` (`PickupContainer.vue:531-539`).

### P5.3 Hover-dependent interactions — [LOW]

No `UTooltip` and no HTML `title=` attributes anywhere in V3 components (grep confirmed; all `title=` hits are UAlert props). Hover classes are decorative with non-hover selected states: `ModeNav.vue:45` `hover:bg-elevated` (selected state via `border-primary bg-primary/10`, `:47-49`); `index.vue:897, 912` `hover:border-primary hover:bg-primary/5`; `PendingWorkList.vue:74` same; `DraftContainer.vue:516-521, 529-534, 603-608` `hover:bg-elevated`; `AdminBookingChecklists.vue:445`. Residual nit: payment-method/asset cards have no non-hover tappability affordance (no chevron/press state).

### P5.4 Staff-confusion copy / flow

- **[HIGH] Developer-facing phase banners permanently visible to staff:**
  - `index.vue:696-701` UAlert `title="Phase 1 scope"` `description="Shell, QR resolver, pending work list, and booking/order context handoff only. Completion, sale checkout, KYC, and fiscal workflows are not implemented here."` — in the page header card.
  - `OrderContext.vue:72-77` `title="Phase 1 handoff only"` "…intentionally not implemented here."
  - `ModeNav.vue:21` "Walk-in product purchase entry point for later phases."; `:33` "Customer registration and identity work will plug in later." — tappable buttons leading nowhere, dev notes as the only explanation.
  - `BookingContext.vue:35-36` "Return path will plug in later." / "Resolved, but inactive or not actionable in POS V3 Phase 1."
  - `index.vue:441-443` "…Phone QR lookup belongs to a later KYC/search phase."; `:548-550` "…Phone/walk-in search belongs to a later KYC phase."
- **[HIGH] Raw error/status codes surfaced verbatim:**
  - `QrContainer.vue:415` `title="ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED"` — SCREAMING_SNAKE as an alert title; `CashContainer.vue:465` `:title="ZERO_DUE_WARNING"` renders the same constant (defined `:89`).
  - Raw enums as badges: QR `:367` `{{ attempt?.status || (isCreating ? "creating" : "awaiting_qr") }}` (e.g. `paid_confirm_failed`); cash `:330-331`; `PickupDepositQrCard.vue:259-263` `manual_review`; PendingWorkList status built as `` `${order.paymentStatus} / ${order.fulfillmentStatus}` `` (`index.vue:331`).
  - Error passthrough: `index.vue:162-165` `statusMessage` shown as alert description (`:167-171`) — backend codes like `SAME_DAY_RENTAL_REQUIRES_TODAY_START_DATE` reach staff verbatim; `DraftContainer.vue:349-351` and `CashContainer.vue:176-178` `` submitError = code ? `[${code}] ${msg}` : msg `` → `[500] …` bodies.
  - `index.vue:553-558` "Unsupported POS V3 payload" dumps `payload.raw`; `AdminOrderQrScanner.vue:295-301` scanner modal footer: "Engine: {{ activeEngine || 'auto' }} · Supports payloads: `order:<number>`, `booking:<uuid>`…" — developer documentation inside the staff scan dialog.
- **[MED] Zero i18n in POS V3** (project-rule violation + mixed-language UI): no V3 file imports `useI18n`/`t()`; hardcoded Thai/English mixes — `index.vue:813` "Draft การจองที่สร้างแล้ว", `:687` "Operational Entry Shell", `DraftContainer.vue:391-394` "Create Future Rental Booking / สร้าง Draft booking ล่วงหน้า…", `PickupContainer.vue:112-116` Thai blocking reasons vs English section labels (`:270` "Rental fee"); `QrContainer.vue:446` Thai title + English description mid-flow.
- **[MED] Keyboard-heavy input / missing numeric keypads:** no `inputmode` anywhere in `app/components/admin/pos/` or the page (grep: zero hits). Walk-in phone `DraftContainer.vue:561-565` `<UInput v-model="walkInPhone" … placeholder="0812345678" />` — no `type="tel"`/`inputmode`, full QWERTY for a phone number. Manual resolvers expect typed UUIDs (`ResolverPanel.vue:64` `placeholder="booking:<id> or booking ID"`, `:84`; `index.vue:436` rejects non-UUID `isUuidLike`) — scanner is the only realistic path; there is no phone fallback. Correctly numeric: cash tendered `CashContainer.vue:515-523` `type="number" :min="0" :step="1"`; pickup cash `PickupContainer.vue:358-363`; checklist number `AdminBookingChecklists.vue:394`. (`type="number"` on iPad shows the number row, not the large keypad; `inputmode="decimal"` would.)

### P5.5 Viewport / PWA / scroll

- **[MED] Viewport meta:** no custom viewport in `nuxt.config.ts:6-13` (`app.head` sets only `htmlAttrs["data-color-mode-forced"]` + favicon) — Nuxt default `width=device-width, initial-scale=1`. iOS Safari auto-zooms on focus of inputs with font-size < 16px — UInput default renders `text-sm` (14px), affecting resolver fields and cash inputs.
- **[MED/LOW] PWA/fullscreen: none.** `nuxt.config.ts:45-54` module list has no PWA module; no manifest, no `apple-mobile-web-app-*` meta, no fullscreen API. POS runs in a normal Safari tab with browser chrome consuming height.
- **[LOW] Nested scroll:** `PendingWorkList.vue:69` `max-h-80 space-y-2 overflow-y-auto pr-1` — 320px inner scroll region inside page scroll.
- **[LOW] Fixed-px media:** QR image `QrContainer.vue:487` `h-72 w-72` (288px), skeleton `:430`; `PickupDepositQrCard.vue:341` `h-56 w-56`; scanner video `AdminOrderQrScanner.vue:271` `aspect-square w-full max-w-sm`. All fit both viewports.
- **Correct:** signature pad `DigitalSignaturePad.vue:88` `touch-none` with pointer events (`:89-92`), canvas rescales on resize (`:76-79` — covers orientation change); scanner `getUserMedia({ video: { facingMode: { ideal: "environment" } } })` (`AdminOrderQrScanner.vue:148-149`), `playsinline` (`:276`).

---

## Summary

### Finding counts by severity

Severity scale: **HIGH** = blocks the V3 target (money integrity, iPad usability, launch-blocking absence) · **MED** = significant friction/debt that will compound per slice · **LOW** = polish/hygiene.

| Severity | Count | Findings |
|---|---|---|
| **HIGH** | 8 | (1) Sale mode entirely DEAD — button with zero template branches (P1.2/P3.2); (2) KYC mode entirely DEAD — same (P1.2/P3.1); (3) Return/settlement MISSING in V3 — no UI, backend endpoint uncalled (P1.2); (4) Cash-path W1→W2 crash gap: money collected, booking stuck in `draft`, unrecoverable by retry (same-key short-circuits, new-key blocked by one-paid index) (P2.5) — **status: pending reproduction test** (first task of V3-0); (5) Checklist pickup controls at ~24px incl. icon-only trash adjacent to Open/Hide (P5.2); (6) Calendar day cells 24×24px for the core booking gesture (P5.2); (7) Dev-facing phase banners shown to front-desk staff on every screen (P5.4); (8) Raw error/status codes (`ZERO_BOOKING_DEPOSIT_FINALIZATION_NOT_ENABLED`, `paid_confirm_failed`, `[500] …`, raw payload dumps) surfaced verbatim (P5.4) |
| **MED** | 12 | (9) V3 draft creation depends on 3 v1-namespace endpoints (P1.3); (10) V3 pickup gate depends on v2 `pickup-readiness` (P1.3); (11) W3 booking-update error never checked — silent degradation path (P2.5); (12) Doc-task insert errors swallowed → issuance can proceed untracked (P2.3); (13) No mode abstraction — 11 touchpoints per new mode, duplicated type union (P3.3/P3.4); (14) Mode state non-persisted — reload resets to booking (P3.1); (15) Branch selection trapped inside DraftContainer, not shareable across modes (P3.3); (16) Staff identity absent from V3 UI layer (P3.3); (17) PickupContainer ungated by mode — renders during "sale"/"kyc" (P3.2); (18) Zero i18n across all V3 files, mixed Thai/English (P5.4); (19) No `inputmode`/`type="tel"`; UUID typing required for manual resolve (P5.4); (20) Admin nav header consumes first screen at 1024×768 + resolver below fold + input-focus auto-zoom + no PWA/fullscreen (P5.1/P5.5) |
| **LOW** | 6 | (21) `md:grid-cols-4` UUID grid cramped at 820 portrait (P5.1); (22) Hover-only affordance on payment/asset cards (P5.3); (23) Nested `max-h-80` scroll region (P5.5); (24) Source-string test assertions (`admin-pos-v3-ui.spec.ts:34-39, 482-485, 597-611`) dictate template formatting (P3.4); (25) Scanner parses 8 payload kinds, page supports 2 (P1.2); (26) Stale-fixture test debt: 4 qr-webhook + 12 remaining-security-deposit + 1 pos-v2 date-rot + 1 pickup-completion arithmetic (P2.7, re-verified) |

Verified non-findings worth recording: all WIRED flows in P1.2 are genuinely end-to-end behind `requirePlatformAdmin`; QR-path recovery is idempotent and webhook-independent (poll reconciliation); the deposit flow's idempotency inventory (P2.5) is thorough; exactly one DB RPC (`f_next_document_number`) is in any V3 code path; `verify_kyc_profile`/`revoke_kyc_profile` re-confirmed orphaned.

### Low-confidence items requiring auditor re-verification

1. **@nuxt/ui pixel heights** (P5.2): xs ≈ 24px / sm ≈ 28–32px / md ≈ 32–36px are library-default approximations, not measured renders. Verify against the project's @nuxt/ui version/theme config before treating specific px values as fact (the "below 44px" conclusion is safe; exact numbers are not).
2. **Admin-nav "consumes the first screen" at 1024×768** (P5.1): reasoned from class structure (`py-6` + `mb-6` panel + 4–6 stacked nav groups), not from a rendered viewport. A Playwright screenshot at 1024×768 would confirm.
3. **Cash W1→W2 crash gap** (P2.5, HIGH finding 4): traced statically through `booking-deposit-payments.post.ts:150-168, 222-243` and migration `087:41-43`; not reproduced against a live DB. The code reading is consistent, but the exact 23505 → 500 behavior of the new-key retry deserves a reproduction test before being cited in planning.
4. **iOS input-focus auto-zoom** (P5.5): depends on UInput's rendered font-size actually being < 16px in this theme; inferred from @nuxt/ui `text-sm` default, not verified in a browser.
5. ~~**Approximate line refs** marked with `~`~~ — RESOLVED 2026-07-09: grep of this file's body shows no `~`-marked line refs (remaining `~` are px/count approximations covered by items 1–2). The two `~` line refs in the prior audit (2026-07-08) were verified against staging and pinned: `admin-rental-operational-documents.ts` guard block = `assertIssueState` `:55-77` (pickup message `:65`); `kyc_profiles` CREATE TABLE = migration `105:73`.
6. **Exhaustiveness of the RPC sweep** (P1.4): based on `grep -rn '\.rpc('` — would miss dynamically-constructed RPC names (none observed, but not provable by grep).
7. **"No Pinia stores anywhere"** (P1.1): based on `grep -rn "defineStore" app --include="*.ts"` — does not cover potential `.vue`-file stores or non-standard patterns (none expected in this codebase).
8. **Line-count figures** for component files (P1.1) were read at audit time on branch `staging` and will drift with any edit.
