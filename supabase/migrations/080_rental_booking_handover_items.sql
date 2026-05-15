-- 080: Rental booking handover item manifest foundation.
-- Booking-level operational item list prepared before pickup and reused by POS V2 later.
-- This does not replace generic checklist templates/checklists or legacy POS validation.

CREATE TYPE public.rental_booking_handover_return_status AS ENUM (
  'pending',
  'returned_complete',
  'returned_partial',
  'missing',
  'damaged'
);

CREATE TABLE public.rental_booking_handover_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,

  item_name TEXT NOT NULL,
  quantity_prepared NUMERIC(12,2) NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  preparation_note TEXT,

  pickup_checked BOOLEAN NOT NULL DEFAULT FALSE,
  quantity_handed_over NUMERIC(12,2),
  pickup_checked_at TIMESTAMPTZ,
  pickup_checked_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  pickup_note TEXT,

  return_status public.rental_booking_handover_return_status NOT NULL DEFAULT 'pending',
  quantity_returned NUMERIC(12,2),
  return_checked_at TIMESTAMPTZ,
  return_checked_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  return_note TEXT,

  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT rental_booking_handover_items_name_chk
    CHECK (char_length(trim(item_name)) > 0),
  CONSTRAINT rental_booking_handover_items_qty_prepared_chk
    CHECK (quantity_prepared > 0),
  CONSTRAINT rental_booking_handover_items_qty_handed_over_chk
    CHECK (quantity_handed_over IS NULL OR quantity_handed_over >= 0),
  CONSTRAINT rental_booking_handover_items_qty_returned_chk
    CHECK (quantity_returned IS NULL OR quantity_returned >= 0)
);

COMMENT ON TABLE public.rental_booking_handover_items IS
  'Booking-level handover/return item manifest prepared before pickup and reused by POS V2 pickup/return flows.';
COMMENT ON COLUMN public.rental_booking_handover_items.asset_id IS
  'Optional formal rental asset link. Accessory/free-text operational rows may leave this NULL.';
COMMENT ON COLUMN public.rental_booking_handover_items.deleted_at IS
  'Soft-delete marker. Phase 1 APIs only soft-delete rows before pickup.';

CREATE INDEX idx_rental_booking_handover_items_booking_sort
  ON public.rental_booking_handover_items(booking_id, deleted_at, sort_order);

CREATE INDEX idx_rental_booking_handover_items_pickup_checked
  ON public.rental_booking_handover_items(booking_id, pickup_checked);

CREATE INDEX idx_rental_booking_handover_items_return_status
  ON public.rental_booking_handover_items(booking_id, return_status);

CREATE INDEX idx_rental_booking_handover_items_asset
  ON public.rental_booking_handover_items(asset_id)
  WHERE asset_id IS NOT NULL;

CREATE TRIGGER set_rental_booking_handover_items_updated_at
  BEFORE UPDATE ON public.rental_booking_handover_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.rental_booking_handover_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.rental_booking_handover_items TO service_role;
