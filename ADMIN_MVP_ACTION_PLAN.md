# Admin MVP Action Plan

Last updated: 2026-04-23
Owner: Augment continuity doc for future sessions
Status legend: `[ ]` not started, `[/]` in progress, `[x]` done, `[-]` dropped

## Purpose

This file is the continuity + todo plan for the first internal admin area.
Use it to track the smallest useful backoffice needed to maintain products, SKUs,
rental access packages, matches, and catalog images.

## How to update this file

1. When work starts, change the checkbox to `[/]`.
2. When work is completed and verified, change it to `[x]`.
3. Keep notes short and factual under the relevant task.
4. Keep this file aligned with `ROLE_MATRIX.md`, `DATABASE_ADMIN_MANUAL.md`, and `API_INDEX.md`.

## Locked decisions

- [x] D1. Internal backoffice access should use `public.users.platform_role`.
- [x] D2. Allowed internal roles for `/admin` are `staff` and `super_admin`.
- [x] D3. Do not use `company_members.b2b_admin` as the internal admin gate.
- [x] D4. Start with a lightweight CRUD admin, not a full dashboard/CMS.
- [x] D5. Admin image flow should upload files to Supabase Storage, then save URLs/paths in DB fields.
- [x] D6. Rental package/set editing should treat `rental_accesses` as the commercial root and `rental_access_matches` as membership.
- [x] D7. UI/docs must distinguish HOPNIC internal roles from customer-organization roles.
- [x] D8. Homepage content curation lives in the same Nuxt admin area, but `/admin/home-content` and `/api/admin/home-content/*` must stay `super_admin` only.

## Phase 0 — foundation

- [x] P0.1 Add `/admin` route shell.
  - 2026-04-22: added `admin` layout and `/admin` entry route.
- [x] P0.2 Add route protection for logged-in users with allowed `platform_role` values.
  - 2026-04-22: extended `app/middleware/role.ts` with `platformRoles` support.
  - 2026-04-22: tightened first-navigation auth/profile resolution to prevent the admin nav from briefly falling back to `Customer` before route changes.
- [x] P0.3 Add a simple admin landing page with links to the first CRUD pages.
  - 2026-04-22: added `/admin`, `/admin/products`, `/admin/rental-accesses`, `/admin/matches` scaffold pages.
- [x] P0.4 Show clear unauthorized behavior for non-admin users.
  - 2026-04-22: unauthorized users are redirected away with a permission toast.

## Phase 1 — catalog CRUD MVP

- [x] P1.1 Products list page.
  - 2026-04-22: `/admin/products` now loads a real list through `/api/admin/products`.
- [x] P1.2 Product create/edit form.
  - 2026-04-22: minimal create flow lives on `/admin/products`; edit flow lives on `/admin/products/[productId]`.
- [x] P1.3 SKU list/create/edit flow under a product.
  - 2026-04-22: nested SKU manager is live on `/admin/products/[productId]` using `/api/admin/products/:productId/skus`.
- [x] P1.4 Rental access list page.
  - 2026-04-22: `/admin/rental-accesses` now loads a real list through `/api/admin/rental-accesses`.
  - 2026-04-22: linked remote DB was brought up to migration `013_rental_access_schema.sql`, so the required rental tables now exist for this branch.
- [/] P1.5 Rental access create/edit form.
  - 2026-04-22: minimal create form is live; edit flow still pending.
- [/] P1.6 Rental access match editor (`rental_access` ↔ `product`).
  - 2026-04-22: `/admin/matches` now lists matches and supports minimal create flow.
  - 2026-04-22: remote DB migration `013_rental_access_schema.sql` was applied so `rental_access_matches` is available for admin validation.
- [x] P1.7 Homepage content admin page + API.
  - 2026-04-23: added `/admin/home-content` for hero banners, promotion/service link cards, and curated featured product/rental rails.
  - 2026-04-23: added `/api/admin/home-content` GET/POST/PATCH endpoints backed by `home_banners`, `home_link_cards`, `home_featured_products`, and `home_featured_rental_accesses`.
  - 2026-04-23: applied `014_homepage_content.sql` to the linked remote DB and verified seeded `home_banners` rows exist.

## Phase 2 — media/admin usability

- [ ] P2.1 Upload product and rental-access images to Supabase Storage.
- [ ] P2.2 Save `thumbnail_url` and `image_urls` correctly from the admin UI.
- [ ] P2.3 Add basic validation/error messaging for required fields.
- [ ] P2.4 Add quick links back to storefront-facing pages for spot checks.
- [ ] P2.5 Add image upload/storage flow for homepage banners and link cards instead of URL-only fields.

## Phase 3 — security + server flow

- [x] P3.1 Decide whether admin writes use privileged server API or new RLS admin policies.
  - 2026-04-22: current branch uses privileged server API for admin writes.
- [x] P3.2 If using server API, add `/server/api/admin/*` endpoints with platform-role checks.
  - 2026-04-22: added product, SKU, rental-access, and match admin endpoints with `platform_role` verification.
  - 2026-04-22: admin GET endpoints now support read-only fallback when the server-only Supabase key is missing; writes still require the server key.
- [ ] P3.3 If using browser writes temporarily, document the risk and scope clearly.
- [ ] P3.4 Never expose `service_role` in client code.

## Recommended implementation order for this branch

- [x] R1. Create this action plan doc.
- [x] R2. Scaffold `/admin` layout/page/guard.
- [/] R3. Implement `rental_access` admin first because package/set management is the current bottleneck.
- [x] R4. Implement product + SKU editor second.
- [/] R5. Implement match editor third.
- [x] R6. Implement homepage content curation for banners, link cards, and featured rails.
- [ ] R7. Add image upload flow after the first forms are working.

## Notes for future sessions

- Current repo already has `app/middleware/role.ts`, but it is oriented toward B2B context roles.
- Current repo already exposes `platformRole` through `useUserProfile()`.
- Prefer extending the existing middleware pattern instead of inventing a second access model if a clean extension is possible.
- Keep the first admin screens simple and form-first; do not block on charts, KPIs, or dashboard widgets.
- `useHomeContent()` now prefers curated homepage rows, but featured product/rental rails intentionally fall back to deterministic-random live catalog items when curated rows are empty.
- Promotions/services still have a compatibility fallback via mock home cards if the homepage schema is unavailable.
