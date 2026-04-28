-- 047: Attach public content pages to typed main categories.
-- Enables category filters for /services, /blog, /reviews, and /promotions.

ALTER TABLE public.content_pages
  ADD COLUMN IF NOT EXISTS main_category_key TEXT
  REFERENCES public.main_categories(key)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_pages_type_main_category
  ON public.content_pages(content_type, main_category_key, is_active, sort_order);

COMMENT ON COLUMN public.content_pages.main_category_key IS
  'Optional category key from main_categories. Valid entity_types are enforced by the admin/API layer per content_type.';
