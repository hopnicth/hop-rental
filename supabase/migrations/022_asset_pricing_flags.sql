-- 022: Per-tier pricing toggles for assets
-- Adds boolean flags so admins can choose which pricing tiers (daily/weekly/monthly)
-- are exposed to the public storefront for a given asset. Existing rows
-- keep all tiers enabled by default to preserve current behaviour.

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS daily_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS weekly_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS monthly_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.assets.daily_enabled IS 'Whether the daily rate option is offered to customers.';
COMMENT ON COLUMN public.assets.weekly_enabled IS 'Whether the weekly rate option is offered to customers.';
COMMENT ON COLUMN public.assets.monthly_enabled IS 'Whether the monthly rate option is offered to customers.';
