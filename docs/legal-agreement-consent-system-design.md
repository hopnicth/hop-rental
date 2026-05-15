# Legal Agreement & Consent System Design

Last updated: 2026-05-10

Status: **PARTIAL FOUNDATION / LEGAL COPY STILL DRAFT** as of 2026-05-13.

Reality sync:

- **DONE / migration-present:** `069_legal_agreement_consent_foundation.sql` adds agreement versions, immutable acceptance logs, evidence files, helper RPC, guards, and service-role-only RLS.
- **NOT DONE:** admin/legal content management UI, customer-facing agreement presentation, acceptance logging integration in checkout/POS/KYC, final legal/PDPA review, and production legal copy.
- Treat this document as the design reference for taxonomy and evidence policy, not as final legal advice or proof that UI integration is complete.

> This document designs the agreement versioning and consent logging foundation for Hopnic. It is not a migration and not final production legal copy. Review with legal/PDPA/accounting before implementation.

## 1. Scope

This design covers Phase 2 legal foundation only:

1. Agreement type taxonomy.
2. Agreement versioning and publication model.
3. Consent acceptance logs for web, checkout, KYC, damage protection, and Admin/POS assisted booking.
4. Audit/evidence strategy.
5. Recommended database tables.
6. Recommended API endpoints.

Out of scope for this document:

- Actual migration implementation.
- UI implementation.
- Final legal wording of Terms/PDPA/Rental/Damage documents.
- Full privacy request workflow, account deletion, or anonymization workflow.
- External e-signature provider integration.

## 2. Existing System Fit

Use existing entities where possible:

- Registered customers use `users(id)`.
- Walk-in customers use `walk_in_customers(phone)`.
- Rental transactions use `rental_bookings(id)`.
- Sale/quotation orders use `orders(id)`.
- Companies use `companies(id)` where company context exists.
- Official issued documents use `official_documents(id)` and immutable snapshots.
- Admin/server APIs already use service-role Supabase clients through server routes.

Do not change existing booking/order/document flows yet. Add agreement/consent tables in parallel, then wire APIs after this design is reviewed.

## 3. Agreement Types

Use stable machine slugs for all agreement types. Do not rename these after production use.

| Agreement type            | Purpose                                                                | Required at                                                 |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `terms_of_service`        | General website/account usage terms                                    | Signup, account usage                                       |
| `privacy_policy`          | PDPA/privacy notice and related consent wording                        | Signup, document upload, account privacy                    |
| `rental_agreement`        | Rental contract terms, rental period, deposit, return responsibilities | Checkout, Admin/POS booking, before rental document issue   |
| `damage_loss_policy`      | Damage, loss, late return, inspection, claim calculation               | Checkout, Admin/POS booking, return/inspection reference    |
| `damage_protection_terms` | Add-on damage protection plan terms, coverage, exclusions, limits      | Only when customer selects Damage Protection                |
| `kyc_consent`             | Consent/acknowledgement for collecting and verifying KYC documents     | Verification start, document upload, Admin/POS assisted KYC |

Notes:

- `privacy_policy` may legally be partly “notice/acknowledgement” and partly “consent”. Final wording should be reviewed by a PDPA advisor.
- `damage_protection_terms` must be accepted separately from the main rental terms.
- `kyc_consent` should be specific to identity/document verification, not a catch-all privacy policy.

## 4. Agreement Versioning Model

### Core Rules

1. Every agreement type has one or more immutable published versions.
2. Draft versions can be edited before publishing.
3. Published versions must not be edited. If wording changes, create a new version.
4. Acceptance logs must copy the agreement type, version, title, and hashes at the time of acceptance.
5. The system should resolve the active version by `agreement_type` and `effective_from`.
6. The active version at acceptance time should remain provable even after later versions are published.

### Version Naming

Recommended format:

- `v1.0` for first production version.
- `v1.1` for small wording/clarity changes.
- `v2.0` for material legal/business changes.

Do not use dates alone as versions. Dates can be stored in `effective_from`.

### Active Version Resolution

For each `agreement_type`, active published version is:

- `status = 'published'`
- `effective_from <= now()`
- `effective_until IS NULL OR effective_until > now()`
- highest `effective_from` if more than one qualifies

The API should prevent overlapping active windows for the same agreement type.

## 5. Consent Acceptance Log Model

### Core Rules

1. Consent logs are append-only and immutable.
2. A customer may have multiple acceptance logs for the same agreement type if versions or contexts differ.
3. Checkout acceptance must be tied to `booking_id` and/or `order_id` when available.
4. Admin/POS assisted acceptance must include `staff_user_id` and an evidence snapshot.
5. Web acceptance should include `ip_address` and `user_agent` when available.
6. A consent log should store both structured context and proof of the exact agreement version shown.

### Subject Identity

An acceptance can belong to:

- registered customer: `customer_user_id`
- walk-in customer: `walk_in_phone`
- company context: `company_id`

Recommended rule:

- At least one of `customer_user_id`, `walk_in_phone`, or `company_id` must be present.
- For company rentals, store both the acting user/walk-in contact and `company_id` when available.

### Transaction Link

Use direct nullable references when possible:

- `booking_id UUID REFERENCES rental_bookings(id)`
- `order_id UUID REFERENCES orders(id)`
- `official_document_id UUID REFERENCES official_documents(id)` for acceptance captured immediately before document issue or signature.

Also keep generic source fields for future-proofing:

- `source_type` examples: `signup`, `document_upload`, `checkout`, `admin_pos_booking`, `damage_protection_selection`, `rental_document_issue`
- `source_id` as text idempotency/source reference

## 6. Required Consent Flows

### 6.1 Signup Flow

Required agreements:

- `terms_of_service`
- `privacy_policy`

Flow:

1. Web UI loads active versions for both agreement types.
2. User checks a single checkbox linking to both documents.
3. Server creates user account and acceptance logs in the same logical operation.
4. Store `ip_address`, `user_agent`, route, checkbox label, and agreement versions.

Recommended checkbox copy:

> ข้าพเจ้าได้อ่านและยอมรับ Terms of Service และ Privacy Policy ของบริษัท ฮอปนิค จำกัด

### 6.2 Upload KYC Documents Flow

Required agreements:

- `kyc_consent`
- `privacy_policy` if current privacy version has not yet been acknowledged by this customer

Flow:

1. Customer opens verification/document upload page.
2. UI shows KYC consent summary and links to full PDPA/privacy policy.
3. Customer checks consent before upload submit.
4. Server stores KYC consent acceptance and document upload batch linkage.
5. Evidence snapshot stores document type list and upload batch id, not raw identity values.

Recommended checkbox copy:

> ข้าพเจ้ายืนยันว่าเอกสารที่นำส่งเป็นเอกสารจริง ถูกต้อง และเป็นปัจจุบัน และยินยอมให้บริษัทใช้เอกสารดังกล่าวเพื่อยืนยันตัวตน อนุมัติการเช่า ออกเอกสารทางบัญชี และดำเนินการที่เกี่ยวข้องกับการให้บริการ

### 6.3 Checkout Flow

Required agreements:

- `rental_agreement`
- `damage_loss_policy`

Conditional agreement:

- `damage_protection_terms` only if customer selects Damage Protection

Flow:

1. Server resolves required active agreement versions for the checkout.
2. UI shows agreement confirmation section before payment/booking confirmation.
3. Customer accepts rental and damage/loss terms.
4. If Damage Protection is selected, customer must accept separate terms.
5. Server creates acceptance logs linked to `booking_id` and/or `order_id`.

Important:

- Damage Protection acceptance must not be bundled into the main checkout checkbox.
- If checkout creates the booking after payment, store a temporary `source_id` first and backfill `booking_id` only while the log is still allowed to be linked by controlled server logic, or create acceptance after booking draft exists.

### 6.4 Damage Protection Flow

Required agreement when selected:

- `damage_protection_terms`

Evidence snapshot should include:

- selected plan id/name
- plan price
- coverage limit
- main exclusions shown to customer
- product/booking line references
- agreement version and hash

Recommended rule:

- Log acceptance only when selected.
- Store “declined/not selected” in booking/order snapshot if needed, but do not create an agreement acceptance log for non-acceptance unless legal later requests it.

### 6.5 Admin/POS Assisted Booking Flow

Required agreements depend on action:

- New walk-in/customer creation: `privacy_policy`, possibly `terms_of_service` if account is created.
- KYC/document capture: `kyc_consent`.
- Rental booking: `rental_agreement`, `damage_loss_policy`.
- Damage Protection add-on: `damage_protection_terms` separately.

Flow:

1. Staff selects registered customer or creates/chooses walk-in customer.
2. System shows required agreement checklist for the action.
3. Staff must confirm they informed the customer and customer accepted.
4. Staff selects customer confirmation channel: walk-in verbal, signed paper, Line, email, phone, or other.
5. Staff enters remark if required by channel/risk level.
6. Staff optionally uploads signed form/screenshot/email proof.
7. Server records acceptance logs with `accepted_channel = 'admin_pos'` or `staff_assisted` and `staff_user_id`.

Required Admin/POS evidence:

- checkbox by staff confirming customer was informed
- `staff_user_id`
- customer confirmation channel
- staff remark for non-web acceptance
- optional uploaded signed form/screenshot/email proof

Recommended staff checkbox copy:

> พนักงานได้แจ้งเงื่อนไขการเช่า การเก็บข้อมูล และนโยบายความเป็นส่วนตัวให้ลูกค้าทราบแล้ว และลูกค้าได้ยินยอมให้ดำเนินการจอง/เช่าในนามลูกค้า

### 6.6 Before Rental Document Issue

Required validation before issuing rental-related official documents:

- Customer identity exists: `customer_user_id` or `walk_in_phone`.
- Required checkout/Admin/POS agreements were accepted for the booking.
- Accepted versions are active at the time of booking, or explicitly allowed by business rule.
- If Damage Protection appears on the document, `damage_protection_terms` acceptance exists.

This should be a validation gate before final issue, not just a UI warning.

## 7. Audit and Evidence Strategy

### What to Store in Every Acceptance

Minimum fields:

- agreement type
- agreement version
- agreement version id
- agreement title
- content hash and/or rendered text hash
- accepted at
- subject identity: user, walk-in, and/or company
- context: signup, upload, checkout, admin/POS, document issue
- transaction links: booking/order/document if available
- accepted channel
- IP and user agent for web
- staff user id for assisted flows
- evidence snapshot JSON

### Evidence Snapshot Content

`evidence_snapshot` should be structured JSON. Suggested keys:

- `ui_route`
- `locale`
- `checkbox_label`
- `button_label`
- `agreement_links`
- `customer_confirmation_channel`
- `staff_remark`
- `document_upload_batch_id`
- `selected_damage_protection_plan`
- `booking_summary_hash`
- `order_summary_hash`
- `screen_version`

Avoid storing full raw ID card numbers or sensitive document content inside evidence snapshots.

### Hashes

Store at least one hash copied from the agreement version:

- `content_hash`: SHA-256 of canonical Markdown/HTML content.
- `rendered_text_hash`: SHA-256 of the exact rendered text shown to the customer, after template variables are resolved if applicable.

Recommendation:

- Store both if possible.
- Do not rely only on current `agreement_versions.content_body`, because future bugs or manual edits could weaken proof.
- Published agreement content should be immutable at database and API level.

### Uploaded Evidence Files

Examples:

- signed paper form scan
- Line screenshot
- email PDF
- customer signed tablet image

Storage rule:

- Store in a private bucket only.
- Link files through `agreement_evidence_files`.
- Restrict access to staff roles that need legal/admin evidence.
- Log admin downloads/views later through admin audit log.

### Immutability

Recommended database guard:

- Block updates/deletes to published agreement versions.
- Block updates/deletes to acceptance logs.
- Allow only controlled append-only evidence files.

If a mistake is made, create a correction/reversal event instead of editing the original log.

## 8. Recommended Tables

### 8.1 `agreement_versions`

Purpose: stores draft/published versions of all legal agreements.

Columns:

| Column                | Type                       | Notes                              |
| --------------------- | -------------------------- | ---------------------------------- |
| `id`                  | UUID PK                    | `gen_random_uuid()`                |
| `agreement_type`      | TEXT                       | One of approved slugs              |
| `version`             | TEXT                       | Example `v1.0`                     |
| `title`               | TEXT                       | Display title                      |
| `status`              | TEXT                       | `draft`, `published`, `retired`    |
| `content_format`      | TEXT                       | `markdown` or `html`               |
| `content_body`        | TEXT                       | Full agreement content             |
| `content_hash`        | TEXT                       | SHA-256 canonical content hash     |
| `rendered_text_hash`  | TEXT                       | SHA-256 rendered display text hash |
| `effective_from`      | TIMESTAMPTZ                | Required before publish            |
| `effective_until`     | TIMESTAMPTZ                | Null when still active             |
| `published_at`        | TIMESTAMPTZ                | Set on publish                     |
| `published_by`        | UUID FK users              | Staff/admin publisher              |
| `retired_at`          | TIMESTAMPTZ                | Set on retire                      |
| `retired_by`          | UUID FK users              | Staff/admin retire action          |
| `replaces_version_id` | UUID FK agreement_versions | Previous version                   |
| `metadata`            | JSONB                      | Tags, legal review info, notes     |
| `created_by`          | UUID FK users              | Admin author                       |
| `updated_by`          | UUID FK users              | Admin editor while draft           |
| `created_at`          | TIMESTAMPTZ                | Default now                        |
| `updated_at`          | TIMESTAMPTZ                | Trigger                            |

Constraints:

- `agreement_type IN (...)` using the six approved slugs.
- `status IN ('draft','published','retired')`.
- `content_format IN ('markdown','html')`.
- `UNIQUE (agreement_type, version)`.
- `published` rows require `effective_from`, `published_at`, `published_by`, hashes, and non-empty content.
- `effective_until IS NULL OR effective_until > effective_from`.

Indexes:

- `(agreement_type, status, effective_from DESC)`.
- `(agreement_type, version)` unique.
- `(status, effective_from DESC)` for admin review.

### 8.2 `agreement_acceptance_logs`

Purpose: immutable proof that a customer accepted/acknowledged a specific agreement version in a specific context.

Columns:

| Column                         | Type                              | Notes                                                                               |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                           | UUID PK                           | `gen_random_uuid()`                                                                 |
| `agreement_version_id`         | UUID FK agreement_versions        | Exact version row                                                                   |
| `agreement_type`               | TEXT                              | Denormalized copy                                                                   |
| `agreement_version`            | TEXT                              | Denormalized copy                                                                   |
| `agreement_title`              | TEXT                              | Denormalized copy                                                                   |
| `content_hash`                 | TEXT                              | Copied from version                                                                 |
| `rendered_text_hash`           | TEXT                              | Copied from version or exact rendered view                                          |
| `customer_user_id`             | UUID FK users                     | Registered user                                                                     |
| `walk_in_phone`                | TEXT FK walk_in_customers(phone)  | Walk-in customer                                                                    |
| `company_id`                   | UUID FK companies                 | Company context                                                                     |
| `booking_id`                   | UUID FK rental_bookings           | Rental booking context                                                              |
| `order_id`                     | UUID FK orders                    | Order/quotation context                                                             |
| `official_document_id`         | UUID FK official_documents        | If accepted before issue/signature                                                  |
| `source_type`                  | TEXT                              | Signup/upload/checkout/etc.                                                         |
| `source_id`                    | TEXT                              | Optional idempotency/context ref                                                    |
| `accepted_channel`             | TEXT                              | `web`, `admin_pos`, `staff_assisted`, `line`, `email`, `paper`, `phone`, `imported` |
| `consent_action`               | TEXT                              | `checkbox`, `button_click`, `signature`, `staff_attestation`, `imported`            |
| `customer_confirmation_method` | TEXT                              | `web_checkbox`, `walk_in_verbal`, `signed_paper`, `line`, `email`, `phone`, etc.    |
| `staff_remark`                 | TEXT                              | Required for Admin/POS assisted flows                                               |
| `accepted_at`                  | TIMESTAMPTZ                       | Default now                                                                         |
| `ip_address`                   | INET                              | Web flows when available                                                            |
| `user_agent`                   | TEXT                              | Web flows when available                                                            |
| `staff_user_id`                | UUID FK users                     | Required for Admin/POS assisted                                                     |
| `evidence_snapshot`            | JSONB                             | Structured evidence                                                                 |
| `status`                       | TEXT                              | `accepted`, `revoked`, `cancelled`, `corrected`                                     |
| `status_reason`                | TEXT                              | Required when status is not `accepted`                                              |
| `status_changed_at`            | TIMESTAMPTZ                       | Required when status is not `accepted`                                              |
| `status_changed_by`            | UUID FK users                     | Required when status is not `accepted`                                              |
| `correction_of_acceptance_id`  | UUID FK agreement_acceptance_logs | Optional correction link                                                            |
| `request_id`                   | TEXT                              | Optional request trace id                                                           |
| `session_id`                   | TEXT                              | Optional session id                                                                 |
| `metadata`                     | JSONB                             | Extra low-risk context                                                              |
| `created_at`                   | TIMESTAMPTZ                       | Default now                                                                         |

Constraints:

- At least one of `customer_user_id`, `walk_in_phone`, or `company_id` is present.
- `accepted_channel IN (...)`.
- `consent_action IN (...)`.
- `jsonb_typeof(evidence_snapshot) = 'object'`.
- `jsonb_typeof(metadata) = 'object'`.
- If `accepted_channel IN ('admin_pos','staff_assisted')`, require `staff_user_id`, `staff_remark`, and customer confirmation method.
- If `accepted_channel = 'web'`, require `ip_address` and `user_agent` when technically available.
- Acceptance evidence fields are immutable after insert; only status fields can change.
- Acceptance logs cannot be deleted.
- A `revoked`, `cancelled`, or `corrected` log cannot return to `accepted`.
- Acceptance snapshot fields must match the referenced `agreement_versions` row and cannot reference a draft version.

Indexes:

- `(customer_user_id, accepted_at DESC)` where user is not null.
- `(walk_in_phone, accepted_at DESC)` where walk-in is not null.
- `(booking_id, agreement_type, accepted_at DESC)` where booking is not null.
- `(order_id, agreement_type, accepted_at DESC)` where order is not null.
- `(agreement_type, agreement_version, accepted_at DESC)`.
- `(staff_user_id, accepted_at DESC)` where staff is not null.
- Optional idempotency unique index on `(agreement_version_id, source_type, source_id, customer_user_id)` where all are not null.

### 8.3 `agreement_evidence_files`

Purpose: optional private evidence files attached to an acceptance log.

Columns:

| Column           | Type                              | Notes                                                                     |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `id`             | UUID PK                           | `gen_random_uuid()`                                                       |
| `acceptance_id`  | UUID FK agreement_acceptance_logs | Parent acceptance                                                         |
| `file_type`      | TEXT                              | `signed_form`, `line_screenshot`, `email_pdf`, `signature_image`, `other` |
| `storage_bucket` | TEXT                              | Private bucket                                                            |
| `storage_path`   | TEXT                              | Private path                                                              |
| `file_hash`      | TEXT                              | Optional SHA-256 file hash                                                |
| `uploaded_by`    | UUID FK users                     | Staff/admin uploader                                                      |
| `uploaded_at`    | TIMESTAMPTZ                       | Default now                                                               |
| `metadata`       | JSONB                             | Notes, original filename, MIME type                                       |

Rules:

- Do not expose public URLs.
- Generate short-lived signed URLs only for authorized admin views.
- Prefer file hash for proof if storage object may be migrated later.

### 8.4 `agreement_version_events` Optional

Purpose: audit trail for draft creation, publish, retire, and legal review notes.

Columns:

| Column                 | Type                       | Notes                                                                |
| ---------------------- | -------------------------- | -------------------------------------------------------------------- |
| `id`                   | UUID PK                    | `gen_random_uuid()`                                                  |
| `agreement_version_id` | UUID FK agreement_versions | Related version                                                      |
| `event_type`           | TEXT                       | `created`, `updated_draft`, `published`, `retired`, `legal_reviewed` |
| `staff_user_id`        | UUID FK users              | Actor                                                                |
| `reason`               | TEXT                       | Required for retire/material change                                  |
| `metadata`             | JSONB                      | Extra context                                                        |
| `created_at`           | TIMESTAMPTZ                | Default now                                                          |

This can be added later if admin audit logging is not already sufficient.

## 9. Validation Helpers

Recommended server helpers:

- Resolve active agreement versions for given types.
- Create acceptance log from active versions.
- Validate required acceptances for signup/checkouts/bookings.
- Validate Damage Protection acceptance when plan is selected.
- Validate KYC consent before document upload.
- Validate Admin/POS acceptance includes staff evidence.
- Compute canonical content hash and rendered text hash.

Suggested utility files later:

- `server/utils/legal-agreements.ts`
- `server/utils/legal-consents.ts`
- `server/utils/legal-evidence.ts`

## 10. Recommended API Endpoints

### Public / Customer Agreement Read

- `GET /api/legal/agreements/active?types=terms_of_service,privacy_policy`
- `GET /api/legal/agreements/:agreementType/active`
- `GET /api/legal/agreements/:agreementType/:version`

Return only published/effective versions.

### Customer Acceptance

- `POST /api/legal/acceptances`
  - General endpoint for web acceptance.
  - Body includes `agreement_types`, `source_type`, optional `booking_id`, `order_id`, and evidence context.
- `GET /api/user/legal/acceptances`
  - Current user's acceptance history.
- `POST /api/user/kyc/consent`
  - Optional convenience endpoint that wraps `kyc_consent` acceptance before upload.

### Checkout / Booking Validation

- `GET /api/rental-bookings/:id/legal-requirements`
  - Returns required agreement types, active versions, and missing acceptances.
- `POST /api/rental-bookings/:id/legal-acceptances`
  - Records checkout acceptance for rental and damage/loss terms.
- `POST /api/rental-bookings/:id/damage-protection/accept-terms`
  - Records separate Damage Protection acceptance.
- `POST /api/rental-bookings/:id/validate-legal-readiness`
  - Server validation gate before confirm/payment/document issue.

### Admin Agreement Management

- `GET /api/admin/legal/agreement-versions?type=&status=`
- `POST /api/admin/legal/agreement-versions`
- `GET /api/admin/legal/agreement-versions/:id`
- `PATCH /api/admin/legal/agreement-versions/:id`
- `POST /api/admin/legal/agreement-versions/:id/publish`
- `POST /api/admin/legal/agreement-versions/:id/retire`

Permission proposal:

- Staff: read published versions.
- Admin: create/edit drafts.
- Super Admin/legal/accounting role: publish/retire.

### Admin/POS Assisted Consent

- `POST /api/admin/legal/acceptances/staff-assisted`
  - Staff records customer acceptance for Admin/POS flow.
  - Requires `staff_user_id` from authenticated admin session.
  - Requires customer subject, agreement types, channel, checkbox confirmation, and evidence snapshot.
- `POST /api/admin/legal/acceptances/:id/evidence-files`
  - Attach signed form/screenshot/email evidence.
- `GET /api/admin/legal/acceptances?customerUserId=&walkInPhone=&bookingId=&orderId=&type=`
  - Search acceptance evidence for support/audit.

### Document Issue Integration

- `POST /api/admin/rental-bookings/:id/validate-agreement-readiness`
  - Used before issuing official rental documents.
- `POST /api/admin/official-documents/:id/agreement-acceptance`
  - Optional endpoint if a signature/acceptance is captured at document issue time.

## 11. Implementation Sequence After Review

### Phase 2A: Migration Foundation

Suggested migration after design approval:

- `069_legal_agreement_consent_foundation.sql`

Create:

- `agreement_versions`
- `agreement_acceptance_logs`
- `agreement_evidence_files`
- optional `agreement_version_events`
- triggers for `updated_at`
- guard functions for immutability
- indexes and basic RLS policy stance

### Phase 2B: Server APIs

- Active agreement read endpoints.
- Admin draft/publish endpoints.
- Web acceptance endpoint.
- Staff-assisted acceptance endpoint.
- Validation helper for checkout/rental document issue.

### Phase 2C: UI Integration

- Signup checkbox.
- KYC upload consent.
- Checkout agreement confirmation.
- Separate Damage Protection acceptance.
- Admin/POS assisted consent panel.
- Consent history page.

## 12. Resolved Decisions Before Migration 069

1. Use six fixed agreement type slugs first: `terms_of_service`, `privacy_policy`, `rental_agreement`, `damage_loss_policy`, `damage_protection_terms`, `kyc_consent`.
2. Published agreement versions are immutable. After publish, content must not be edited directly; create `v1.1` or `v2.0` instead.
3. Acceptance logs must not be deleted. If a record must be corrected, use status fields or a revoke/cancel/correction log rather than deleting evidence.
4. Checkout must validate required active agreement acceptances before booking/order confirmation or before payment confirmation, depending on final checkout flow.
5. Admin/POS assisted booking must capture staff evidence: `staff_user_id`, `accepted_channel`, staff remark, customer confirmation method, and optional evidence file.
6. Walk-in consent must be supported using `walk_in_phone` in the current schema. A future `walk_in_customer_id` can be introduced later if the walk-in customer model changes.
7. Damage Protection consent must be separate. If selected, `damage_protection_terms` acceptance is logged independently from `rental_agreement`.
8. Before issuing rental documents or handing over assets, validate required consent evidence: at minimum `rental_agreement`, `damage_loss_policy`, and KYC/verification consent where required by risk level.
9. Batch 069 should be database foundation only: tables, constraints, indexes, immutability guards, RLS service-role only, and minimal helper RPC if useful. No UI implementation yet.

## 13. Summary Decision

Recommended foundation:

1. Use six fixed agreement types: `terms_of_service`, `privacy_policy`, `rental_agreement`, `damage_loss_policy`, `damage_protection_terms`, `kyc_consent`.
2. Store immutable published agreement versions in `agreement_versions`.
3. Store non-deletable consent proof in `agreement_acceptance_logs`, with controlled status fields for revoke/cancel/correction cases.
4. Store Admin/POS signed forms/screenshots in `agreement_evidence_files`.
5. Require separate Damage Protection acceptance.
6. Require staff evidence for Admin/POS assisted booking.
7. Validate required consent before checkout confirmation and before rental document issue.
