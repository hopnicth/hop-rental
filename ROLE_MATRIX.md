# Role Matrix

Last updated: 2026-04-22
Audience: product, ops, developers, future Augment sessions

## Purpose

This file is the source of truth for role naming and responsibility boundaries.

Use it when updating:
- auth/authorization logic
- account UI labels
- admin/backoffice routes
- docs that mention customer/admin/staff permissions

## Two-layer role model

The app has **two separate role layers**.

| Layer | Storage | Values | Meaning |
| --- | --- | --- | --- |
| Platform role | `public.users.platform_role` | `customer`, `staff`, `super_admin` | HOPNIC-level role |
| Organization role | `public.company_members.role` | `b2b_user`, `b2b_admin` | Customer-organization role |

## Canonical display names

| Stored value | Canonical label | Meaning |
| --- | --- | --- |
| `customer` | Customer | Personal customer account |
| `b2b_user` | Organization Member | Member of a customer organization who can create requests / quotation-oriented purchases |
| `b2b_admin` | Organization Admin | Approver/admin inside a customer organization |
| `staff` | HOPNIC Staff | Internal HOPNIC operations/backoffice role |
| `super_admin` | HOPNIC Super Admin | Highest-risk internal HOPNIC admin role |

## Role definitions

### `customer`
- General customer / personal account
- Default platform role after signup
- Can manage own profile, addresses, carts, bookings, and orders under normal customer flows

### `b2b_user`
- Customer-side organization member
- Acts on behalf of a company/organization
- Can request quotations or create organization-side purchasing requests
- Is **not** an internal HOPNIC admin

### `b2b_admin`
- Customer-side organization approver/admin
- Can manage organization-level areas such as company addresses and approval-oriented flows
- Is **not** the gate for HOPNIC `/admin`

### `staff`
- Internal HOPNIC operator
- Can use internal backoffice tools such as `/admin`
- Can help prepare catalog data, support customer onboarding, and perform operational actions through privileged server APIs

### `super_admin`
- Highest internal HOPNIC role
- Owns KYC approval, sensitive overrides, stock/order corrections, and other high-risk actions
- Should remain a smaller, more privileged group than `staff`

## Responsibility matrix

| Capability | customer | b2b_user | b2b_admin | staff | super_admin |
| --- | --- | --- | --- | --- | --- |
| Personal storefront browsing/purchase | Yes | Yes | Yes | Yes | Yes |
| Act in organization purchasing context | No | Yes | Yes | Optional | Optional |
| Request quotation for organization | No | Yes | Yes | Optional | Optional |
| Approve organization-side requests | No | No | Yes | No | No |
| Access HOPNIC `/admin` backoffice | No | No | No | Yes | Yes |
| Use privileged admin APIs under `/api/admin/*` | No | No | No | Yes | Yes |
| Approve KYC / sensitive overrides | No | No | No | Limited by policy/tooling | Yes |

## Naming rules

1. Do **not** use the word `admin` by itself in specs or UI if the scope is ambiguous.
2. Use **Organization Admin** for `b2b_admin`.
3. Use **HOPNIC Staff** or **HOPNIC Super Admin** for internal roles.
4. Treat `b2b_user` and `b2b_admin` as customer-organization roles, not internal backoffice roles.
5. Keep `staff` reserved for HOPNIC internal ops/backoffice meaning.

## Current implementation rules in this branch

- `/admin` uses `platform_role` and currently allows `staff` + `super_admin`.
- `/api/admin/*` uses privileged server-side access after checking `platform_role`.
- Company-side address/approval behavior depends on `company_members.role`.
- `__devOverrideContext()` only simulates personal vs organization context; it does **not** grant `staff` or `super_admin` access.

## Related docs

- `API_INDEX.md`
- `DATABASE_ADMIN_MANUAL.md`
- `ADMIN_MVP_ACTION_PLAN.md`
