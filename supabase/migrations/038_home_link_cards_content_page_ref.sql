-- 038: Link home_link_cards rows to content_pages so admin can pick from CMS.
-- Legacy rows without content_page_id remain readable and editable as before.

ALTER TABLE public.home_link_cards
  ADD COLUMN IF NOT EXISTS content_page_id UUID
    REFERENCES public.content_pages(id) ON DELETE CASCADE;

-- Relax NOT NULL on legacy text columns so admins can save with just content_page_id.
ALTER TABLE public.home_link_cards
  ALTER COLUMN title_th DROP NOT NULL,
  ALTER COLUMN title_en DROP NOT NULL,
  ALTER COLUMN description_th DROP NOT NULL,
  ALTER COLUMN description_en DROP NOT NULL,
  ALTER COLUMN image_url DROP NOT NULL,
  ALTER COLUMN link_url DROP NOT NULL;

-- Drop legacy non-empty CHECK constraints (anonymous, named by Postgres).
DO $$
DECLARE
  cons RECORD;
BEGIN
  FOR cons IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.home_link_cards'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%char_length%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.home_link_cards DROP CONSTRAINT %I',
      cons.conname
    );
  END LOOP;
END $$;

-- New row-level guard: either a content page is linked, or all legacy fields are filled.
ALTER TABLE public.home_link_cards
  ADD CONSTRAINT home_link_cards_source_present CHECK (
    content_page_id IS NOT NULL
    OR (
      title_th IS NOT NULL AND char_length(title_th) > 0
      AND title_en IS NOT NULL AND char_length(title_en) > 0
      AND description_th IS NOT NULL AND char_length(description_th) > 0
      AND description_en IS NOT NULL AND char_length(description_en) > 0
      AND image_url IS NOT NULL AND char_length(image_url) > 0
      AND link_url IS NOT NULL AND char_length(link_url) > 0
    )
  );

-- Prevent duplicate references of the same content page within a section.
CREATE UNIQUE INDEX IF NOT EXISTS home_link_cards_content_page_unique
  ON public.home_link_cards(section_key, content_page_id)
  WHERE content_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS home_link_cards_content_page_idx
  ON public.home_link_cards(content_page_id);

COMMENT ON COLUMN public.home_link_cards.content_page_id IS
  'Optional reference to content_pages. When set, the homepage card pulls title/excerpt/cover/slug live from the linked page.';

-- Drop legacy rows that are not linked to a content page. The home_link_cards
-- table is now driven entirely by content_pages references, and any unlinked
-- rows (including 014 seed data) are dead links once the CMS owns the source.
DELETE FROM public.home_link_cards WHERE content_page_id IS NULL;
