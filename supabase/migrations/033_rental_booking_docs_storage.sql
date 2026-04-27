-- 033: Track storage bucket + path for rental_booking_documents so admin uploads
-- can be deleted from storage when their DB row is removed.
-- Also adds booker_name + booker_phone to rental_bookings for contact info.

ALTER TABLE public.rental_booking_documents
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path   TEXT;

COMMENT ON COLUMN public.rental_booking_documents.storage_bucket IS
  'Storage bucket where the uploaded file lives (e.g. catalog-media).';
COMMENT ON COLUMN public.rental_booking_documents.storage_path IS
  'Object path inside storage_bucket; used for clean deletion.';

CREATE INDEX IF NOT EXISTS idx_rental_booking_documents_booking
  ON public.rental_booking_documents(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_booking_checklists_booking
  ON public.rental_booking_checklists(booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rental_booking_checklist_items_checklist
  ON public.rental_booking_checklist_items(booking_checklist_id, sort_order);

-- ─── Booker contact info on rental bookings ───────────────────────
ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS booker_name  TEXT,
  ADD COLUMN IF NOT EXISTS booker_phone TEXT;

COMMENT ON COLUMN public.rental_bookings.booker_name IS
  'Contact name of the person making the rental booking (required at submission).';
COMMENT ON COLUMN public.rental_bookings.booker_phone IS
  'Contact phone of the person making the rental booking (required at submission).';
