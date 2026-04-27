# Role Matrix

Last updated: 2026-04-27
Audience: product, ops, developers, future Augment sessions

## Purpose

Canonical permission model for the project.
Use this when changing auth rules, admin gates, or docs that mention roles.

## Two role layers

| Layer | Storage | Values | Meaning |
| --- | --- | --- | --- |
| Platform role | `public.users.platform_role` | `customer`, `staff`, `super_admin` | HOPNIC internal/platform role |
| Organization role | `public.company_members.role` | `b2b_user`, `b2b_admin` | customer-company role |

## Core rule

`/admin` and `/api/admin/*` are gated by `platform_role`, not by `company_members.role`.

## Canonical labels

| Stored value | Label |
| --- | --- |
| `customer` | Customer |
| `b2b_user` | Organization Member |
| `b2b_admin` | Organization Admin |
| `staff` | HOPNIC Staff |
| `super_admin` | HOPNIC Super Admin |

## Capability matrix

| Capability | customer | b2b_user | b2b_admin | staff | super_admin |
| --- | --- | --- | --- | --- | --- |
| Storefront browsing / checkout | Yes | Yes | Yes | Yes | Yes |
| Organization purchasing context | No | Yes | Yes | Optional | Optional |
| Approve organization requests | No | No | Yes | No | No |
| Access `/admin` | No | No | No | Yes | Yes |
| Use `/api/admin/*` | No | No | No | Yes | Yes |
| Manage homepage content | No | No | No | No | Yes |
| Sensitive overrides / KYC-style actions | No | No | No | Limited by policy | Yes |

## Current implementation rules

- Most internal admin pages allow `staff` + `super_admin`.
- `/admin/home-content` is intentionally `super_admin` only.
- Customer-company roles are for organization workflows, not HOPNIC backoffice access.
- Dev context switching does not grant admin permissions by itself.

## Naming rules

1. Do not use the word `admin` ambiguously.
2. Use **Organization Admin** for `b2b_admin`.
3. Use **HOPNIC Staff** or **HOPNIC Super Admin** for internal roles.
4. Treat `staff` and `super_admin` as internal-only roles.

## Related docs

- `map.md`
- `API_INDEX.md`
- `ADMIN_MVP_ACTION_PLAN.md`
- `DATABASE_ADMIN_MANUAL.md`
