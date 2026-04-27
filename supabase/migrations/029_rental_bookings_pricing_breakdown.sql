-- 029: Add tiered pricing snapshot to rental_bookings
--
-- Customers can now be charged using months/weeks/days tiers (constants:
-- 1 month = 30 days, 1 week = 7 days). To preserve historical accuracy when
-- catalog rates later change, store the per-line breakdown alongside the
-- monthly / weekly rate snapshots used to produce it.

ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS monthly_rate      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_rate       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB        NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.rental_bookings.monthly_rate IS 'Monthly rate snapshot at the time of booking (0 when not enabled).';
COMMENT ON COLUMN public.rental_bookings.weekly_rate  IS 'Weekly rate snapshot at the time of booking (0 when not enabled).';
COMMENT ON COLUMN public.rental_bookings.pricing_breakdown IS 'Tiered duration breakdown used to produce rental_total. Shape: { totalDays, currencyCode, lines: [{ unit, count, rate, subtotal }] }.';
 