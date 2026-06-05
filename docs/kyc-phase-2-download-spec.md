# KYC Phase 2 — super_admin-only server-proxy document download (locked spec)

> Status: **APPROVED FOR IMPLEMENTATION — not yet implemented.**
> Locked by `DECISIONS.md` 2026-06-05 Decisions B (sequencing, as amended), D (pure proxy + platform baseline), E (allowed semantics + attachment), F (PDPA/IP), G (malformed-id log purity); 2026-06-06 Decision I (Fluid guard = manual gate, Vercel API only).
> Spike evidence: Vercel Preview streaming spike PASS, 2026-06-05 (Decision D).
> This file is the single tracked source for what chat planning called the "rev-3 plan".

---

## 1. Scope

- ONE new endpoint: super_admin-only server-proxy download of a `kyc_documents` object.
- ONE new migration (110): widen the `kyc_document_access_log` `action` check constraint.
- NO purge/delete endpoint (deferred — legal retention scope, Decision B).
- NO UI, NO locale keys, NO `database.types.ts` regen (110 is constraint-only on a `text` column).
- Download and purge are SEPARATE commits (Decision B).
- Production enablement stays blocked behind Decision C's five gates regardless of this spec.

## 2. Endpoint

```
server/api/admin/kyc/documents/[id]/download.get.ts
→ GET /api/admin/kyc/documents/:id/download
```

Keyed on the globally-unique document id; deliberately NOT nested under
`profiles/[id]/` (a profile segment would add a second existence oracle).

### 2.1 Auth + operation order (strict)

```
1. requirePlatformAdmin(event)            → 401 unauthenticated / 403 customer (guard-level, unlogged)
2. read route param id (NO validation yet)
3. if platformRole !== 'super_admin':
     a. await best-effort denied log (see §4; no kyc_documents query, ever)
     b. throw 403 "Super admin access required"   ← byte-identical for ALL inputs
4. super_admin only: classify id (asUuidOrNull) → 400 + best-effort denied log if malformed
5. super_admin only: load row (internal SELECT) → 404 + best-effort denied log if absent
6. validate stored path (isSafeKycDocumentStoragePath) → 500 + denied log (path NOT logged) if unsafe
7. validate mime_type ∈ {image/jpeg, image/png, application/pdf} → 500 + denied log if not
8. FAIL-CLOSED allowed log (logKycDocumentAccess(..., { failClosed: true })) → 500, zero bytes, if it fails
9. storage.download(path) via service role → on failure: 500 + best-effort 'storage_download_failed' row
10. set headers, return blob.stream()
```

- Do NOT call `requireSuperAdmin` — the denied log must be interleaved between the
  role check and the throw (source-inspection test pins this).
- Non-super_admin can NEVER observe 400/404/500 — only the uniform 403. No oracle.
- NEVER `createSignedUrl` / `getPublicUrl` / redirect to storage (source-inspection test).

### 2.2 Row loading

Server-internal SELECT in `server/utils/kyc-document-view.ts`:

```ts
/** SERVER-INTERNAL ONLY — includes storage_path. NEVER serialize to a response. */
export const KYC_DOCUMENT_DOWNLOAD_INTERNAL_SELECT =
  "id, kyc_profile_id, document_type, mime_type, file_size_bytes, storage_path";
```

`storage_bucket` is not a column; the bucket is the constant
`KYC_PROFILE_DOCUMENTS_BUCKET`. The success response is raw bytes — the row is
never returned, spread into headers, or JSON-serialized.

### 2.3 Path validator — single source of truth

In `server/utils/kyc-documents.ts` (same module as the map):

- `KYC_DOCUMENT_MIME_EXTENSIONS` stays the ONLY MIME→extension authority.
- `isSafeKycDocumentStoragePath(path: unknown): boolean` builds its extension
  alternation from `Object.values(KYC_DOCUMENT_MIME_EXTENSIONS)` at module load,
  with each value passed through a regex-escape helper
  (`value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`) before `join("|")`.
  Pattern: `^kyc/<uuid-v4-shape>\.<ext-from-map>$`. Fail closed on everything else
  (traversal, URLs, legacy `users/...` paths, non-UUID, uppercase hex, empty, non-string).
- `kycDocumentExtensionForMime(mime)` (or export the map) — the
  `Content-Disposition` filename derives from it; no re-mapping in the endpoint.
- Tests generate valid keys via the REAL builder: iterate every key of
  `KYC_DOCUMENT_MIME_EXTENSIONS` and assert
  `isSafeKycDocumentStoragePath(buildKycDocumentStorageKey(mime)) === true`
  (round-trip property — a future map change cannot silently break the pair).
  Rejection cases remain explicit literals.

### 2.4 Storage fetch / streaming

- `adminClient.storage.from(KYC_PROFILE_DOCUMENTS_BUCKET).download(storage_path)`
  — service-role, server-side only. Returns a Blob (buffered; fine at ≤10 MB).
- Respond with `blob.stream()` after setting headers — the exact shape proven by
  the spike's real-object pass.

### 2.5 Response headers (success path)

```
Cache-Control: no-store
Content-Type: <row.mime_type, allowlist-validated>
Content-Disposition: attachment; filename="kyc-<documentId>.<ext>"   ← owner decision (Decision E)
X-Content-Type-Options: nosniff
```

- **OMIT Content-Length** (Decision D): streamed delivery was byte-exact without
  it; deriving it from `file_size_bytes` turns metadata/object drift into a hard
  protocol failure.
- No storage path, bucket, or internal metadata in any header. Filename is opaque.

## 3. Audit logging

| Event | action | result | reason | mode |
|---|---|---|---|---|
| staff (non-super_admin), uuid-shaped id | `download` | `denied` | `not_super_admin` | best-effort |
| staff (non-super_admin), malformed id | `download` | `denied` | `not_super_admin_malformed_id` | best-effort |
| super_admin, malformed id | `download` | `denied` | `malformed_document_id` | best-effort |
| super_admin, `kyc_documents` read fails (infrastructure) | `download` | `denied` | `read_failed` | best-effort |
| super_admin, row absent | `download` | `denied` | `not_found` | best-effort |
| super_admin, unsafe stored path | `download` | `denied` | `unsafe_path` (storage_path = null in the row) | best-effort |
| super_admin, non-allowlisted mime | `download` | `denied` | `invalid_mime` | best-effort |
| super_admin, access granted | `download` | `allowed` | null | **fail-closed** |
| storage fetch fails after grant | `download` | `denied` | `storage_download_failed` | best-effort correction row |

### 3.1 `allowed` semantics (Decision E)

- `action='download'`, `result='allowed'` = **access granted + delivery attempted /
  stream initiated**. The fail-closed row durably exists BEFORE the storage fetch.
  It does NOT prove full browser consumption (client abort is undetectable).
  Guarantee is one-directional: no bytes without an `allowed` row first.
- Correction row (`storage_download_failed`) lets auditors distinguish
  "granted + delivered" from "granted but errored". Its own failure must not mask
  the 500 and never edits the `allowed` row (append-only).

### 3.2 Malformed-id log purity (Decision G)

- `kyc_document_access_log.document_id` is `uuid NULL` (migration 109; all five
  denial-payload sibling columns — `document_id`, `kyc_profile_id`,
  `document_type`, `storage_bucket`, `storage_path` — verified nullable).
- A non-UUID route id passed into the insert would make the best-effort write
  fail silently (the trap this rule closes). Therefore:
  - classify with `asUuidOrNull` BEFORE building the log payload;
  - malformed → `document_id = null` + the `*_malformed_*` reason codes above;
  - **the raw attacker-controlled string is NEVER written anywhere in the log row**;
  - uniform 403 / no `kyc_documents` query for non-super_admin is unaffected.

### 3.3 Denied-log failure

`logKycDocumentAccess` best-effort mode returns false (never throws): a downed
log table must never escalate the uniform 403 into a 500 (tested).

### 3.4 Infrastructure read failure (`read_failed`) — opaque client errors

When the super_admin-path `kyc_documents` read itself errors (DB/Supabase
infrastructure failure, NOT row absence):

- the client receives an OPAQUE 500 `KYC_DOCUMENT_READ_FAILED` — the raw
  DB/Supabase error message is NEVER returned in `statusMessage` (it can leak
  internals); the real error is logged server-side only (`console.error`);
- a BEST-EFFORT audit row is written: `action='download'`, `result='denied'`,
  `reason='read_failed'`, `document_id=<valid route uuid>`, no storage path
  (the row was never loaded);
- NO allowed row is written and storage is NEVER touched on this path;
- the row is best-effort, NOT fail-closed — an infrastructure read failure
  must not additionally depend on the log table being up, and its own log
  failure must not mask the opaque 500.

Principle (applies to every infrastructure error in this endpoint):
infrastructure failures return opaque machine-code errors to the client; real
error details stay in server logs; the audit row for such failures is
best-effort, never fail-closed.

## 4. Migration 110 runbook

Constraint name **verified from migration 109 source (line 79)**:
`kyc_document_access_log_action_chk`.

```bash
# 0. Baseline — re-verify chain reset-clean through 109 (last proven at 106, 2026-06-02)
supabase db reset --local

# 1a. Confirm live constraint name + definition before authoring the DROP
#     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
#     WHERE conrelid='public.kyc_document_access_log'::regclass AND contype='c';

# 1b. Author 110_kyc_document_access_log_download_action.sql — idempotent, constraint-only:
#     ALTER TABLE ... DROP CONSTRAINT IF EXISTS kyc_document_access_log_action_chk;
#     ALTER TABLE ... ADD CONSTRAINT kyc_document_access_log_action_chk
#       CHECK (action IN ('upload','download_signed_url','delete','download'));
#     text column → NO database.types.ts regen.

# 2. Re-reset with 110 in the chain
supabase db reset --local

# 3. LOCAL-ONLY behavioral verification (disposable DB; remote probe rows forbidden — Decision A)
#    - INSERT action='download'  → succeeds (catches missed/duplicate old constraints)
#    - INSERT action='bogus'     → check violation
#    - UPDATE/DELETE/TRUNCATE    → still raises (append-only triggers intact)

# 4. App gates
npx tsc --noEmit && npx vitest run

# 5. Remote (ONLY with explicit instruction, after code lands on staging)
supabase db push --linked --dry-run   # must show ONLY 110 pending
supabase db push --linked
#    Remote verification METADATA-ONLY: pg_get_constraintdef contains 'download'. No inserts.
```

Code-side: add `'download'` to the `KycDocumentAccessAction` union (keep
`'download_signed_url'` — historical value + shelved contingency).

## 5. Test matrix

`tests/server/kyc-document-download-api.spec.ts` (mocked h3; mock client THROWS
on any unexpected table so silent queries are impossible):

1. No-oracle: staff with existent / nonexistent / malformed id → three
   deep-equal 403 errors (status + statusMessage).
2. Zero `from("kyc_documents")` and zero storage calls for non-super_admin.
3. Staff denial best-effort log: action/result/reason, document_id, actor
   snapshot, single parsed IP.
4. Malformed-id matrix per §3.2 (document_id null; raw string absent from
   serialized payload).
5. Denied-log failure → still 403, never 500 (breadcrumb asserted).
6. super_admin + missing row → 404 + `not_found` row.
7. Unsafe stored paths (`kyc/../../x.jpg`, `https://…`, `users/123/id.jpg`,
   non-UUID, empty) → 500, `unsafe_path` row with `storage_path = null`, storage
   never touched.
8. Fail-closed allowed log failure → 500, `storage.download` never called.
9. Allowed-log-before-fetch call-order assertion.
10. Success: byte round-trip; `no-store`; allowlisted Content-Type; `attachment`
    + opaque filename; `nosniff`; **no Content-Length set by the handler**.
11. Headers/body never contain storage_path, bucket name, `http`, `signedUrl`.
12. Fetch failure after grant → 500 + `storage_download_failed` row; that row's
    own failure leaves the 500 intact.
13. Non-allowlisted/null mime → 500 + `invalid_mime` row, no bytes.
14. Source inspection: contains `requirePlatformAdmin`; does NOT contain
    `requireSuperAdmin` / `createSignedUrl` / `getPublicUrl` / `serverSupabaseClient`.
15. 401 guard pass-through.

`tests/server/kyc-document-download-h3-integration.spec.ts` (real h3 + node:http,
mirrors the upload integration spec): real GET → 200, exact byte round-trip,
wire-level header assertions, no path/bucket leakage; staff-role request → 403
with zero side effects.

`tests/server/kyc-document-upload-utils.spec.ts` (extend): validator round-trip
via the real builder (§2.3); rejection table; regex-escape behavior;
`asUuidOrNull` table; `KycDocumentAccessAction` includes `'download'`;
internal SELECT includes `storage_path` while `KYC_DOCUMENT_SAFE_SELECT` still excludes it.

## 6. Files expected to change (implementation commit(s))

- `server/api/admin/kyc/documents/[id]/download.get.ts` — NEW
- `server/utils/kyc-documents.ts` — `'download'` action; `isSafeKycDocumentStoragePath`;
  `asUuidOrNull`; extension-for-MIME export
- `server/utils/kyc-document-view.ts` — internal SELECT + never-serialize contract comment
- `supabase/migrations/110_kyc_document_access_log_download_action.sql` — NEW
- `docs/index/server-utils-index.md` — same-commit rows for both touched utils
- 2 new spec files + 1 extended spec file (§5)
- `PROGRESS.md` / `DECISIONS.md` / `HANDOFF.md` — session routine
- NOT touched: `database.types.ts`, UI, locales, purge, unrelated dirty files

## 7. Validation commands

```bash
npx tsc --noEmit
npx vitest run tests/server/kyc-document-download-api.spec.ts
npx vitest run tests/server/kyc-document-download-h3-integration.spec.ts
npx vitest run tests/server/kyc-document-upload-utils.spec.ts
npx vitest run tests/server/kyc-document-upload-api.spec.ts tests/server/kyc-document-upload-h3-integration.spec.ts
npx vitest run    # full suite before Done
```

## 8. Platform guards (Decision D, amended by Decision I)

- **Fluid Compute guard (IMPLEMENTED as a manual gate — Decision I):** pure
  proxy is contingent on Vercel `resourceConfig.fluid === true` (this is why
  >4.5 MB delivery works). Enforced check: `scripts/check-vercel-fluid.mjs`
  (`npm run check:vercel-fluid`) — a **manual production-enablement gate** run
  with an **ephemeral Vercel token** (create → run → revoke; never stored in
  the repo, `.env`, or any CI secret) BEFORE enabling production KYC download.
  - Source of truth is the **Vercel API only**:
    `GET https://api.vercel.com/v9/projects/{VERCEL_PROJECT_ID}[?teamId={VERCEL_TEAM_ID}]`.
    Build-output evidence is NOT available — Fluid Compute is a project-level
    setting absent from `.vc-config.json` (verified; the former "equivalent
    build-output evidence" option is removed).
  - Verdicts (three-state, fail-loud): **PASS** = strict boolean `true` +
    response `id` matches `VERCEL_PROJECT_ID` (exit 0). **FAIL** = explicit
    boolean `false` (exit 1). **UNKNOWN** = auth/API error, project-id
    mismatch, missing/non-boolean flag (string `"true"` rejected), or shape
    change (exit 2) — UNKNOWN is a hard stop, never treated as a pass.
  - Any non-PASS: production enablement STOPS and the KYC proxy download must
    be RE-SPIKED before any further production use (§9 contingency activates
    only with owner approval).
  - Tests: `tests/server/vercel-fluid-guard.spec.ts` — fixture-based only, no
    live API calls. Offline CLI dry-run: `--fixture <file.json>`.
  - Scheduled/CI monitoring (e.g. GitHub Actions) is a future option ONLY if
    the owner explicitly accepts the standing-token risk: Vercel tokens are
    not read-only, and Actions detect but cannot block Vercel Git deploys.
  - **Live-API verification status: PENDING** — script implemented and
    fixture-verified 2026-06-06; the one-time live run (ephemeral token) is
    deferred. Record date + verdict here when it is run.
  - When Decision C production work begins, the FIRST step is a consolidated
    `docs/kyc-production-enablement-checklist.md` listing this check.
- **Bucket cap coupling:** approved under the current `kyc-profile-documents`
  10 MB limit (migration 109). Raising the limit above 10 MB requires re-running
  the streaming spike at the new maximum BEFORE the larger limit ships.
- **Evidence limitation (honest record):** real-object `storage.download()` →
  `blob.stream()` proven at 6 MB; 10 MB proven synthetically. Accepted because
  KYC access is low-volume, Fluid Compute is on, and 10 MB streamed delivery
  passed. Optional hardening: a 10 MB real-object pass next time a preview spike runs.

## 9. Shelved contingency — hybrid signed-URL fallback (documented, NOT built)

Activate ONLY if the Fluid Compute guard or a re-spike fails and the owner approves:

- Branch on `kyc_documents.file_size_bytes` at a **4.0 MB threshold** (0.5 MB
  margin under Vercel's legacy 4.5 MB buffered-response limit).
- ≤ threshold: proxy branch exactly as §2 (`action='download'`).
- > threshold: signed-URL branch with the **mint-first order**:
  `createSignedUrl(path, 60)` → fail-closed allowed log → return `{ signedUrl }`.
  - `action='download_signed_url'`, `result='allowed'` = URL minted AND allowed
    log durably written; only then disclosed. Issuance-only record — consumption
    at Supabase's edge is unlogged (the inherent signed-URL limitation).
  - Mint fails → 500 + best-effort `signed_url_mint_failed` row.
  - Log fails after mint → 500; minted URL discarded, never returned (≤60 s
    undisclosed residual at the storage edge; breadcrumb only).
- Migration 110's widened constraint already supports both action values.
