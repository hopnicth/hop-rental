# HOPNIC — Claude Code Instructions

## Project Overview

**HOP-RENTAL** is the main platform of **HOPNIC** — a Nuxt 4 + Supabase application that combines:

- **Sale commerce** (products, cart, checkout, orders)
- **Rental commerce** (asset-first booking, calendar, deposit/security flow)
- **Partner directory** (verified partners, categories, service areas)
- **CMS content** (blog, services, promotions, reviews)
- **Admin back-office** (products, assets, inventory, orders, bookings, refunds, POS)
- **Customer self-service** (account, KYC, wishlist, save-list, saved partners)

> Work carefully, in small phases. Do NOT make broad refactors without explicit approval.

---

## Tech Stack

| Layer         | Technology                                                   |
| ------------- | ------------------------------------------------------------ |
| Frontend      | Nuxt 4, Vue 3, TypeScript                                    |
| UI Components | `@nuxt/ui` (UCard, UBadge, UButton, UModal, etc.)            |
| Backend/API   | Nuxt server routes (`server/api/**`) via Nitro               |
| Database      | Supabase Postgres (117+ migrations)                          |
| Auth          | Supabase Auth (`@nuxtjs/supabase`, SSR cookies)              |
| Storage       | Supabase Storage (public + private buckets)                  |
| Realtime      | Supabase Realtime (chat)                                     |
| i18n          | `@nuxtjs/i18n` — active locales: `th` (default), `en` (cn/jp disabled from public UI) |
| Payments      | Omise (card + QR PromptPay)                                  |
| Rich text     | TipTap                                                       |
| Testing       | Vitest (`tests/server/**`)                                   |
| Type check    | `npx tsc --noEmit`                                           |
| Branch        | `staging`                                                    |
| Deployment    | Vercel + Supabase                                            |

---

## Project Structure

```
app/
  pages/          # Nuxt routes (public, /user/*, /admin/*)
  components/     # Vue components (admin/, products/, partners/, home/, etc.)
  composables/    # Client-side business logic (useCart, useBooking, usePartners…)
  types/          # Shared TypeScript types (database.types.ts is auto-generated)
  utils/          # Utility and domain logic
  layouts/        # default + admin layouts
  plugins/        # e.g. i18n-cookie locale persistence
  mappers/        # data shape transformers

server/api/       # Nitro server routes
  admin/          # Admin-only endpoints
  user/           # Authenticated user endpoints
  rental-bookings/ partners/ cart/ chat/ payments/ webhooks/ …

supabase/
  migrations/     # 117 SQL migration files (source of truth for schema)

tests/server/     # Vitest test suite (80+ spec files)
i18n/locales/     # th.json  en.json (active) · cn.json  jp.json (disabled, retained on disk)
```

---

## Key Routes

### Public / Storefront

- `/` — homepage (DB-backed banners, categories, content)
- `/product-[group]/` — sale products listing + detail
- `/product-rental` — rental assets listing
- `/asset/[slug]` — asset detail + booking form
- `/partners`, `/partners/[slug]` — partner directory
- `/services`, `/blog`, `/promotions`, `/reviews`
- `/search` — universal multi-type search

### User (auth required)

- `/user/login`, `/user/confirm`, `/user/forgot-password`, `/user/reset-password`
- `/user/cart` — unified cart (sale + rental drafts)
- `/user/orders`, `/user/rentals/`
- `/user/account` — profile, KYC, tax profile, company, documents
- `/user/wishlist`, `/user/save-list`

### Admin (`platform_role = 'staff' | 'super_admin'` required)

- `/admin/products`, `/admin/assets`, `/admin/branches-inventory`
- `/admin/orders`, `/admin/rental-bookings/[id]`
- `/admin/pos` (v1), `/admin/pos-v2`, `/admin/pos-v3`
- `/admin/refunds`, `/admin/content`, `/admin/messages`
- `/admin/home-content`, `/admin/home-categories`, `/admin/partners`

---

## Core Business Rules

### Auth & Permissions

- Admin access: `platform_role` values: `'staff' | 'super_admin'`
  - `requirePlatformAdmin(event)` → staff + super_admin
  - `requireSuperAdmin(event)` → super_admin only
- All admin API routes must verify role server-side via Supabase session
- RLS is enabled on all sensitive tables

### Rental Flow (asset-first)

- Booking always starts from an **asset**, not a product
- Status flow: `draft` → `confirmed` → `picked_up` → `returned`
- Cancellation is soft-delete via status: `cancelled` / `no_show`
- Rental booking must have either `user_id` **or** `walk_in_phone`
- POS can create confirmed rentals directly (walk-in or registered user)
- Deposit: `booking_deposit` is collected at confirmation; security deposit at pickup

### Sale Flow

- Standard cart → checkout → Omise payment → order
- POS sale does NOT require customer data (anonymous allowed)
- POS rental MUST know customer identity (user or walk-in)
- Mixed checkout: combines sale + rental deposit in one payment session

### i18n

- Default locale: `th` (Thai)
- Active locales are `th` and `en` ONLY. cn/jp are disabled from the public UI (locale JSON files retained on disk; re-enable = revert commit `d9e15ea`). Do NOT add new keys to cn.json/jp.json.
- All new UI strings MUST be added to both active locale files: `th.json`, `en.json`
- Locale key pattern: `section.subsection.key` (e.g. `partners.card.verified`)

---

## Common Patterns

### Server route (admin example)

```ts
// server/api/admin/something/index.get.ts
export default defineEventHandler(async (event) => {
  // Never use serverSupabaseClient
  // directly in admin routes
  const { adminClient } = await requirePlatformAdmin(event);
  // from server/utils/admin.ts
  // query, validate, return
});
```

### Component with i18n

```vue
<script setup lang="ts">
const { t } = useI18n();
</script>
<template>
  <UBadge color="success">{{ t("partners.card.verified") }}</UBadge>
</template>
```

### Composable pattern

```ts
// app/composables/useSomething.ts
export function useSomething() {
  const client = useSupabaseClient()
  const data = ref([])
  async function fetch() { ... }
  return { data, fetch }
}
```

---

## Database Notes

- Schema source of truth: `supabase/migrations/` (001–117 and growing)
- Generated types: `app/types/database.types.ts` — do NOT edit manually
- Key tables: `public.users`, `catalog_products`, `assets`, `rental_bookings`, `orders`, `cart_items`, `partners`, `content_pages`, `chat_conversations`, `payment_attempts`
  - NOTE: `rental_assets` is NOT a key table — it is an orphaned legacy table (superseded by `assets` via migration 025; zero code references)
- `platform_role` column on `public.users` controls admin access
- Storage buckets: `catalog-media` (public), `kyc-documents` (private), `avatars` (public), `rental-booking-docs` (private)

---

## Testing

Run all tests:

```bash
npx vitest run
```

Run a single spec:

```bash
npx vitest run tests/server/admin-partners-api.spec.ts
```

Type check:

```bash
npx tsc --noEmit
```

Tests live in `tests/server/` — they cover API routes, business rules, UI contracts, POS flows, rental lifecycle, and refund workflows.

---

## Server-Utils Index — Maintenance Rule

`docs/index/server-utils-index.md` is a living risk/responsibility index for every file under `server/utils/`. Keep it in sync with the code.

**Rule:** When you change the behavior, auth, risk, responsibility, money/ledger effects, KYC/hash behavior, inventory/availability behavior, or branch/access behavior of any file under `server/utils/`, update the matching row in `docs/index/server-utils-index.md` in the same commit.

- If a server utility is added, removed, renamed, or materially changed, the index must be updated in the same change.
- Do NOT update the index for typo-only / comment-only changes unless the current index row becomes inaccurate.
- If unsure whether a change affects risk or responsibility, report the uncertainty instead of guessing.

**Index rules** (see `docs/index/README.md` for the authoritative definitions):

- Current state only — no dates, changelog notes, "previously was…", before/after notes, or historical explanations.
- Use the locked 6-column format: `File | Responsibility | Domain | Risk | Edit rules | Tests`.
- Use only the closed Domain/Risk vocabulary from `docs/index/README.md`.
- Rate risk by blast radius, not code complexity.
- Use `TODO-risk` instead of guessing.
- For `med` / `high` / `critical` rows, include a concrete edit rule and related real tests.
- Do NOT include source-inspection tests that do not exercise the util.

## What NOT to Do

- Do NOT run broad find-and-replace refactors across many files without approval
- Do NOT edit `app/types/database.types.ts` manually (auto-generated from Supabase)
- Do NOT add new dependencies without checking with the user first
- Do NOT commit or push without explicit instruction
- Do NOT skip i18n — every user-visible string needs th + en keys (cn/jp disabled; re-enable = revert d9e15ea)
- Do NOT add console.log in production code paths
- Do NOT create new files unless strictly necessary — prefer editing existing ones

## Sub-guides

- app/components/claude.md
- server/api/claude.md
- supabase/claude.md
- docs/claude.md
- app/composables/claude.md
- server/utils/claude.md
- app/pages/claude.md
- tests/server/claude.md
- app/mappers/claude.md

## i18n Rules — STRICT

> Active locales: th + en only. cn/jp are disabled from the public UI (files retained on disk; re-enable = revert commit `d9e15ea`) — do NOT add new keys to cn.json/jp.json.

### Never do

- Never hardcode text in any language inside component code
- Never invent or guess translations for th
- Never assume a key exists without checking the locale files first
- Never add new keys to the disabled cn.json / jp.json

### When new UI text is needed

1. Use only the English key in code: t('partner.verified')
2. Add the key to i18n/locales/en.json only
3. Add a placeholder in th:
   "[NEEDS_TRANSLATION]: Verified"
4. Stop — report to user which keys need translation

### Correct output example

en.json: "verified": "Verified"
th.json: "verified": "[NEEDS_TRANSLATION]: Verified"
(cn.json / jp.json: no new keys — locales disabled)

### After adding keys, always report

"Added N new i18n keys pending translation:

- partner.verified
- partner.unverified
- partner.chipLabel"

### Finding untranslated keys

grep -r "NEEDS_TRANSLATION" i18n/locales/

## Session Routine — ALWAYS FOLLOW

### Start of every session

1. Read PROGRESS.md
2. Read DECISIONS.md
3. Read HANDOFF.md
4. Confirm current state to user
5. Wait for instruction

Deferred work MUST be recorded in docs/BACKLOG.md in the same commit; read BACKLOG.md at session start.

### During work

- Break tasks into subtasks yourself
- If a subtask conflicts with DECISIONS.md
  → stop and ask before proceeding
- If unsure about scope → ask once,
  then proceed

### End of every session (before stopping)

Automatically update these files:

PROGRESS.md:

- Move completed items to Done ✅
- Update In Progress 🔄
- Add new discovered tasks to Next 📋
- Add any blockers found to Blocked 🚫

DECISIONS.md:

- Add any design decision made today
  Format:
  ## YYYY-MM-DD
  Decision: [what]
  Reason: [why]
  Impact: [what it affects]

HANDOFF.md:

- Add entry if switching tools
  or leaving work mid-task
  Format:
  ## [Tool] → [Tool] / Date
  Task: [what]
  Files touched: [list]
  Status: [done/in-progress/blocked]
  Next: [what to do next]

### Never do at session end

- Never commit or push without asking
- Never mark Done if tests not passed
- Never delete previous PROGRESS entries
