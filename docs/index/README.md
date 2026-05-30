# HOPNIC — docs/index

## Prime rule

These indexes describe **current state only**.

Do not add dates, changelog notes, "previously was…", "before/after", or historical explanations to any index row.  
History lives in `git log` and `git blame`.

---

## Purpose

`docs/index/` holds structured, machine-readable reference tables that make `server/utils/` navigable without reading every file.  
Each index row answers: what does this file own, what breaks if I change it wrong, and where are its tests?

Indexes are **not design docs** and **not changelogs**. They record current facts only.

---

## Maintenance rule

Any commit that changes a file's behavior, auth requirement, risk level, or responsibility in `server/utils/` **must update the matching row** in `server-utils-index.md` in the same commit.

---

## Column format — server-utils-index.md

```
File | Responsibility | Domain | Risk | Edit rules | Tests
```

### 1. File
Path relative to `server/utils/`. No absolute paths.

### 2. Responsibility
One sentence: what the file exports and why callers need it.

### 3. Domain
Use only this closed vocabulary. Multiple tags are allowed (comma-separated).

| Tag | Covers |
|---|---|
| `payment` | Omise charges, webhook verification, amount conversion |
| `rental-money` | Deposit lines, held-balance events, payment-line math |
| `rental-ops` | Booking lifecycle, availability, cancellation, no-show, fulfillment |
| `kyc` | Identity hashing, readiness, pickup gate, normalization |
| `auth` | Platform role guards, session resolution |
| `inventory` | Stock, branches, asset availability |
| `branch-access` | Branch-scoped access checks |
| `pos` | POS-specific flows (walk-in, deposit finalizer, QR booking) |
| `content` | CMS pages, media, home categories, partner content |
| `other` | Admin helpers, mappers, SELECT strings that span multiple domains |

Do not invent new domain tags.

### 4. Risk
Use only this fixed vocabulary.

| Value | Definition |
|---|---|
| `critical` | A wrong change can **silently** corrupt money, identity hashes, or auth/access — failure is not obvious |
| `high` | Breaks a money, identity, or auth flow but **fails loudly** or is recoverable |
| `med` | Breaks a non-critical flow; recoverable |
| `low` | UI/data-shaping or low-blast-radius helper only |
| `TODO-risk` | Not yet assessed — use this instead of guessing |

**Rate by blast radius, not code complexity.**  
A small tidy helper that touches money, ledgers, identity hashes, or auth/access can still be `critical`.

When in doubt, use `TODO-risk`. Never guess.

### 5. Edit rules
One short rule per row.  
`—` is acceptable for `low`-risk rows.  
`med`, `high`, and `critical` rows require a rule.

### 6. Tests
Related spec filenames. Include API specs when the utility is primarily exercised through API tests.

---

## Calibration anchors — use these two rows to calibrate Risk ratings in Task 3

| File | Responsibility | Domain | Risk | Edit rules | Tests |
|---|---|---|---|---|---|
| `payment-core.ts` | Pure helpers for Omise charge mapping, amount conversion, currency normalisation, and HMAC webhook signature verification — no DB calls. | `payment` | `critical` | Never add a DB call or side effect; do not change `toGatewayAmount` rounding (`Math.round(value * 100)`) without updating every caller that passes amounts to Omise; `verifyOmiseWebhookSignature` uses `timingSafeEqual` — any drift silently accepts or rejects all webhooks. | `payment-core.spec.ts`, `payment-card.spec.ts`, `payments-poll.spec.ts` |
| `kyc.ts` | Pure KYC helpers: identity normalisation + HMAC hashing (`hashKycIdentity` is the sole authorised entry point), live readiness computation, pickup-gate resolution, and cert recency check — no DB calls. | `kyc` | `critical` | `hashKycIdentity` is the ONLY permitted entry point for hashing raw identity input — never call `hashIdentity` on unnormalised values directly; changing the HMAC input format (`v1:${type}:${value}`) silently breaks lookup for every stored hash; error messages must not include PII. | `kyc.spec.ts`, `user-kyc-api.spec.ts`, `company-kyc-api.spec.ts` |
