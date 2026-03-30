-- ============================================================
-- HOPNIC — Migration 004: Catalog + Rental Booking + Asset Ledger
-- ============================================================
-- Depends on:
--   - 001_rbac_schema.sql (public.users, public.update_updated_at)
--   - 003_cart_schema.sql (public.cart_items)
--
-- Goals:
--   - Add long-term catalog tables: products, product_skus
--   - Add DB-backed rental booking table with pricing/display snapshots
--   - Add full rental asset ledger foundation
--   - Extend cart_items with discount snapshot fields without breaking
--     the current frontend runtime that still inserts only unit_price
-- ============================================================


-- ─── 1. ENUM TYPES ──────────────────────────────────────────

CREATE TYPE catalog_product_type AS ENUM ('sale', 'rental', 'hybrid');
CREATE TYPE rental_booking_status AS ENUM ('draft', 'confirmed', 'cancelled');
CREATE TYPE rental_pricing_model AS ENUM ('daily');
CREATE TYPE rental_asset_status AS ENUM (
  'available',
  'reserved',
  'out_on_rent',
  'inspection',
  'maintenance',
  'retired',
  'lost'
);
CREATE TYPE rental_asset_allocation_status AS ENUM (
  'allocated',
  'picked_up',
  'returned',
  'released',
  'cancelled'
);
CREATE TYPE rental_asset_event_type AS ENUM (
  'created',
  'status_changed',
  'allocated',
  'picked_up',
  'returned',
  'released',
  'maintenance_started',
  'maintenance_completed',
  'hub_transferred',
  'retired',
  'note'
);


-- ─── 2. CATALOG TABLES ──────────────────────────────────────

CREATE TABLE public.products (
  id                 TEXT            PRIMARY KEY,
  slug               TEXT            NOT NULL UNIQUE,
  type               catalog_product_type NOT NULL,
  name_th            TEXT            NOT NULL,
  name_en            TEXT            NOT NULL,
  name_cn            TEXT,
  name_jp            TEXT,
  description_th     TEXT            NOT NULL,
  description_en     TEXT            NOT NULL,
  description_cn     TEXT,
  description_jp     TEXT,
  category_keys      TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  brand              TEXT,
  thumbnail_url      TEXT,
  image_urls         TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  spec               JSONB           NOT NULL DEFAULT '{}'::JSONB,
  documents          JSONB           NOT NULL DEFAULT '{}'::JSONB,
  supplier_ids       TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  rental_min_days    INTEGER         NOT NULL DEFAULT 1 CHECK (rental_min_days > 0),
  rental_max_days    INTEGER         NOT NULL DEFAULT 0 CHECK (rental_max_days >= 0),
  rental_buffer_days INTEGER         NOT NULL DEFAULT 0 CHECK (rental_buffer_days >= 0),
  store_location_ids TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  view_count         INTEGER         NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  add_to_cart_count  INTEGER         NOT NULL DEFAULT 0 CHECK (add_to_cart_count >= 0),
  order_count        INTEGER         NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  rental_count       INTEGER         NOT NULL DEFAULT 0 CHECK (rental_count >= 0),
  wishlist_count     INTEGER         NOT NULL DEFAULT 0 CHECK (wishlist_count >= 0),
  avg_rating         NUMERIC(4,2)    NOT NULL DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
  review_count       INTEGER         NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  return_rate        NUMERIC(5,2)    NOT NULL DEFAULT 0 CHECK (return_rate >= 0 AND return_rate <= 100),
  trending_score     NUMERIC(12,2)   NOT NULL DEFAULT 0,
  last_sold_at       TIMESTAMPTZ,
  last_rented_at     TIMESTAMPTZ,
  is_hidden          BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CHECK (char_length(id) > 0),
  CHECK (char_length(slug) > 0),
  CHECK (rental_max_days = 0 OR rental_max_days >= rental_min_days)
);

COMMENT ON TABLE public.products IS 'Catalog product shell with localized content, shared media, and merchandising metadata.';
COMMENT ON COLUMN public.products.type IS 'Commercial capability: sale, rental, or hybrid.';
COMMENT ON COLUMN public.products.image_urls IS 'Product-level image album. SKU-level album may override per variant.';
COMMENT ON COLUMN public.products.documents IS 'Localized document bundle (manual, datasheet, catalog) stored as JSONB.';


CREATE TABLE public.product_skus (
  id                 TEXT            PRIMARY KEY,
  product_id         TEXT            NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label_th           TEXT            NOT NULL,
  label_en           TEXT            NOT NULL,
  label_cn           TEXT,
  label_jp           TEXT,
  image_url          TEXT,
  image_urls         TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
  attributes         JSONB           NOT NULL DEFAULT '{}'::JSONB,
  price              NUMERIC(12,2)   NOT NULL CHECK (price >= 0),
  original_price     NUMERIC(12,2)   CHECK (original_price IS NULL OR original_price >= price),
  discount_percent   INTEGER         NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  rental_deposit     NUMERIC(12,2)   NOT NULL DEFAULT 0 CHECK (rental_deposit >= 0),
  rental_daily       NUMERIC(12,2)   NOT NULL DEFAULT 0 CHECK (rental_daily >= 0),
  rental_weekly      NUMERIC(12,2)   NOT NULL DEFAULT 0 CHECK (rental_weekly >= 0),
  rental_monthly     NUMERIC(12,2)   NOT NULL DEFAULT 0 CHECK (rental_monthly >= 0),
  stock              INTEGER         NOT NULL DEFAULT 0 CHECK (stock >= 0),
  rental_stock       INTEGER         NOT NULL DEFAULT 0 CHECK (rental_stock >= 0),
  reserved_stock     INTEGER         NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0 AND reserved_stock <= rental_stock),
  created_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CHECK (char_length(id) > 0),
  UNIQUE (product_id, id)
);

COMMENT ON TABLE public.product_skus IS 'Catalog SKU/variant rows. Own pricing, stock, discount, and SKU-specific media.';
COMMENT ON COLUMN public.product_skus.stock IS 'Sale stock counter for the SKU.';
COMMENT ON COLUMN public.product_skus.rental_stock IS 'Transitional rental stock counter before physical asset allocation is fully authoritative.';
COMMENT ON COLUMN public.product_skus.image_urls IS 'SKU-level image album used to override product gallery when selected.';


-- ─── 3. CART SNAPSHOT PATCH ─────────────────────────────────

ALTER TABLE public.cart_items
  ADD COLUMN original_unit_price NUMERIC(12,2),
  ADD COLUMN discount_percent INTEGER;

UPDATE public.cart_items
SET
  original_unit_price = unit_price,
  discount_percent = 0
WHERE original_unit_price IS NULL
   OR discount_percent IS NULL;

ALTER TABLE public.cart_items
  ALTER COLUMN original_unit_price SET NOT NULL,
  ALTER COLUMN discount_percent SET DEFAULT 0,
  ALTER COLUMN discount_percent SET NOT NULL,
  ADD CONSTRAINT cart_items_discount_percent_check CHECK (discount_percent >= 0 AND discount_percent <= 100);

COMMENT ON COLUMN public.cart_items.original_unit_price IS 'Snapshot of pre-discount unit price at time of add. Falls back to unit_price for legacy inserts.';
COMMENT ON COLUMN public.cart_items.discount_percent IS 'Snapshot of percentage discount applied at time of add.';

CREATE OR REPLACE FUNCTION public.cart_items_apply_pricing_snapshot_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.original_unit_price := COALESCE(NEW.original_unit_price, NEW.unit_price);
  NEW.discount_percent := COALESCE(NEW.discount_percent, 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_cart_items_pricing_snapshot_defaults
  BEFORE INSERT OR UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.cart_items_apply_pricing_snapshot_defaults();


-- ─── 4. RENTAL COMMERCIAL TABLE ─────────────────────────────

CREATE TABLE public.rental_bookings (
  id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID                 NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id       TEXT                 NOT NULL,
  sku_id           TEXT                 NOT NULL,
  hub_id           TEXT,
  product_name     TEXT                 NOT NULL,
  thumbnail        TEXT,
  hub_name         TEXT,
  start_date       DATE                 NOT NULL,
  end_date         DATE                 NOT NULL,
  rental_days      INTEGER              NOT NULL CHECK (rental_days > 0),
  pricing_model    rental_pricing_model NOT NULL DEFAULT 'daily',
  currency_code    TEXT                 NOT NULL DEFAULT 'THB' CHECK (char_length(currency_code) = 3),
  daily_rate       NUMERIC(12,2)        NOT NULL CHECK (daily_rate >= 0),
  rental_total     NUMERIC(12,2)        NOT NULL CHECK (rental_total >= 0),
  deposit_amount   NUMERIC(12,2)        NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  status           rental_booking_status NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CHECK (end_date >= start_date),
  FOREIGN KEY (product_id, sku_id)
    REFERENCES public.product_skus(product_id, id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.rental_bookings IS 'Commercial rental booking records with display and pricing snapshots preserved on the row.';
COMMENT ON COLUMN public.rental_bookings.product_name IS 'Snapshot of localized product name shown to the user when booking was made.';
COMMENT ON COLUMN public.rental_bookings.daily_rate IS 'Snapshot of the daily rental rate used for the calculation.';


-- ─── 5. RENTAL ASSET LEDGER TABLES ──────────────────────────

CREATE TABLE public.rental_assets (
  id               UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code       TEXT                NOT NULL UNIQUE,
  sku_id           TEXT                NOT NULL REFERENCES public.product_skus(id) ON DELETE RESTRICT,
  hub_id           TEXT,
  serial_number    TEXT UNIQUE,
  barcode          TEXT UNIQUE,
  status           rental_asset_status NOT NULL DEFAULT 'available',
  notes            TEXT,
  metadata         JSONB               NOT NULL DEFAULT '{}'::JSONB,
  created_at       TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CHECK (char_length(asset_code) > 0)
);

COMMENT ON TABLE public.rental_assets IS 'Physical rentable units tracked individually for allocation, return, inspection, and maintenance.';
COMMENT ON COLUMN public.rental_assets.asset_code IS 'Stable business-facing asset ID used by operations and future staff workflows.';


CREATE TABLE public.rental_booking_assets (
  id                UUID                           PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID                           NOT NULL REFERENCES public.rental_bookings(id) ON DELETE CASCADE,
  asset_id          UUID                           NOT NULL REFERENCES public.rental_assets(id) ON DELETE RESTRICT,
  allocation_status rental_asset_allocation_status NOT NULL DEFAULT 'allocated',
  allocated_by      UUID                           REFERENCES public.users(id) ON DELETE SET NULL,
  allocated_at      TIMESTAMPTZ                    NOT NULL DEFAULT now(),
  released_by       UUID                           REFERENCES public.users(id) ON DELETE SET NULL,
  released_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ                    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ                    NOT NULL DEFAULT now(),

  UNIQUE (booking_id, asset_id),
  CHECK (released_at IS NULL OR released_at >= allocated_at)
);

COMMENT ON TABLE public.rental_booking_assets IS 'Operational bridge between a commercial booking and the actual physical asset(s) assigned to fulfill it.';


CREATE TABLE public.rental_asset_events (
  id             UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       UUID                    NOT NULL REFERENCES public.rental_assets(id) ON DELETE CASCADE,
  booking_id     UUID                    REFERENCES public.rental_bookings(id) ON DELETE SET NULL,
  allocation_id  UUID                    REFERENCES public.rental_booking_assets(id) ON DELETE SET NULL,
  actor_user_id  UUID                    REFERENCES public.users(id) ON DELETE SET NULL,
  event_type     rental_asset_event_type NOT NULL,
  from_status    rental_asset_status,
  to_status      rental_asset_status,
  from_hub_id    TEXT,
  to_hub_id      TEXT,
  event_at       TIMESTAMPTZ             NOT NULL DEFAULT now(),
  notes          TEXT,
  metadata       JSONB                   NOT NULL DEFAULT '{}'::JSONB
);

COMMENT ON TABLE public.rental_asset_events IS 'Immutable event ledger for asset status changes, transfers, allocations, and maintenance history.';


-- ─── 6. INDEXES ─────────────────────────────────────────────

CREATE INDEX idx_products_type_visibility
  ON public.products(type, is_hidden);

CREATE INDEX idx_product_skus_product
  ON public.product_skus(product_id);

CREATE INDEX idx_rental_bookings_user_status
  ON public.rental_bookings(user_id, status);

CREATE INDEX idx_rental_bookings_sku_period
  ON public.rental_bookings(sku_id, start_date, end_date, status);

CREATE INDEX idx_rental_assets_sku_status
  ON public.rental_assets(sku_id, status);

CREATE INDEX idx_rental_assets_hub
  ON public.rental_assets(hub_id);

CREATE INDEX idx_rental_booking_assets_booking
  ON public.rental_booking_assets(booking_id);

CREATE INDEX idx_rental_booking_assets_asset
  ON public.rental_booking_assets(asset_id);

CREATE UNIQUE INDEX idx_rental_booking_assets_asset_active
  ON public.rental_booking_assets(asset_id)
  WHERE released_at IS NULL
    AND allocation_status IN ('allocated', 'picked_up');

CREATE INDEX idx_rental_asset_events_asset_time
  ON public.rental_asset_events(asset_id, event_at DESC);

CREATE INDEX idx_rental_asset_events_booking_time
  ON public.rental_asset_events(booking_id, event_at DESC);


-- ─── 7. UPDATED_AT TRIGGERS ─────────────────────────────────

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_product_skus_updated_at
  BEFORE UPDATE ON public.product_skus
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_bookings_updated_at
  BEFORE UPDATE ON public.rental_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_assets_updated_at
  BEFORE UPDATE ON public.rental_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_rental_booking_assets_updated_at
  BEFORE UPDATE ON public.rental_booking_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ─── 8. INTEGRITY HELPERS ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_rental_booking_asset_sku_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_sku_id TEXT;
  asset_sku_id   TEXT;
BEGIN
  SELECT sku_id INTO booking_sku_id
  FROM public.rental_bookings
  WHERE id = NEW.booking_id;

  SELECT sku_id INTO asset_sku_id
  FROM public.rental_assets
  WHERE id = NEW.asset_id;

  IF booking_sku_id IS NULL OR asset_sku_id IS NULL THEN
    RAISE EXCEPTION 'Booking or asset missing for rental allocation';
  END IF;

  IF booking_sku_id <> asset_sku_id THEN
    RAISE EXCEPTION 'Allocated asset SKU (%) does not match booking SKU (%)', asset_sku_id, booking_sku_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_rental_booking_asset_sku_match
  BEFORE INSERT OR UPDATE ON public.rental_booking_assets
  FOR EACH ROW EXECUTE FUNCTION public.ensure_rental_booking_asset_sku_match();


-- ─── 9. ROW LEVEL SECURITY ─────────────────────────────────

ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_skus          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_bookings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_booking_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_asset_events   ENABLE ROW LEVEL SECURITY;

-- Public catalog read policies.
CREATE POLICY "products_select_public"
  ON public.products FOR SELECT
  USING (is_hidden = FALSE);

CREATE POLICY "product_skus_select_public"
  ON public.product_skus FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.products
      WHERE products.id = product_skus.product_id
        AND products.is_hidden = FALSE
    )
  );

-- Rental bookings are customer-owned.
CREATE POLICY "rental_bookings_select_own"
  ON public.rental_bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "rental_bookings_insert_own"
  ON public.rental_bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rental_bookings_update_own"
  ON public.rental_bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rental_bookings_delete_own"
  ON public.rental_bookings FOR DELETE
  USING (auth.uid() = user_id);

-- Operational asset tables intentionally have no end-user policies yet.
-- They are service/admin-managed until staff workflows are implemented.