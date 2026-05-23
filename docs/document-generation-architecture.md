# Document Generation Architecture

Last updated: 2026-05-10

Status: **PARTIAL IMPLEMENTATION / ARCHITECTURE REFERENCE** as of 2026-05-20.

Reality sync:

- **DONE / code-present:** document foundation tables/RPC from migration `068`, generic admin document preview/issue/get/events APIs, issued document print page, operational rental pickup/return snapshot builders used from admin rental booking detail, and POS V3 Booking Deposit Confirmation (BDC) issuance/print support.
- **PARTIAL:** browser A5 print + immutable snapshot pattern is implemented for operational rental forms and the POS V3 BDC path; broader receipt/tax/WHT document workflows remain future work.
- **PARKED:** POS History related-documents integration, document list/history UI, document settings UI, void/reissue UI, and server-side PDF archive.
- **DESIGNED ONLY:** official receipt, abbreviated/full tax invoice, WHT automation, credit/debit notes, refund transactions, and daily closing reports.
- **POS V3 Phase 2D closed:** BDC issuance/printing for Booking Deposit collection is accepted as non-tax confirmation documentation. Treat receipt/tax/WHT/return-settlement documents as separate future work; acceptance guardrails live in `docs/phase-2d-booking-deposit-acceptance-checklist.md`.
- Exact runtime behavior should be checked against `app/types/admin-documents.ts`, `server/utils/admin-documents.ts`, and `server/utils/admin-rental-operational-documents.ts` before extending this architecture.

## Goal

Design a Nuxt + Supabase document generation system for Hopnic/Hop Rental that supports:

- A5 browser print for all documents.
- Super Admin configurable document header.
- Data-driven document generation from database records.
- Immutable document snapshot JSON after issue.
- Print preview with selectable original/copy/document types.
- POS History integration for related documents and reprint.

This design extends `docs/printing-document-standard.md`.

## Tooling Decision

### Recommended Primary Approach

Use **Vue Components + CSS Print Media + native `window.print()`**.

Reason:

- Best fit for A5 browser print.
- No new dependency required.
- Keeps Thai text, tables, signatures, logos, and responsive preview in normal HTML.
- Works well with Nuxt UI screens and browser print dialog.
- Easier to maintain than canvas/image-based PDF generation.

### Library / Plugin Comparison

| Tool                                     | Recommendation                         | Notes                                                                                    |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Native `window.print()` + `@media print` | **Use for MVP/production first**       | Most predictable for browser print; no dependency.                                       |
| Vue print composable/custom helper       | **Use small internal helper**          | Build `useBrowserPrint()` instead of adding plugin.                                      |
| `vue3-print-nb`                          | Not recommended as core                | Convenience wrapper only; limited value vs internal helper and may add maintenance risk. |
| `jspdf`                                  | Not recommended for official A5 layout | Good for programmatic simple PDFs, but Thai fonts/tables/CSS fidelity can be painful.    |
| `html2canvas` / `html2pdf.js`            | Avoid for official docs                | Often rasterizes output; weak text/search/print fidelity.                                |
| Playwright/Puppeteer PDF                 | Later optional                         | Good for server-side PDF archive/email, but not needed for browser print MVP.            |
| `qrcode.vue`                             | Use when needed                        | Already installed; useful for QR reference/document verification.                        |

### Nuxt Module / Library Recommendations

Do not install these until the milestone needs them. Current MVP can start with native Vue/Nuxt, Supabase, CSS print, and existing dependencies.

| Work                              | Recommended tool         | Adoption timing                                                                                  |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Form validation                   | `vee-validate` + `zod`   | When document settings/tax profile forms become complex.                                         |
| Shared state / UI workflow        | `pinia`                  | When print preview and POS document state is shared across pages.                                |
| Utility composables               | `@vueuse/nuxt`           | Useful for media queries, file/blob helpers, clipboard, debounced refs.                          |
| Image optimization/upload preview | `@nuxt/image`            | Already installed; use for logo/stamp display, not required for signature raw storage.           |
| Thai/English UI                   | `@nuxtjs/i18n`           | Already installed; use for admin labels and bilingual document templates.                        |
| PDF from Nuxt component           | `@sidebase/nuxt-pdf`     | Later, if server-side PDF archive/email is required.                                             |
| Code/manual PDF                   | `pdfmake` or `pdf-lib`   | Later, only for controlled PDF generation; not primary A5 print path.                            |
| A5 print                          | CSS `@media print`       | Use first; no print plugin required.                                                             |
| Admin data tables                 | `@tanstack/vue-table`    | When document list/end-of-day report needs sorting/filtering at scale.                           |
| Date handling                     | `dayjs`                  | When date/time formatting logic grows beyond native `Intl`.                                      |
| QR code                           | `qrcode.vue` or `qrcode` | `qrcode.vue` already installed for Vue rendering; `qrcode` optional for server image generation. |
| Excel export                      | `xlsx`                   | When accounting needs `.xlsx`, not only CSV.                                                     |
| CSV export                        | `papaparse`              | When CSV escaping/import/export logic becomes more complex.                                      |

Practical rule: start with **HTML A5 Template -> Print Preview -> Browser Print / Save as PDF -> Snapshot in Database -> Reprint from Snapshot**. Add server-side PDF only after the document workflow is stable.

### Final Tool Stack

- Nuxt page/component templates for each document type.
- `@nuxt/ui` for Admin settings and preview controls.
- Supabase tables for settings, sequences, official documents, and audit events.
- Supabase Storage bucket for logos and signature images.
- Internal print helper: `useBrowserPrint()`.
- CSS print media: A5 page sizing, page breaks, screen/print visibility classes.

## High-Level Architecture

```text
Admin Settings UI
  -> /api/admin/document-settings
  -> system_configs / branch_document_settings
  -> Supabase Storage logos

POS / Rental / Order / Payment
  -> /api/admin/documents/preview
  -> document snapshot builder (draft, no official number)
  -> Vue A5 print preview
  -> staff selects document type + original/copy
  -> /api/admin/documents/issue
  -> sequence allocation + official_documents snapshot lock
  -> browser print
  -> document_events audit log

POS History
  -> /api/admin/pos/history
  -> includes relatedDocuments from official_documents/document_links
  -> View/Reprint from locked snapshot
```

## Configurable Header Design

### Configuration Scope

Use two layers:

1. `system_configs` for global legal/company defaults.
2. `branch_document_settings` for branch-specific document header override.

Reason: `store_branches` already has branch name/address/phone, but official print headers need versioned legal/tax/logo data and may differ by branch.

### Header Resolution Rule

When generating a document snapshot:

1. Load global company config from `system_configs`.
2. Load branch config from `branch_document_settings`.
3. Merge branch overrides over global defaults.
4. Save the resolved header into `official_documents.snapshot.header`.

After issue, never re-read current header for that document except to create a new document.

### Header Fields

- Logo URL / storage path.
- Company legal name TH/EN.
- Branch name/code.
- Address TH/EN.
- Tax ID.
- Branch tax code, e.g. head office / branch number.
- Phone/email.
- Footer note.
- Company stamp image URL if used.

## Database Schema Design

### `system_configs`

Single or multi-key table for global settings.

```sql
CREATE TABLE public.system_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Recommended key: `document_company_profile`.

### `branch_document_settings`

Branch-level document header and print preferences.

```sql
CREATE TABLE public.branch_document_settings (
  branch_id TEXT PRIMARY KEY REFERENCES public.store_branches(id) ON DELETE CASCADE,
  logo_path TEXT,
  stamp_path TEXT,
  company_name_th TEXT NOT NULL DEFAULT '',
  company_name_en TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  branch_tax_code TEXT NOT NULL DEFAULT '00000',
  address_th TEXT NOT NULL DEFAULT '',
  address_en TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  footer_note TEXT NOT NULL DEFAULT '',
  print_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `document_sequences`

Controls running numbers per document type, branch, and period.

```sql
CREATE TABLE public.document_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  period TEXT NOT NULL,
  prefix TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_type, branch_id, period)
);
```

Sequence allocation must happen server-side inside a transaction/RPC to prevent duplicate numbers.

### `official_documents`

Main issued document table.

```sql
CREATE TABLE public.official_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  document_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'issued',
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  original_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  customer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  walk_in_phone TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  void_reason TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  template_key TEXT NOT NULL,
  template_version INTEGER NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('issued','printed','reprinted','voided'))
);
```

Recommended indexes:

- `(source_type, source_id)` for POS History related documents.
- `(branch_id, issued_at DESC)` for branch report.
- `(document_type, issued_at DESC)` for accounting/export.

### `document_events`

Audit log for issue, print, reprint, void.

```sql
CREATE TABLE public.document_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.official_documents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (event_type IN ('issued','printed','reprinted','voided','previewed'))
);
```

### `document_signatures`

Optional table if signatures need reuse/query outside snapshot.

```sql
CREATE TABLE public.document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  signer_role TEXT NOT NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  signature_path TEXT NOT NULL,
  collected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

### `customer_tax_profiles`

Stores reusable tax invoice identities for users, walk-in customers, and companies.

```sql
CREATE TABLE public.customer_tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  walk_in_phone TEXT,
  customer_kind TEXT NOT NULL DEFAULT 'person',
  legal_name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  branch_type TEXT NOT NULL DEFAULT 'head_office',
  branch_code TEXT NOT NULL DEFAULT '00000',
  billing_address TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'draft',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (customer_kind IN ('person','company')),
  CHECK (branch_type IN ('head_office','branch')),
  CHECK (review_status IN ('draft','pending_review','approved','rejected'))
);
```

### `tax_invoice_requests`

Tracks requests for full tax invoice after abbreviated tax invoice or POS sale.

```sql
CREATE TABLE public.tax_invoice_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  abbreviated_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  tax_profile_id UUID REFERENCES public.customer_tax_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  issued_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending','approved','issued','rejected','cancelled'))
);
```

### `payment_allocations`

Records how each payment/refund amount is allocated for accounting and documents.

```sql
CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in',
  allocation_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  payment_method TEXT,
  payment_reference TEXT NOT NULL DEFAULT '',
  related_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  staff_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (direction IN ('in','out')),
  CHECK (allocation_type IN ('security_deposit','rental_advance','remaining_payment','refund','penalty','damage_fee','late_fee','sale_payment'))
);
```

### `refund_transactions`

First-class refund workflow table.

```sql
CREATE TABLE public.refund_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  refund_amount NUMERIC(12,2) NOT NULL CHECK (refund_amount >= 0),
  refund_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL DEFAULT '',
  credit_note_document_id UUID REFERENCES public.official_documents(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (refund_method IN ('cash','bank_transfer','card','promptpay','qr_transfer','other')),
  CHECK (status IN ('pending','approved','paid','failed','cancelled'))
);
```

### `daily_closing_reports`

Stores end-of-day report snapshots after staff closes a POS day.

```sql
CREATE TABLE public.daily_closing_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT REFERENCES public.store_branches(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, report_date),
  CHECK (status IN ('draft','closed','reopened','voided'))
);
```

## Document Types

Use a fixed enum-like document type list in application code first, then optionally database enum later.

| Type                       | Prefix    | Source                                           |
| -------------------------- | --------- | ------------------------------------------------ |
| `delivery_acceptance_note` | `DNA`     | `rental_booking`                                 |
| `return_receiving_note`    | `RTN`     | `rental_booking`                                 |
| `advance_tax_invoice`      | `ADV-TAX` | `payment` / `rental_booking` / `order`           |
| `credit_note`              | `CN`      | original `official_document` + refund/payment    |
| `quotation`                | `QT`      | `order` / quotation source                       |
| `delivery_note`            | `DN`      | `order`                                          |
| `tax_invoice_receipt`      | `TAX`     | `order` / payment                                |
| `abbreviated_tax_invoice`  | `ABB-TAX` | `order` / POS sale                               |
| `receipt`                  | `RCPT`    | `payment`                                        |
| `debit_note`               | `DN-TAX`  | original `official_document` + additional charge |

## Operational Requirements to Merge

The first architecture covers document generation, but real POS/accounting operation needs these additional capabilities.

### 1. Customer Tax Profile

Store invoice identity separately from basic customer/contact data.

Required fields:

- Customer kind: natural person / company.
- Legal name.
- Tax ID.
- Branch type: head office / branch.
- Branch code.
- Billing address.
- Contact phone/email.
- Verification/review status if accounting approval is needed.

Use this profile when issuing full tax invoice, credit note, debit note, and advance tax invoice.

### 2. Full Tax Invoice Request

Support the case where a customer first receives an abbreviated tax invoice, then requests a full tax invoice later.

Rules:

- Keep link to original abbreviated tax invoice.
- Collect customer tax profile before issuing full tax invoice.
- Track request status: pending, approved, issued, rejected, cancelled.
- Prevent duplicate full tax invoice issuance for the same abbreviated tax invoice unless Super Admin overrides with audit reason.

### 3. Abbreviated Tax Invoice

Use for POS retail/web sales when customer does not request full tax invoice.

Rules:

- Default for walk-in/natural person POS sale.
- Can be upgraded/requested into full tax invoice flow later.
- Must be included in end-of-day VAT and document summary.

### 4. Debit Note

Use when increasing debt after original invoice, such as:

- Additional rental charge.
- Late return fee.
- Damage fee.
- Missing accessory fee.
- Price difference after invoice.

Rules:

- Must reference original tax invoice or related document.
- Must record reason and tax impact.
- May require accountant confirmation for VAT treatment by fee type.

### 5. Refund Workflow

Refunds should be first-class records, not only fields on booking/order.

Required fields:

- Refund amount.
- Refund method: cash, bank transfer, card, PromptPay/QR, other.
- Refund status: pending, approved, paid, failed, cancelled.
- Reference payment/refund slip.
- Related credit note if VAT document is required.
- Approved by / paid by staff IDs.

### 6. Payment Allocation

One source can have many money movements:

- Deposit/security deposit.
- Rental advance.
- Remaining payment.
- Partial payment.
- Refund.
- Penalty/damage fee.

Each payment should allocate to a purpose and optionally link to a document. This makes accounting export and credit/debit note workflows reliable.

### 7. Document Permission

Separate permissions by action:

- Preview.
- Issue.
- Print.
- Reprint.
- Void.
- Approve tax profile.
- Approve refund.

Recommended policy:

- Staff with branch access: preview/issue/print allowed branch documents.
- Super Admin/accounting: void, approve tax profile, approve refund, manage settings.
- Reprint may be staff-allowed but must always log event and reason if required.

### 8. End-of-day Report

POS needs daily closing reports that summarize:

- Total sales.
- Payment method totals.
- VAT base and VAT amount.
- Abbreviated tax invoices.
- Full tax invoices.
- Advance tax invoices.
- Credit notes.
- Debit notes.
- Refunds.
- Voided documents.
- Cash expected vs actual cash count.

This report should pull from `official_documents`, payment/refund records, and POS source records.

## Snapshot Design

### Snapshot Builder

Create server-side builders by source and document type:

- `buildDeliveryAcceptanceSnapshot(bookingId)`.
- `buildReturnReceivingSnapshot(bookingId)`.
- `buildAdvanceTaxInvoiceSnapshot(source)`.
- `buildCreditNoteSnapshot(originalDocumentId, refundInput)`.
- `buildSaleTaxInvoiceSnapshot(orderId)`.

The builder reads current database data and returns normalized JSON. The issued document stores this JSON permanently.

### Snapshot Shape

```json
{
  "schemaVersion": 1,
  "header": {},
  "document": {},
  "customer": {},
  "source": {},
  "items": [],
  "payment": {},
  "tax": {},
  "signatures": [],
  "relatedDocuments": []
}
```

Rules:

- Preview snapshot may be temporary and have no official number.
- Issue snapshot must include official document number and issued timestamp.
- Reprint always renders from `official_documents.snapshot`, not from live master data.
- Snapshot should include `template_key` and `template_version` to preserve layout compatibility.

## API Design

### Settings APIs

| Endpoint                                          | Method | Role        | Purpose                                         |
| ------------------------------------------------- | ------ | ----------- | ----------------------------------------------- |
| `/api/admin/document-settings`                    | GET    | Super Admin | Load global company config and branch settings. |
| `/api/admin/document-settings`                    | PATCH  | Super Admin | Update company document header defaults.        |
| `/api/admin/branches/:branchId/document-settings` | GET    | Super Admin | Load branch override.                           |
| `/api/admin/branches/:branchId/document-settings` | PATCH  | Super Admin | Update branch document header.                  |

### Document APIs

| Endpoint                          | Method | Role                              | Purpose                                           |
| --------------------------------- | ------ | --------------------------------- | ------------------------------------------------- |
| `/api/admin/documents/preview`    | POST   | Platform Admin with branch access | Build draft snapshot for preview; no number lock. |
| `/api/admin/documents/issue`      | POST   | Platform Admin with branch access | Allocate number, save snapshot, create event.     |
| `/api/admin/documents/:id`        | GET    | Platform Admin with branch access | Load issued document and snapshot.                |
| `/api/admin/documents/:id/print`  | GET    | Platform Admin with branch access | Load data for print page.                         |
| `/api/admin/documents/:id/events` | POST   | Platform Admin with branch access | Record print/reprint event.                       |
| `/api/admin/documents/:id/void`   | POST   | Super Admin                       | Void document with reason.                        |

### Tax Profile / Request APIs

| Endpoint                                      | Method | Role                         | Purpose                                                |
| --------------------------------------------- | ------ | ---------------------------- | ------------------------------------------------------ |
| `/api/admin/customer-tax-profiles`            | GET    | Platform Admin               | Search tax profiles by customer/phone/tax ID.          |
| `/api/admin/customer-tax-profiles`            | POST   | Platform Admin               | Create tax profile for full tax invoice request.       |
| `/api/admin/customer-tax-profiles/:id`        | PATCH  | Platform Admin / Super Admin | Update profile; approval fields are accounting-only.   |
| `/api/admin/tax-invoice-requests`             | POST   | Platform Admin               | Request full tax invoice from abbreviated invoice/POS. |
| `/api/admin/tax-invoice-requests/:id/approve` | POST   | Super Admin/accounting       | Approve tax profile/request before issuing.            |
| `/api/admin/tax-invoice-requests/:id/issue`   | POST   | Platform Admin with approval | Issue full tax invoice linked to request.              |

### Payment / Refund / Report APIs

| Endpoint                         | Method | Role                                     | Purpose                                                 |
| -------------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------- |
| `/api/admin/payment-allocations` | POST   | Platform Admin                           | Record deposit/advance/remaining/refund/fee allocation. |
| `/api/admin/refunds`             | POST   | Platform Admin                           | Create refund request.                                  |
| `/api/admin/refunds/:id/approve` | POST   | Super Admin/accounting                   | Approve refund.                                         |
| `/api/admin/refunds/:id/pay`     | POST   | Super Admin/accounting or permitted role | Mark refund as paid and link credit note if needed.     |
| `/api/admin/daily-closing`       | GET    | Platform Admin with branch access        | Preview end-of-day report from live records.            |
| `/api/admin/daily-closing`       | POST   | Super Admin/accounting or branch manager | Close day and save report snapshot.                     |

### Issue Request Shape

```json
{
  "sourceType": "rental_booking",
  "sourceId": "...",
  "documentType": "delivery_acceptance_note",
  "branchId": "branch-hq",
  "idempotencyKey": "client-generated-key",
  "options": {
    "includeOriginal": true,
    "includeCopy": true
  }
}
```

## Frontend Architecture

### Suggested Files

```text
app/pages/admin/document-settings.vue
app/pages/admin/documents/preview.vue
app/pages/admin/documents/[id]/print.vue
app/components/admin/documents/DocumentPrintShell.vue
app/components/admin/documents/DocumentHeader.vue
app/components/admin/documents/OriginalCopyBadge.vue
app/components/admin/documents/templates/DeliveryAcceptanceNote.vue
app/components/admin/documents/templates/ReturnReceivingNote.vue
app/components/admin/documents/templates/AdvanceTaxInvoice.vue
app/components/admin/documents/templates/CreditNote.vue
app/composables/useBrowserPrint.ts
app/types/documents.ts
```

### Print Preview UX

The preview page should have two areas:

1. Screen-only control panel.
2. A5 document preview area.

Controls:

- Document type checkboxes: delivery note, advance tax invoice, receipt, credit note, etc.
- Copy selection: original, copy, both.
- `Preview Draft` button.
- `Issue Document` button.
- `Print Selected` button.
- `Reprint` button for issued documents.

### Print Selection Rule

Each printable page is a `.print-page` with metadata:

- `data-document-type`.
- `data-copy-kind="original|copy"`.
- `data-print-selected="true|false"`.

CSS hides unselected pages during print.

### A5 CSS Standard

```css
@page {
  size: A5 portrait;
  margin: 8mm;
}

@media print {
  .screen-only {
    display: none !important;
  }
  .print-page {
    break-after: page;
    page-break-after: always;
  }
  .print-page[data-print-selected="false"] {
    display: none !important;
  }
}
```

### Internal Print Helper

Create a small composable instead of installing a print plugin.

```ts
export function useBrowserPrint() {
  const print = async () => {
    await nextTick();
    window.print();
  };
  return { print };
}
```

## POS History Integration

### Current State

`app/pages/admin/pos.vue` already shows POS Transaction History and has print placeholder buttons for Full/Abbrev. `server/api/admin/pos/history.get.ts` returns sale/rental rows from `orders` and `rental_bookings`.

### Target Mapping

Extend POS history items with `relatedDocuments`.

```json
{
  "id": "...",
  "type": "sale",
  "documentNo": "ORD-...",
  "relatedDocuments": [
    {
      "id": "...",
      "documentType": "abbreviated_tax_invoice",
      "documentNo": "ABB-TAX-202605-0001",
      "status": "printed",
      "issuedAt": "...",
      "canReprint": true
    }
  ]
}
```

### Source Mapping

| POS row type   | Source table                         | `source_type`        | `source_id`          | Common documents                                                        |
| -------------- | ------------------------------------ | -------------------- | -------------------- | ----------------------------------------------------------------------- |
| `sale`         | `orders`                             | `order`              | `orders.id`          | abbreviated/full tax invoice, receipt, delivery note                    |
| `rental`       | `rental_bookings`                    | `rental_booking`     | `rental_bookings.id` | delivery acceptance, return receiving, advance tax invoice, credit note |
| payment/refund | payment table or booking/order field | `payment` / `refund` | payment/refund id    | receipt, credit note                                                    |

### POS UI Behavior

Replace placeholder buttons with a `Documents` action menu:

- `Create / Print`: if no related document exists.
- `View`: open issued document snapshot.
- `Reprint`: open print page with reprint mark and record event.
- `Void`: Super Admin only.

For a sale with no tax profile:

- Default action: issue abbreviated tax invoice.
- If customer asks full tax invoice: open tax profile form first, then issue full tax invoice.

For a rental:

- Before pickup: issue delivery acceptance note and/or advance tax invoice.
- On return: issue return receiving note.
- On refund/cancellation of rental advance: issue credit note referencing original advance tax invoice.

## Security / Permissions

- Super Admin only:
  - Edit document settings.
  - Void official documents.
  - Manage branch header overrides.
- Platform Admin/Staff with branch access:
  - Preview and issue documents for allowed branch.
  - Print/reprint allowed branch documents.
- Server APIs must use service role for sequence allocation and snapshot creation.
- Client must never allocate official document numbers.

## Storage Buckets

Recommended buckets:

| Bucket                | Purpose                           | Access                                        |
| --------------------- | --------------------------------- | --------------------------------------------- |
| `document-assets`     | logo, stamp, static header images | Admin write, authenticated read or signed URL |
| `document-signatures` | customer/staff signature images   | Admin write/read via server or signed URL     |

Store paths in DB and resolved URLs in snapshot at issue time if stable. If using signed URLs, store path in snapshot and resolve on render.

## Milestones

### Milestone 1 — Database Foundation

1. Create `system_configs` or reuse if added later.
2. Create `branch_document_settings`.
3. Create `document_sequences`.
4. Create `official_documents`.
5. Create `document_events`.
6. Create `document_signatures` if signature capture is in the same milestone.
7. Add indexes for `source_type/source_id`, `branch_id/issued_at`, and `document_type/issued_at`.
8. Add sequence allocation RPC or transactional server function.

### Milestone 2 — Admin Settings UI

1. Add document settings page under Admin Settings or new Document Settings page.
2. Add logo/stamp upload to Supabase Storage.
3. Add global company profile form.
4. Add branch override form.
5. Add preview card showing resolved A5 header.

### Milestone 3 — Snapshot Builders + APIs

1. Define document types and TypeScript snapshot types.
2. Build snapshot builders for delivery acceptance, return receiving, advance tax invoice, and credit note.
3. Implement preview API that returns draft snapshot.
4. Implement issue API that allocates number and locks snapshot.
5. Implement document get/print/reprint/void APIs.

### Milestone 4 — A5 Print Templates

1. Build shared `DocumentPrintShell` and `DocumentHeader`.
2. Build template for delivery acceptance note with original/copy.
3. Build template for return receiving note with staff receiver ID.
4. Build template for advance tax invoice.
5. Build template for credit note.
6. Add A5 print CSS and selection rules.
7. Test on target browser/printer with A5 paper.

### Milestone 5 — Print Preview & Selection UI

1. Add preview route that accepts `sourceType`, `sourceId`, and document type list.
2. Add document type selection checkboxes.
3. Add original/copy selection.
4. Add `Issue`, `Print Selected`, and `Reprint` buttons.
5. Record print/reprint events.

### Milestone 6 — POS History Integration

1. Extend POS history API to fetch related documents by `source_type/source_id`.
2. Replace Full/Abbrev placeholders with Documents menu.
3. Add quick actions: create, view, reprint, void.
4. Add badges for issued/printed/voided documents.
5. Ensure reprint uses official snapshot, not live order/booking data.

### Milestone 7 — Accounting / Compliance Hardening

1. Confirm document wording and VAT/Credit Note handling with accountant.
2. Add export filters by document type/date/branch.
3. Add void report.
4. Add duplicate prevention/idempotency keys for issue API.
5. Add automated tests for sequence allocation and snapshot immutability.

### Milestone 8 — POS Tax Invoice / Refund / Daily Report

This milestone is required before POS retail is considered operationally complete.

1. Add customer tax profile CRUD and approval/review workflow.
2. Add full tax invoice request flow from abbreviated tax invoice.
3. Add abbreviated tax invoice as default POS retail document.
4. Add debit note for additional charges, penalties, and damage fees.
5. Add refund transaction workflow with method/status/proof and credit note link.
6. Add payment allocation records for deposit, advance, remaining payment, refund, penalty, and sale payment.
7. Add document permission checks for issue, void, reprint, approve tax profile, and approve refund.
8. Add end-of-day report preview and close-day snapshot.
9. Add CSV/Excel export for daily sales, VAT, credit note, debit note, refund, and void summary.
10. Add tests for abbreviated-to-full tax invoice request, refund + credit note, debit note, and daily report totals.

## Implementation Priority

Recommended first implementation order:

1. Settings + header resolution.
2. Official document tables + sequence allocation.
3. Customer tax profile foundation.
4. Payment allocation foundation.
5. Delivery acceptance note and return receiving note.
6. Advance tax invoice and abbreviated tax invoice.
7. Credit note, debit note, and refund workflow.
8. POS History related documents/reprint.
9. End-of-day report.
10. Optional server-side PDF archive later.
