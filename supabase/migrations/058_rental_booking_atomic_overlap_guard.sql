-- Prevent double booking under concurrent requests.
--
-- The application still performs a fast pre-check for good UX, but this trigger
-- is the authoritative guard. It runs inside the same PostgreSQL transaction as
-- INSERT/UPDATE and serializes competing writes per asset/SKU with an advisory
-- transaction lock before checking for overlapping blocking bookings.

CREATE OR REPLACE FUNCTION public.rental_bookings_prevent_blocking_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('confirmed', 'picked_up') THEN
    RETURN NEW;
  END IF;

  IF NEW.end_date <= NEW.start_date THEN
    RAISE EXCEPTION 'rental booking end_date must be after start_date'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.asset_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('rental_booking_asset:' || NEW.asset_id::TEXT, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.rental_bookings rb
      WHERE rb.id <> NEW.id
        AND rb.asset_id = NEW.asset_id
        AND rb.status IN ('confirmed', 'picked_up')
        AND rb.start_date < NEW.end_date
        AND rb.end_date > NEW.start_date
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'RENTAL_BOOKING_CONFLICT'
        USING ERRCODE = '23P01',
              DETAIL = 'Selected rental period is no longer available.';
    END IF;
  ELSIF NEW.sku_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('rental_booking_sku:' || NEW.sku_id, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM public.rental_bookings rb
      WHERE rb.id <> NEW.id
        AND rb.asset_id IS NULL
        AND rb.sku_id = NEW.sku_id
        AND rb.status IN ('confirmed', 'picked_up')
        AND rb.start_date < NEW.end_date
        AND rb.end_date > NEW.start_date
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'RENTAL_BOOKING_CONFLICT'
        USING ERRCODE = '23P01',
              DETAIL = 'Selected rental period is no longer available.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_bookings_prevent_blocking_overlap
  ON public.rental_bookings;

CREATE TRIGGER rental_bookings_prevent_blocking_overlap
  BEFORE INSERT OR UPDATE OF status, asset_id, sku_id, start_date, end_date
  ON public.rental_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.rental_bookings_prevent_blocking_overlap();

COMMENT ON FUNCTION public.rental_bookings_prevent_blocking_overlap() IS
  'Atomic double-booking guard for blocking rental statuses. Uses transaction-scoped advisory locks per asset/SKU, then rejects overlapping confirmed/picked_up bookings.';