# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

### Environment setup

Copy `.env.example` to `.env` and fill in your Supabase values.

- `SUPABASE_URL` = project URL
- `SUPABASE_KEY` = public anon key
- `SUPABASE_SECRET_KEY` = server-only secret key for privileged admin APIs

Important notes:

- `/api/admin/*` and `/admin/*` write actions require `SUPABASE_SECRET_KEY`
  (recommended) or `SUPABASE_SERVICE_KEY` (deprecated fallback).
- If the server-only key is missing, admin pages fall back to read-only mode and
  show setup warnings instead of raw 500 errors.
- Rental admin pages also expect DB migration `013_rental_access_schema.sql` to
  be applied so `rental_accesses` and `rental_access_matches` exist.
- After changing `.env`, restart `npm run dev`.

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

icon usage
Boxicon: https://icones.js.org/collection/bx
