# Role Matrix

Last updated: 2026-05-11
Audience: product, ops, developers, future Augment sessions

## Purpose

Canonical permission model for the project.
Use this when changing auth rules, admin gates, or docs that mention roles.

## Two role layers

| Layer             | Storage                       | Values                             | Meaning                       |
| ----------------- | ----------------------------- | ---------------------------------- | ----------------------------- |
| Platform role     | `public.users.platform_role`  | `customer`, `staff`, `super_admin` | HOPNIC internal/platform role |
| Organization role | `public.company_members.role` | `b2b_user`, `b2b_admin`            | customer-company role         |

## Core rule

`/admin` and `/api/admin/*` are gated by `platform_role`, not by `company_members.role`.

In the current Nuxt implementation, admin pages declare route meta such as
`platformRoles: ["staff", "super_admin"]` and use `app/middleware/role.ts`.
Server admin APIs use `server/utils/admin.ts` (`requirePlatformAdmin` / `requireSuperAdmin`).

## Canonical labels

| Stored value  | Label               |
| ------------- | ------------------- |
| `customer`    | Customer            |
| `b2b_user`    | Organization Member |
| `b2b_admin`   | Organization Admin  |
| `staff`       | HOPNIC Staff        |
| `super_admin` | HOPNIC Super Admin  |

## Capability matrix

| Capability                              | customer | b2b_user | b2b_admin | staff             | super_admin |
| --------------------------------------- | -------- | -------- | --------- | ----------------- | ----------- |
| Storefront browsing / checkout          | Yes      | Yes      | Yes       | Yes               | Yes         |
| Organization purchasing context         | No       | Yes      | Yes       | Optional          | Optional    |
| Approve organization requests           | No       | No       | Yes       | No                | No          |
| Access `/admin`                         | No       | No       | No        | Yes               | Yes         |
| Use `/api/admin/*`                      | No       | No       | No        | Yes               | Yes         |
| Manage homepage content                 | No       | No       | No        | No                | Yes         |
| Sensitive overrides / KYC-style actions | No       | No       | No        | Limited by policy | Yes         |

## Current implementation rules

- Most internal admin pages allow `staff` + `super_admin`.
- `/admin/home-content` is intentionally `super_admin` only.
- Customer-company roles are for organization workflows, not HOPNIC backoffice access.
- Dev context switching does not grant admin permissions by itself.
- A user with `b2b_admin` or `b2b_user` only is still a customer for backoffice purposes.
- Local development on `http://localhost` must allow non-secure Supabase auth cookies; otherwise `/api/user` may be unauthenticated and admin route middleware will redirect.

## Operational SQL — platform roles

Use `public.users.platform_role` to grant or revoke HOPNIC backoffice access.
These changes must be made with SQL admin / service role access, not from the public client.

### Check a user's platform role

```sql
select
  au.email,
  au.id as auth_user_id,
  u.platform_role
from auth.users au
left join public.users u on u.id = au.id
where lower(au.email) = lower('hopnic.th@gmail.com');
```

### Backfill a missing public profile row

```sql
insert into public.users (id, full_name, avatar_url)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name'),
  au.raw_user_meta_data ->> 'avatar_url'
from auth.users au
where lower(au.email) = lower('hopnic.th@gmail.com')
on conflict (id) do nothing;
```

### Grant super admin

```sql
update public.users
set platform_role = 'super_admin'
where id = (
  select id from auth.users
  where lower(email) = lower('hopnic.th@gmail.com')
);
```

### Grant staff

```sql
update public.users
set platform_role = 'staff'
where id = (
  select id from auth.users
  where lower(email) = lower('staff@example.com')
);
```

### Revoke backoffice access

```sql
update public.users
set platform_role = 'customer'
where id = (
  select id from auth.users
  where lower(email) = lower('user@example.com')
);
```

## Operational SQL — organization roles

Use `public.company_members.role` for customer-company/B2B permissions.
This does not grant `/admin` access.

### Check company memberships for a user

```sql
select
  au.email,
  c.id as company_id,
  c.name as company_name,
  cm.role
from auth.users au
join public.company_members cm on cm.user_id = au.id
join public.companies c on c.id = cm.company_id
where lower(au.email) = lower('user@example.com');
```

### Add or update a company member

```sql
insert into public.company_members (user_id, company_id, role)
values (
  (select id from auth.users where lower(email) = lower('member@example.com')),
  '<COMPANY_ID>',
  'b2b_user'
)
on conflict (user_id, company_id)
do update set role = excluded.role;
```

### Promote a company member to organization admin

```sql
update public.company_members
set role = 'b2b_admin'
where user_id = (
  select id from auth.users
  where lower(email) = lower('admin@example.com')
)
and company_id = '<COMPANY_ID>';
```

### Remove a company member

```sql
delete from public.company_members
where user_id = (
  select id from auth.users
  where lower(email) = lower('member@example.com')
)
and company_id = '<COMPANY_ID>';
```

## Development troubleshooting for `/admin` redirects

If a known admin is redirected from `/admin` to `/user/account`:

1. Open `http://localhost:3000/api/user` in the same browser session.
2. Confirm `profile.id` is the expected auth user id.
3. Confirm `profile.platform_role` is `staff` or `super_admin`.
4. If `/api/user` is `401`, restart Nuxt and check Supabase cookie settings for local HTTP.
5. If `/api/user` is correct but `/admin` still redirects, restart `npm run dev`, clear localhost site data, and sign in again.

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
