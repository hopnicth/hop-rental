# Document Foundation Implementation Design

Last updated: 2026-05-10

Status: **PARTIAL IMPLEMENTATION / FOUNDATION EXISTS** as of 2026-05-13.

Reality sync:

- **DONE / code-present:** migration `068_document_foundation_tax_profiles_allocations.sql` creates `system_configs`, `branch_document_settings`, `customer_tax_profiles`, `document_sequences`, `official_documents`, `document_events`, and `payment_allocations` with service-role policies.
- **PARTIAL:** admin operational rental pickup/return document preview/issue/print uses the foundation and stores immutable snapshots/events.
- **NOT DONE:** document settings UI, full customer tax-profile workflow, official receipt/tax invoice/WHT productization, void/reissue workflow, POS history related-document menu, refund workflow, and daily closing reports.
- Treat the table designs below as the foundation reference, but verify current migration `068` before coding because the implemented migration is authoritative for exact constraints.

## Safeguards / Confirmed Decisions

Add these safeguards before implementation:

1. Use **global document numbering first**. Branch-specific legal numbering can be added later only if accounting/legal requirements need it.
2. `official_documents` snapshots are mutable only while `status = 'draft'`. After issue, snapshots are immutable and reprint must render from the stored snapshot only.
3. Use clear document statuses: `draft`, `issued`, `printed`, `voided`, `replaced`.
4. `payment_allocations` must include payment source/reference fields for reconciliation.
5. Refund allocations must link back to the original allocation being refunded.
6. Security deposit allocations must support lifecycle tracking: `held`, `partially_used`, `refunded`, `forfeited`, `cancelled`.
7. Reprint after first print requires a reason and must create a `document_events` audit log.
8. Do not break current POS/order/rental booking fields. Write new allocation rows in parallel first and compare totals before switching reports.

## Scope

This design covers the first implementation batch only:

1. Database Foundation for document generation.
2. Customer Tax Profile.
3. Payment Allocation ledger.

It does **not** implement UI, print templates, full tax invoice issue flow, refund workflow, or daily closing yet. Those will depend on this foundation.

## Existing System Fit

- Admin APIs already use service-role Supabase clients through server routes.
- POS sales are stored in `orders` with POS branch/payment fields.
- POS rentals are stored in `rental_bookings` with deposit/refund fields.
- Walk-in customers use `walk_in_customers(phone)`.
- Gateway payments use `payment_attempts` for online order payments.
- `public.update_updated_at()` already exists and should be reused.

## Migration Strategy

Recommended migration file:

- `supabase/migrations/068_document_foundation_tax_profiles_allocations.sql`

Why one migration:

- `official_documents` should reference `customer_tax_profiles`.
- `payment_allocations` should reference `official_documents`.
- Sequence RPC and document tables should be created together to avoid half-ready document state.

If preferred, this can be split into:

1. `068_document_foundation.sql`
2. `069_customer_tax_profiles.sql`
3. `070_payment_allocations.sql`

## Table 1: `system_configs`

Purpose: global key/value configuration. First key will be `document_company_profile`.

Columns:

- `key TEXT PRIMARY KEY`
- `value JSONB NOT NULL DEFAULT '{}'`
- `description TEXT NOT NULL DEFAULT ''`
- `updated_by UUID REFERENCES users(id)`
- timestamps

RLS:

- Enable RLS.
- No public policies initially.
- Read/write through admin server API only.

Notes:

- This should not replace existing specific settings tables such as `public_contact_settings`.
- Use only for global system/document config that needs flexible JSON.

## Table 2: `branch_document_settings`

Purpose: official document header override per branch.

Columns:

- `branch_id TEXT PRIMARY KEY REFERENCES store_branches(id)`
- `logo_path TEXT`
- `stamp_path TEXT`
- `company_name_th TEXT`
- `company_name_en TEXT`
- `tax_id TEXT`
- `branch_tax_code TEXT DEFAULT '00000'`
- `address_th TEXT`
- `address_en TEXT`
- `phone TEXT`
- `email TEXT`
- `footer_note TEXT`
- `print_config JSONB DEFAULT '{}'`
- `updated_by UUID REFERENCES users(id)`
- timestamps

RLS:

- Enable RLS.
- Super Admin edits through server API.
- Platform admin/staff reads resolved header through document preview/issue API, not directly.

Snapshot rule:

- When issuing a document, resolve global + branch header and store the final result in `official_documents.snapshot.header`.

## Table 3: `customer_tax_profiles`

Purpose: reusable invoice identity for full tax invoice, credit note, debit note, and advance tax invoice.

Columns:

- `id UUID PRIMARY KEY`
- `customer_user_id UUID REFERENCES users(id) ON DELETE CASCADE`
- `walk_in_phone TEXT REFERENCES walk_in_customers(phone) ON UPDATE CASCADE ON DELETE SET NULL`
- `company_id UUID REFERENCES companies(id) ON DELETE SET NULL`
- `customer_kind TEXT CHECK ('person','company')`
- `legal_name TEXT NOT NULL`
- `tax_id TEXT NOT NULL`
- `tax_id_normalized TEXT NOT NULL`
- `branch_type TEXT CHECK ('none','head_office','branch') DEFAULT 'none'`
- `branch_code TEXT NOT NULL DEFAULT ''`
- `billing_address TEXT NOT NULL`
- `phone TEXT DEFAULT ''`
- `email TEXT DEFAULT ''`
- `review_status TEXT CHECK ('draft','pending_review','approved','rejected') DEFAULT 'draft'`
- `reviewed_by UUID REFERENCES users(id)`
- `reviewed_at TIMESTAMPTZ`
- `rejection_reason TEXT DEFAULT ''`
- `is_default BOOLEAN DEFAULT false`
- created/updated by + timestamps

Constraints:

- Must reference at least one of `customer_user_id`, `walk_in_phone`, or `company_id`.
- If `branch_type = 'branch'`, `branch_code` must not be empty.
- If `customer_kind = 'person'`, `branch_type` should normally be `none`.

Indexes:

- `tax_id_normalized`
- `(customer_user_id, created_at DESC)` where user is not null
- `(walk_in_phone, created_at DESC)` where phone is not null
- `(company_id, created_at DESC)` where company is not null
- unique default profile per user
- unique default profile per walk-in phone
- optional duplicate guard: `(tax_id_normalized, branch_type, branch_code, legal_name)`

RLS:

- Enable RLS.
- No direct public writes in this batch.
- Admin server API controls create/update/approve.

Open question:

- Should customers be allowed to manage their own tax profiles later? If yes, add customer-facing RLS policies in a later migration.

## Table 4: `document_sequences`

Purpose: safe running number allocation per document type and period.

Confirmed decision:

- Start with **global numbering** per document type and period.
- Keep `branch_id` for future branch-specific legal numbering, but initial sequence allocation uses `sequence_key = 'global'`.
- Do not include branch code in document number prefix in the first implementation.

Important detail:

- Do **not** rely on `UNIQUE(document_type, branch_id, period)` if `branch_id` can be null, because PostgreSQL allows multiple nulls in unique constraints.

Recommended columns:

- `id UUID PRIMARY KEY`
- `document_type TEXT NOT NULL`
- `sequence_key TEXT NOT NULL`
- `branch_id TEXT REFERENCES store_branches(id) ON DELETE SET NULL`
- `period TEXT NOT NULL`
- `prefix TEXT NOT NULL`
- `last_number INTEGER NOT NULL DEFAULT 0`
- timestamps

Unique constraint:

- `UNIQUE(document_type, sequence_key, period)`

Sequence key rule:

- Initial implementation: `sequence_key = 'global'`.
- Future branch numbering: `sequence_key = branch_id` only if legally/accounting required.

RPC:

- `public.f_next_document_number(p_document_type TEXT, p_branch_id TEXT, p_period TEXT, p_prefix TEXT)`
- Uses `INSERT ... ON CONFLICT ... DO UPDATE SET last_number = last_number + 1 RETURNING last_number`
- Returns formatted document no: `{prefix}-{period}-{0001}`
- Ignores `p_branch_id` for sequence key in the first implementation, but may store branch context separately for future compatibility.

Example:

- `ADV-TAX-202605-0001`
- `ABB-TAX-202605-0001`

Permissions:

- Revoke public execute.
- Grant execute to `service_role` only.

## Table 5: `official_documents`

Purpose: issued official document registry and immutable snapshot store.

Columns:

- `id UUID PRIMARY KEY`
- `document_type TEXT NOT NULL`
- `document_no TEXT` nullable while draft; required from issued onward
- `status TEXT CHECK ('draft','issued','printed','voided','replaced') DEFAULT 'draft'`
- `branch_id TEXT REFERENCES store_branches(id)`
- `source_type TEXT NOT NULL`
- `source_id TEXT NOT NULL`
- `original_document_id UUID REFERENCES official_documents(id)`
- `tax_profile_id UUID REFERENCES customer_tax_profiles(id)`
- `customer_user_id UUID REFERENCES users(id)`
- `walk_in_phone TEXT REFERENCES walk_in_customers(phone)`
- `company_id UUID REFERENCES companies(id)`
- `issued_at TIMESTAMPTZ DEFAULT now()`
- `issued_by UUID REFERENCES users(id)`
- `voided_at TIMESTAMPTZ`
- `voided_by UUID REFERENCES users(id)`
- `void_reason TEXT`
- `subtotal NUMERIC(12,2) DEFAULT 0`
- `vat_amount NUMERIC(12,2) DEFAULT 0`
- `total_amount NUMERIC(12,2) DEFAULT 0`
- `currency_code TEXT DEFAULT 'THB'`
- `template_key TEXT NOT NULL`
- `template_version INTEGER DEFAULT 1`
- `snapshot JSONB NOT NULL DEFAULT '{}'`
- `idempotency_key TEXT`
- `print_count INTEGER DEFAULT 0`
- `last_printed_at TIMESTAMPTZ`
- timestamps

Indexes:

- `(source_type, source_id, issued_at DESC)`
- `(branch_id, issued_at DESC)`
- `(document_type, issued_at DESC)`
- `(tax_profile_id, issued_at DESC)`
- unique partial `document_no` where `document_no IS NOT NULL`
- partial unique `(source_type, source_id, document_type, idempotency_key)` where `idempotency_key IS NOT NULL`

Snapshot rule:

- Draft snapshot may change while `status = 'draft'`.
- Issue API writes final snapshot and changes status to `issued` in one server-side operation.
- After status becomes `issued`, `printed`, `voided`, or `replaced`, snapshot must not be changed.
- After leaving `draft`, core fields are immutable: document number, snapshot, source reference, tax profile, customer identity references, totals, and template key/version.
- Reprint reads `snapshot` only.
- Void does not delete or reuse document number.
- Replaced document keeps original number and links to replacement via `original_document_id` / replacement metadata.

RLS:

- Enable RLS.
- No direct public access in this batch.
- Admin server APIs enforce branch access.

## Table 6: `document_events`

Purpose: audit log for document lifecycle.

Columns:

- `id UUID PRIMARY KEY`
- `document_id UUID NOT NULL REFERENCES official_documents(id) ON DELETE CASCADE`
- `event_type TEXT CHECK ('draft_created','issued','printed','reprinted','voided','replaced','previewed')`
- `staff_user_id UUID REFERENCES users(id)`
- `reason TEXT`
- `metadata JSONB DEFAULT '{}'`
- `created_at TIMESTAMPTZ DEFAULT now()`

Indexes:

- `(document_id, created_at DESC)`
- `(staff_user_id, created_at DESC)`
- `(event_type, created_at DESC)`

Status update rule:

- `printed/reprinted` events can increment `official_documents.print_count` and update `last_printed_at` in API or RPC.
- First print can create `printed` event without reason.
- Reprint after `print_count > 0` must include a non-empty reason and create `reprinted` event.

## Table 7: `payment_allocations`

Purpose: ledger for how money is applied to orders/bookings/documents.

Why needed:

- Current POS fields store summarized payment/deposit values.
- Real accounting needs multiple payments/refunds/fees against one source.

Columns:

- `id UUID PRIMARY KEY`
- `source_type TEXT NOT NULL`
- `source_id TEXT NOT NULL`
- `branch_id TEXT REFERENCES store_branches(id)`
- `direction TEXT CHECK ('in','out')`
- `allocation_type TEXT CHECK (...)`
- `status TEXT CHECK ('pending','confirmed','cancelled','reversed') DEFAULT 'confirmed'`
- `vat_treatment TEXT CHECK ('no_vat','vat_inclusive','vat_exclusive','exempt','out_of_scope')`
- `net_amount NUMERIC(12,2) NOT NULL DEFAULT 0`
- `vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0`
- `gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0`
- `currency_code TEXT DEFAULT 'THB'`
- `payment_method TEXT`
- `payment_reference TEXT DEFAULT ''`
- `payment_source_type TEXT`
- `payment_source_id TEXT`
- `external_reference TEXT DEFAULT ''`
- `proof_storage_bucket TEXT`
- `proof_storage_path TEXT`
- `proof_url TEXT`
- `payment_attempt_id UUID REFERENCES payment_attempts(id)`
- `related_document_id UUID REFERENCES official_documents(id)`
- `original_allocation_id UUID REFERENCES payment_allocations(id)`
- `reversal_of_allocation_id UUID REFERENCES payment_allocations(id)`
- `deposit_lifecycle_status TEXT`
- `staff_user_id UUID REFERENCES users(id)`
- `allocated_at TIMESTAMPTZ DEFAULT now()`
- `idempotency_key TEXT`
- `notes TEXT DEFAULT ''`
- `metadata JSONB DEFAULT '{}'`
- timestamps

Allocation types:

- `security_deposit`
- `rental_advance`
- `sale_payment`
- `remaining_payment`
- `refund`
- `penalty`
- `damage_fee`
- `late_fee`
- `manual_adjustment`

Payment source/reference fields:

- `payment_source_type`: e.g. `pos_cash`, `bank_transfer`, `promptpay`, `card_terminal`, `omise_charge`, `manual`.
- `payment_source_id`: internal source ID when available.
- `payment_reference`: staff-entered reference such as transfer note or terminal slip number.
- `external_reference`: bank/card/gateway reference for reconciliation.
- `proof_*`: uploaded payment/refund proof path or URL.

Refund/original allocation rule:

- Refund allocation must set `allocation_type = 'refund'` and `direction = 'out'`.
- Refund allocation should set `original_allocation_id` to the allocation being refunded.
- `reversal_of_allocation_id` is reserved for accounting reversal/correction, not normal customer refund.

Security deposit lifecycle:

- For `allocation_type = 'security_deposit'`, use `deposit_lifecycle_status`.
- Allowed lifecycle values: `held`, `partially_used`, `refunded`, `forfeited`, `cancelled`.
- Initial received deposit starts as `held`.
- If part of deposit is used for penalty/damage, mark original deposit as `partially_used` and link penalty/refund allocations to the original allocation.
- If fully returned, mark as `refunded`.
- If fully kept, mark as `forfeited`.
- If deposit collection is cancelled before settlement, mark as `cancelled`.

Amount meaning:

- `net_amount` = before VAT / non-VAT base.
- `vat_amount` = VAT portion.
- `gross_amount` = customer cash movement amount.

Recommended check:

- `abs(gross_amount - (net_amount + vat_amount)) <= 0.01`
- Helpers should still round all allocation amounts to 2 decimals before insert.

Examples:

Security deposit 5,000, no VAT:

- direction: `in`
- allocation_type: `security_deposit`
- vat_treatment: `no_vat`
- net/gross: 5,000
- VAT: 0

Rental advance 10,700 VAT inclusive:

- direction: `in`
- allocation_type: `rental_advance`
- vat_treatment: `vat_inclusive`
- net: 10,000
- VAT: 700
- gross: 10,700

Refund 8,560 from advance:

- direction: `out`
- allocation_type: `refund`
- vat_treatment: `vat_inclusive`
- net: 8,000
- VAT: 560
- gross: 8,560

Indexes:

- `(source_type, source_id, allocated_at DESC)`
- `(branch_id, allocated_at DESC)`
- `(allocation_type, allocated_at DESC)`
- `(related_document_id)`
- `(payment_attempt_id)`
- `(original_allocation_id)`
- `(payment_source_type, payment_source_id)` where source fields are not null
- partial unique `(source_type, source_id, allocation_type, idempotency_key)` where `idempotency_key IS NOT NULL`

RLS:

- Enable RLS.
- No direct public policies initially.
- Admin server APIs enforce branch access and accounting permissions.

Compatibility with current fields:

- Do not remove current POS fields yet.
- First implementation writes allocation rows in parallel with current fields.
- Later reports should prefer `payment_allocations` and fall back to legacy fields during transition.
- Before switching reports, compare daily totals from `payment_allocations` against current POS history/accounting export totals.

## API Design for This Batch

### Foundation / Settings

- `GET /api/admin/document-settings`
- `PATCH /api/admin/document-settings`
- `GET /api/admin/branches/:branchId/document-settings`
- `PATCH /api/admin/branches/:branchId/document-settings`

Can be implemented after migration, but tables should be ready now.

### Customer Tax Profiles

- `GET /api/admin/customer-tax-profiles?query=&customerUserId=&walkInPhone=&taxId=`
- `POST /api/admin/customer-tax-profiles`
- `PATCH /api/admin/customer-tax-profiles/:id`
- `POST /api/admin/customer-tax-profiles/:id/submit-review`
- `POST /api/admin/customer-tax-profiles/:id/approve`
- `POST /api/admin/customer-tax-profiles/:id/reject`

Permission proposal:

- Staff/platform admin: create/edit draft profiles for allowed POS branch workflow.
- Super Admin/accounting: approve/reject.

### Payment Allocations

- `GET /api/admin/payment-allocations?sourceType=&sourceId=`
- `POST /api/admin/payment-allocations`
- `POST /api/admin/payment-allocations/:id/cancel`
- `POST /api/admin/payment-allocations/:id/reverse`

Permission proposal:

- Staff/platform admin: create normal confirmed allocations during POS operations.
- Super Admin/accounting: cancel/reverse after confirmation.

## Server Utility Design

Suggested files:

- `server/utils/admin-documents.ts`
- `server/utils/admin-document-settings.ts`
- `server/utils/customer-tax-profiles.ts`
- `server/utils/payment-allocations.ts`

Core helpers:

- `normalizeTaxId(value)`
- `resolveDocumentHeader(adminClient, branchId)`
- `nextDocumentNumber(adminClient, documentType, branchId, prefix)`
- `assertCanAccessDocumentBranch(user, branchId)`
- `buildPaymentAllocationPayload(body)`

## Rollout Plan

### Step 1: Migration only

- Add tables, indexes, triggers, RLS, and sequence RPC.
- No UI behavior changes yet.

### Step 2: Read/write APIs

- Customer tax profile CRUD.
- Payment allocation CRUD.
- Document settings read/write can be minimal.

### Step 3: POS parallel write

- When POS sale is created, insert `sale_payment` allocation.
- When POS rental deposit is created, insert either `security_deposit` or `rental_advance` based on selected payment purpose.
- Keep legacy fields for backward compatibility.

### Step 4: Reporting transition

- Add admin reports using `payment_allocations`.
- Compare totals against current POS history/accounting export before switching.

## Resolved Decisions

1. Use global document numbering first: `ADV-TAX-202605-0001`, `ABB-TAX-202605-0001`, etc.
2. Keep branch-specific legal numbering as future capability only.
3. Reprint after first print must require a reason and write `document_events`.
4. Current POS/order/rental booking fields must remain unchanged during the first rollout.

## Open Questions Before Implementation

1. Should customer tax profile approval be required before issuing full tax invoices, or only for company customers?
2. For POS rental deposit, should staff explicitly choose `Security Deposit` vs `Rental Advance`, or should it be configured per product/booking type?
3. Should customers be able to self-submit tax profiles later from storefront/account page?

## Acceptance Criteria

- Migration is idempotent where practical using `IF NOT EXISTS`.
- No document number duplication under concurrent issue requests.
- Official document snapshots can link to tax profiles and payment allocations.
- Payment allocations support both no-VAT deposits and VAT-inclusive advances.
- Current POS/order/rental flows remain backward compatible.
- All tables have `updated_at` triggers where rows are mutable.
- RLS is enabled and access is controlled through server APIs.
