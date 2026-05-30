# KYC Foundation — POS V3 Design (LOCKED)

Status: LOCKED — ready for implementation
Last updated: 2026-05-30
Scope: KYC for walk-in rental customers + pickup risk control, for both registered users and walk-in customers.

---

## 1. Core decision

Create a new dedicated `kyc_profiles` table, separated from `users`.

- KYC is NOT embedded in `users`.
- `user_id` is nullable → supports registered users AND walk-in customers.
- Walk-in customers verified via identity reference (national ID / passport / juristic ID), stored as hash + last4 only.
- No real legacy KYC data to migrate. Old `users` KYC fields can be deprecated and removed later.

Pickup gate source: Option X — pickup reads ONLY from `kyc_profiles`. It ignores old `users.kyc_status` entirely. One authoritative source, no compatibility fallback.

---

## 2. Status set (system-wide)

```
pending | verified | rejected | expired | revoked
```

- `pending` — submitted, awaiting verification.
- `verified` — passed identity verification.
- `rejected` — review failed before verification.
- `expired` — past `valid_until` (may be derived live or stored by cleanup job).
- `revoked` — was verified, later cancelled by Super Admin.

---

## 3. Pickup gate rule (authoritative)

Always compute expiry LIVE at read time. Never trust stored status alone.

```ts
const kycPasses = kyc.status === "verified" && kyc.valid_until > now();
```

- Even if stored status is still `verified`, treat as expired when `valid_until <= now()`.
- A cleanup job (or lazy check) may later flip stored status to `expired` for display/reporting only.

Enforced in TWO places:
1. `loadRentalPickupReadiness` — UX / readiness display.
2. `confirmPickup` endpoint — final authoritative server-side gate.

Pickup proceeds only when ALL gates pass:
- Deposit is clear.
- Pickup checklist completed.
- Customer signature completed.
- KYC verified and not expired (OR a valid booking-specific Super Admin override exists).

---

## 4. Table: `kyc_profiles`

```
id                      uuid PK
user_id                 uuid NULL          -- registered users
customer_type           enum: individual | company
identity_type           enum: national_id | passport | juristic_id
identity_hash           text               -- hashed identity ref (no plaintext)
identity_last4          text               -- masked display, e.g. ***1234
branch_id               uuid NULL          -- branch where KYC handled
walk_in_phone           text NULL          -- contact for walk-in
status                  enum: pending | verified | rejected | expired | revoked
verified_at             timestamptz NULL
valid_until             timestamptz NULL   -- computed at verify time
verified_by_user_id     uuid NULL
verified_branch_id      uuid NULL
verification_method     text NULL          -- e.g. staff_on_site
rejected_at             timestamptz NULL
rejection_reason_code   text NULL
rejection_note          text NULL
revoked_at              timestamptz NULL
revoked_by_user_id      uuid NULL
revoked_reason_code     text NULL
revoked_note            text NULL
created_at              timestamptz
updated_at              timestamptz
```

Identity storage rule: NEVER store plaintext national ID / passport / juristic ID. Store `identity_hash` + `identity_last4` only.

---

## 4a. Identity Normalization and Hashing Contract

### Mandatory entry point

ALL KYC intake, search, lookup, and pickup-gate code MUST call `hashKycIdentity`.
Calling `hashIdentity` directly on raw user input is **FORBIDDEN** — it bypasses
normalization and will produce a hash that does not match stored records.

### HMAC input format

The identity_hash HMAC input format is exactly:
v1:${identity_type}:${normalized_value}

This is a permanent storage contract. Changing the version prefix,
separator, ordering, identity type, or normalization rules will
orphan existing identity_hash values unless a deliberate migration
plan is created.

Examples:
- `v1:national_id:1234567890123`
- `v1:juristic_id:0105536016671`
- `v1:passport:AB1234567`

The `v1` prefix fixes the format version so that future changes are
unambiguous. The `identityType` segment is **required** — `national_id`
and `juristic_id` share the same 13-digit format; without it the same
digits would hash to the same value across types, allowing identity
confusion.

### Normalization steps

`normalizeKycIdentity(identityType, rawValue)` applies:

1. **Unicode NFKC** (always first) — folds full-width IME digits/letters, maps
   NBSP → space, and other compatibility equivalences.
2. **Type-specific transforms:**
   - `national_id` / `juristic_id`: strip all whitespace and dash-family characters
     (`/[\s­-‐-―−]/g`), then assert `/^\d{13}$/`.
   - `passport`: convert to uppercase (locale-independent `.toUpperCase()`), strip
     whitespace and dashes, then assert `/^[A-Z0-9]+$/`.
3. **Format assertion** — throws on mismatch. Error messages must NOT contain the
   raw or normalized identity value (no PII in logs).

Note: these are **format checks only**, not identity validation. Thai national ID /
juristic ID checksum validation is out of scope here and belongs in the verify flow.

### `identity_last4` derivation

`identity_last4` (column name in `kyc_profiles` per migration 105) **MUST** be
derived from the **normalized** value, not the raw input:

```ts
const normalized = normalizeKycIdentity(identityType, rawValue);
const last4 = maskLast4(normalized);   // → "***1234"
const hash  = hashIdentity(`v1:${identityType}:${normalized}`);
```

Calling `maskLast4(rawValue)` is incorrect — different input formats of the same
identity (e.g., with or without dashes) would produce different `last4` values and
break masked display consistency.

### Raw identity storage rule

The raw identity value (national ID number, passport number, juristic ID) **must
never be stored** — not in the database, not in logs, not in error messages.
Store `identity_hash` + `identity_last4` only.

---

## 5. Reason codes (structured, not free-text)

Use a reason code + optional note. Avoid wording like "stolen ID" / "blacklist" in the code; use operational language.

```
document_unreadable
document_expired
company_cert_outdated
identity_mismatch
suspected_invalid_document
internal_risk_flag
other
```

- `rejection_reason_code` required when status set to `rejected`.
- `revoked_reason_code` required when revoking.
- Notes (`rejection_note`, `revoked_note`) are optional free-text.

---

## 6. Table: `kyc_documents`

```
id                   uuid PK
kyc_profile_id       uuid FK -> kyc_profiles
document_type        enum: id_card | signature | vat_certificate | company_cert
storage_path         text               -- private bucket only
issued_at            date NULL
expires_at           date NULL
uploaded_by_user_id  uuid
uploaded_at          timestamptz
```

Storage: private bucket only, never public URLs.

Document rules:
- Store BOTH `issued_at` and `expires_at` (don't rely only on computed expiry).
- `company_cert` requires `issued_at`.
- If `company_cert.issued_at < now() - interval '6 months'` → block verification, keep profile `pending`, require updated document. Do NOT auto-reject the customer.
- For documents with real expiry (e.g. passport) use `expires_at`.

---

## 7. KYC validity

```
individual → valid_until = verified_at + 1 year
company    → valid_until = verified_at + 1 year  (for now)
```

---

## 8. KYC type requirements

```
individual:
  - id_card        (required, within 1 year)
  - signature      (required)

company:
  - vat_certificate / por_por_20  (required)
  - company_cert   (required, issued within 6 months)
```

---

## 9. Table: `kyc_pickup_overrides`

Dedicated high-risk audit table. Override does NOT mutate KYC profile to `verified` — it records that pickup was allowed by exception.

```
id                    uuid PK
booking_id            uuid               -- override is booking-specific
kyc_profile_id        uuid NULL
branch_id             uuid NULL
overridden_by_user_id uuid
override_reason       text               -- required
created_at            timestamptz
```

Rules:
- `override_reason` required.
- Only `super_admin` can create override records.
- `confirmPickup` may pass the KYC gate via override ONLY if a valid override exists for THAT booking.
- Override is booking-specific, never customer-wide.

---

## 10. POS V3 modes

```
1. Sale            (done)
2. Walk-in         (done)
3. Pickup          (done — needs KYC gate added)
4. KYC             (new — this work)
```

KYC mode entry: lookup by identity → find or create `kyc_profiles` record.

---

## 11. Staff & Super Admin authority

Staff (on-site walk-in pickup):
- Can verify KYC on the spot.
- Audit fields required: `verified_by_user_id`, `verified_at`, `verified_branch_id`, `verification_method = staff_on_site`.

Super Admin:
- Can revoke a verification (sets status `revoked` + reason code).
- Can override the pickup KYC gate in exceptional cases (creates a `kyc_pickup_overrides` row — does NOT set status to `verified`).

---

## 12. Client UX gate

If KYC is missing / pending / rejected / expired / revoked:
- Block pickup in UI.
- Show "KYC Required" state.
- Redirect staff to POS V3 KYC mode.
- Preserve booking/pickup state (`bookingId`, `returnTo`, or equivalent) so in-progress work is not lost.
- After KYC becomes `verified`, return staff to the pickup they were on.

Wiring (from STEP 0 audit):
- `kycStatus` already flows into `userContext` but is NOT yet passed to the pickup container.
- Add prop `kycStatus` (and validity) to `AdminPosV3PickupContainer`.
- Extend `canSubmit` with KYC condition.
- Add KYC case to `pickupBlockingReason`.

---

## 13. Build order

```
TASK 1  Migration: kyc_profiles + kyc_documents
        + kyc_pickup_overrides + enums + RLS + private bucket
TASK 2  Server utils: KYC readiness + verify + revoke logic
TASK 3  Wire KYC gate into loadRentalPickupReadiness
        + confirmPickup (server authoritative, live expiry compute)
TASK 4  POS v3 KYC mode UI (lookup, submit, verify)
TASK 5  Pickup container: KYC gate + redirect + state preserve
TASK 6  Super admin override + revoke flow
TASK 7  Tests
```

Each task = one Sonnet 4.6 prompt, one migration or one area, reviewed before commit.

---

## Legal note

Storing identity documents and references is subject to PDPA. Confirm with a legal advisor: consent capture, retention period, access restriction, and a destruction policy for expired physical/digital documents. This design uses hash + last4 (no plaintext identity), private bucket, structured reason codes, and full audit trail to reduce exposure — but legal sign-off is still required before production use.
